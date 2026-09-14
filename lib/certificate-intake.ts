import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { R2_BUCKET, safeName, withR2 } from "@/lib/r2";
import { rexWriteBlockedBecause, writeCertificateToRex } from "@/lib/plc-rex";
import { refreshComplianceBook } from "@/lib/compliance-cache";
import { shareCertificate, type SharePerson, type ShareResult } from "@/lib/certificate-share";

/**
 * FILING A CERTIFICATE. One path, whichever door it came in by.
 *
 * This was inside app/api/compliance/certificates/route.ts, which was fine
 * while that route was the only door. On 14 Sep 2026 the contractor's own page
 * became a second one, and a second copy of "store the bytes, insert the row,
 * write the entry into REX, tell everyone entitled to it" is a second place
 * for the REX write to drift. So it lives here and both routes call it.
 *
 * Three things happen, in this order, and the order matters:
 *
 *   1. THE BYTES, into R2 under the same vault folder the Compliance drawer
 *      lists, so a certificate is in one place per home per type however it
 *      arrived.
 *   2. THE ROW, into os_certificates. This is the OS's own record and it
 *      stands whether or not REX takes it.
 *   3. REX, then the people. Both gated, both allowed to fail, neither able
 *      to undo 1 and 2 - a certificate we hold and REX refused is a retry;
 *      a certificate we lost because an inbox bounced is gone.
 */

/** REX's compliance type vocabulary. Anything else is not a certificate we file. */
export const CERT_TYPES = new Set([
  "gas_safety", "eicr", "epc", "mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license",
  "legionella_risk_assessment", "portable_appliance_testing", "smoke_alarms", "co_alarms", "emergency_lighting_fire_exit",
]);

export const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** No certificate on this book carries a date outside these years; anything else is a misread. */
export const PLAUSIBLE = (v: string) => YMD.test(v) && v >= "2000-01-01" && v <= "2045-12-31";

/**
 * REX's type → the OS's certificate key, so the file lands in the SAME vault
 * folder the Compliance drawer already lists (documents/compliance-<property>-
 * <key>/…). One place per property per certificate, whether it arrived by a
 * drop on the backlog, an upload on the drawer, a pack, or the contractor.
 */
export const CERT_KEY: Record<string, string> = {
  gas_safety: "gas",
  eicr: "eicr",
  epc: "epc",
  mandatory_hmo_license: "licence",
  additional_hmo_license: "licence",
  selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella",
  portable_appliance_testing: "pat",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
  emergency_lighting_fire_exit: "fire",
};

export interface CertRow extends Record<string, unknown> {
  id: string;
  property_id: string;
  property_name: string;
  type_id: string;
  expiry: Date | string;
  issue: Date | string | null;
  r2_key: string;
  name: string;
  source: string;
  added_by: string;
  added_at: Date;
  rex_entry_id: string | null;
  rex_note: string;
  rex_at: Date | null;
}

export const ymd = (v: Date | string | null) =>
  v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null;

export const outCert = (r: CertRow) => ({
  id: r.id,
  propertyId: r.property_id,
  propertyName: r.property_name,
  type: r.type_id,
  expiry: ymd(r.expiry),
  issue: ymd(r.issue),
  name: r.name,
  source: r.source,
  addedBy: r.added_by,
  addedAt: new Date(r.added_at).toISOString(),
  rex: { entryId: r.rex_entry_id, note: r.rex_note, at: r.rex_at ? new Date(r.rex_at).toISOString() : null, ok: Boolean(r.rex_entry_id) },
});

/**
 * Into REX's compliance tab, with the file and the expiry.
 *
 * Unchanged from where it lived before: a property REX does not know yet is
 * held, a home REX CRM has no property for is the OS's own record, and a
 * refused UPDATE keeps its entry id so the next retry does not create a twin.
 */
export async function writeCertificateRow(r: CertRow, provenance: string, wantRefresh = false): Promise<CertRow> {
  /* Held against an address REX does not know yet: kept here, written the
     day the property exists (POST /api/property-file/link). */
  if (r.property_id.startsWith("pending-")) {
    const rows = await q<CertRow>(`UPDATE os_certificates SET rex_note = $2, rex_at = NOW() WHERE id = $1 RETURNING *`, [r.id, "Held against the address until it has a REX property."]);
    return rows[0];
  }
  /* A home REX CRM does not hold (6 Sep: the OS carries every REX PM home,
     linked or not): the OS is its record, and there is nothing in REX to write. */
  if (/^pm-/i.test(r.property_id)) {
    const rows = await q<CertRow>(`UPDATE os_certificates SET rex_note = $2, rex_at = NOW() WHERE id = $1 RETURNING *`, [r.id, "Not on REX: this home has no REX property, so the OS holds the certificate."]);
    return rows[0];
  }
  const blocked = await rexWriteBlockedBecause();
  const w = blocked
    ? { ok: false, note: blocked, entryId: undefined as string | undefined }
    : await writeCertificateToRex({ propertyId: r.property_id, type: r.type_id, expiry: ymd(r.expiry) as string, issue: ymd(r.issue), key: r.r2_key, name: r.name, provenance, existingEntryId: r.rex_entry_id || null });
  /* A refused UPDATE keeps the entry id: the entry exists in REX, only its
     file is missing, and forgetting the id would make the next retry create
     a second one. */
  const rows = await q<CertRow>(
    `UPDATE os_certificates SET rex_entry_id = $2, rex_note = $3, rex_at = NOW() WHERE id = $1 RETURNING *`,
    [r.id, w.ok ? w.entryId ?? "" : r.rex_entry_id || null, w.note]
  );
  /* No book refresh by default: the backlog writes hundreds in a row and each
     refresh walks REX for every property. The tracker refreshes itself within
     the hour, and the batch runner asks for one at the end. */
  if (w.ok && wantRefresh) void refreshComplianceBook().catch(() => null);
  return rows[0];
}

/**
 * Everyone entitled to this certificate gets it, and the compliance inbox gets
 * the proof. Awaited rather than fired and forgotten: whoever just filed it
 * should be told on the same screen whether the landlord and tenant have it,
 * and a promise left running past the response is one the runtime may kill
 * mid-send. Never fails the filing.
 */
export async function shareCertificateRow(r: CertRow, people: SharePerson[] = []): Promise<ShareResult | null> {
  return shareCertificate(
    {
      id: r.id,
      propertyId: r.property_id,
      propertyName: r.property_name,
      typeId: r.type_id,
      expiry: ymd(r.expiry) ?? "",
      r2Key: r.r2_key,
      name: r.name,
      source: r.source,
    },
    people
  ).catch(() => null);
}

export interface FileCertificate {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  propertyId: string;
  propertyName: string;
  /** A REX compliance type id. Checked against CERT_TYPES by the caller. */
  type: string;
  /** YYYY-MM-DD. */
  expiry: string;
  issue?: string | null;
  /** Where it came from, kept on the record: "the contractor's page", "emailed by the landlord". */
  source: string;
  by: string;
  /** People the managed book cannot name - the contractor, a works order's own landlord and tenant. */
  people?: SharePerson[];
  refreshBook?: boolean;
}

/**
 * Store it, write it to REX, send it on. The whole of filing a certificate.
 *
 * The same file filed twice on the same home (6 Sep: thirty rooms each
 * carrying the house's EICR) is one certificate, not thirty - and a duplicate
 * returns early WITHOUT a second fan-out, so nobody is emailed the same
 * certificate again because somebody pressed upload twice.
 */
export async function fileCertificate(input: FileCertificate): Promise<{ row: CertRow; duplicate: boolean; share: ShareResult | null }> {
  const twin = await q<CertRow>(
    `SELECT * FROM os_certificates WHERE property_id = $1 AND type_id = $2 AND name = $3 AND expiry = $4 ORDER BY added_at LIMIT 1`,
    [input.propertyId, input.type, input.fileName, input.expiry]
  );
  if (twin[0]) return { row: twin[0], duplicate: true, share: null };

  const id = uid();
  const key = `documents/${safeName(`compliance-${input.propertyId}-${CERT_KEY[input.type] ?? input.type}`)}/${Date.now()}-${safeName(input.fileName)}`;
  await withR2((client) =>
    client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: input.bytes,
        ContentType: input.contentType || "application/pdf",
        Metadata: { "original-name": encodeURIComponent(input.fileName), "property-id": input.propertyId, source: encodeURIComponent(input.source) },
      })
    )
  );
  const rows = await q<CertRow>(
    `INSERT INTO os_certificates (id, property_id, property_name, type_id, expiry, issue, r2_key, name, source, added_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id, input.propertyId, input.propertyName, input.type, input.expiry, input.issue || null, key, input.fileName, input.source, input.by]
  );
  const row = await writeCertificateRow(rows[0], `Written by TLE OS from ${input.source} (${input.fileName}).`, input.refreshBook === true);
  return { row, duplicate: false, share: await shareCertificateRow(row, input.people ?? []) };
}
