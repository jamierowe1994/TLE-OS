import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { R2_BUCKET, safeName, withR2 } from "@/lib/r2";
import { rexWriteBlockedBecause, writeCertificateToRex } from "@/lib/plc-rex";
import { patchHeldHome, refreshComplianceBook } from "@/lib/compliance-cache";
import { shareCertificate, type SharePerson, type ShareResult } from "@/lib/certificate-share";
import { CHECKING_LABEL, HELD_FOR_CHECK } from "@/lib/cert-hold";
import { REAL_DAY, YMD, realDayOrNull, sayDay } from "@/lib/real-day";

export { REAL_DAY, YMD, realDayOrNull, sayDay };

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
 *   3. REX. Gated, allowed to fail, never able to undo 1 and 2 - a
 *      certificate we hold and REX refused is a retry.
 *
 * And then the people - but not here any more. James, 4 Oct 2026, with
 * compliance going live: a certificate goes to the landlord and tenants only
 * once Michael has checked it. So filing keeps who the door could name on the
 * row (share_people) and stops; his Verified on the desk sends it on
 * (shareOnceChecked). Filed by the compliance office itself, it was checked as
 * it was filed, and goes on straight away.
 */

/** REX's compliance type vocabulary. Anything else is not a certificate we file. */
export const CERT_TYPES = new Set([
  "gas_safety", "eicr", "epc", "mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license",
  "legionella_risk_assessment", "portable_appliance_testing", "smoke_alarms", "co_alarms", "emergency_lighting_fire_exit",
]);

/** No certificate on this book carries a date outside these years; anything else is a misread. */
export const PLAUSIBLE = (v: string) => REAL_DAY(v) && v >= "2000-01-01" && v <= "2045-12-31";

/** Why a typed or read date will not do, in words for the person filing it. */
export function dateProblem(v: string, what: "expiry" | "issue"): string | null {
  const label = what === "expiry" ? "The date it runs out" : "The issue date";
  if (!YMD.test(v)) return `${label} needs to be a date.`;
  if (!REAL_DAY(v)) return `${label}, ${sayDay(v)}, is not a real date. Check it against the certificate and put it right.`;
  if (what === "expiry" && !PLAUSIBLE(v)) return `${label}, ${sayDay(v)}, looks wrong - it should be between 2000 and 2045.`;
  return null;
}

/**
 * Filing failed. `kept` says whether the certificate is on the home anyway, so
 * the screen can tell the person whether to upload it again.
 */
export class FilingFailed extends Error {
  constructor(message: string, readonly kept: boolean) {
    super(message);
  }
}

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
  share_people?: unknown;
  shared_at?: Date | null;
  /** Held for compliance's check (lib/cert-hold): not in REX, not counted. */
  awaiting_check?: boolean;
  /** The certificate this one was filed to replace (lib/certificate-remove). */
  replaces_id?: string | null;
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
  awaitingCheck: Boolean(r.awaiting_check),
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
    : await writeCertificateToRex({ propertyId: r.property_id, type: r.type_id, expiry: ymd(r.expiry) as string, issue: ymd(r.issue), key: r.r2_key, name: r.name, provenance, existingEntryId: r.rex_entry_id || null, replace: Boolean(r.replaces_id) });
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
  /** Filed by the compliance office: checked as it was filed, so it is ticked
   *  off their list and goes on to the landlord and tenants straight away. */
  checkedBy?: string | null;
  /** The certificate this one replaces, by id (lib/certificate-remove). */
  replacesId?: string | null;
}

/** What filing says about the send, while the certificate waits for its check. */
const waitingForCheck = (held: boolean): ShareResult => ({
  armed: false,
  skipped: "waiting for compliance to check it",
  outcomes: [],
  line: held
    ? `${CHECKING_LABEL}. It goes live, and to the landlord and tenants, once they have verified it.`
    : "Goes to the landlord and tenants once compliance has checked it.",
});

/**
 * Compliance has verified a certificate that was held for them (9 Oct 2026):
 * it stops waiting, goes into REX, and the book is refreshed so every screen
 * shows it in date. Once only - the flag is the claim.
 */
export async function releaseHeldCertificate(certificateId: string): Promise<CertRow | null> {
  const rows = await q<CertRow>(`UPDATE os_certificates SET awaiting_check = false WHERE id = $1 AND awaiting_check RETURNING *`, [certificateId]);
  if (!rows[0]) return null;
  const row = await writeCertificateRow(rows[0], `Written by TLE OS from ${rows[0].source} (${rows[0].name}), verified by compliance.`, true);
  /* In date on every tile now, not when the rebuild above lands. */
  await patchHeldHome(row.property_id).catch(() => false);
  return row;
}

/**
 * Compliance has checked it: send it on to everyone entitled to it.
 *
 * Once only. The claim on shared_at is the lock, so a double press, or a
 * Verified after a query after a Verified, never runs the fan-out twice. The
 * fan-out keeps its own gates (the switch, in date, a renewal, somebody living
 * there), so a checked certificate on an empty home still goes nowhere.
 */
export async function shareOnceChecked(certificateId: string): Promise<ShareResult | null> {
  const rows = await q<CertRow>(`UPDATE os_certificates SET shared_at = NOW() WHERE id = $1 AND shared_at IS NULL RETURNING *`, [certificateId]);
  if (!rows[0]) return null;
  const people = Array.isArray(rows[0].share_people) ? (rows[0].share_people as SharePerson[]) : [];
  return shareCertificateRow(rows[0], people);
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
  /* Every door checks the date first, but a date that is not on the calendar
     reached Postgres once (7 Oct) and failed as a bare 500; say so instead. */
  const badDate = dateProblem(input.expiry, "expiry") ?? (input.issue ? dateProblem(input.issue, "issue") : null);
  if (badDate) throw new FilingFailed(`${badDate} Nothing was kept.`, false);

  /* Up to and including the row, a failure means nothing is on the home. */
  const notKept = (step: string) => (e: unknown): never => {
    console.error(`[certificate-intake] ${step} failed for ${input.propertyId} ${input.type}:`, e);
    throw new FilingFailed(`The certificate was not kept - ${step} failed. Nothing was saved, so upload it again.`, false);
  };

  const twin = await q<CertRow>(
    `SELECT * FROM os_certificates WHERE property_id = $1 AND type_id = $2 AND name = $3 AND expiry = $4 ORDER BY added_at LIMIT 1`,
    [input.propertyId, input.type, input.fileName, input.expiry]
  ).catch(notKept("looking for a copy already on file"));
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
  ).catch(notKept("storing the file"));
  /* A gas safety record or EICR from anyone but the compliance office waits
     for their check before it goes live (lib/cert-hold): not into REX, not
     counted, until releaseHeldCertificate. */
  const held = !input.checkedBy && HELD_FOR_CHECK.has(input.type);
  /* rex_note is NOT NULL: a certificate that is not held starts with an empty
     note, never null (12 Oct: null here failed every filing that was not held
     - Michael's gas records, the agents' EPCs - from 9 Oct to 12 Oct). */
  const rows = await q<CertRow>(
    `INSERT INTO os_certificates (id, property_id, property_name, type_id, expiry, issue, r2_key, name, source, added_by, share_people, awaiting_check, rex_note, rex_at, replaces_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, CASE WHEN $12 THEN NOW() END, $14) RETURNING *`,
    [id, input.propertyId, input.propertyName, input.type, input.expiry, input.issue || null, key, input.fileName, input.source, input.by, JSON.stringify(input.people ?? []), held, held ? "Waiting for compliance to verify it before it goes into REX." : "", input.replacesId ?? null]
  ).catch(notKept("saving it on the home"));
  if (held) return { row: rows[0], duplicate: false, share: waitingForCheck(true) };

  /* From here the certificate is on the home. Nothing after this fails the
     filing: a REX write that throws is a retry from the home, and a tick
     that does not save leaves it on compliance's To verify list, whose
     Verified sends it on - once, as ever (shareOnceChecked's claim). */
  let row = rows[0];
  try {
    row = await writeCertificateRow(rows[0], `Written by TLE OS from ${input.source} (${input.fileName}).`, input.refreshBook === true);
  } catch (e) {
    console.error(`[certificate-intake] REX write for ${row.id} threw:`, e);
  }
  if (!input.checkedBy) return { row, duplicate: false, share: waitingForCheck(false) };
  /* The office filed it: their tick, and on it goes. */
  try {
    await q(
      `INSERT INTO os_compliance_checks (kind, subject_id, state, note, by_name) VALUES ('certificate', $1, 'verified', $2, $3)
       ON CONFLICT (kind, subject_id) DO NOTHING`,
      [row.id, "Filed by compliance, so checked as it was filed.", input.checkedBy]
    );
  } catch (e) {
    console.error(`[certificate-intake] tick for ${row.id} did not save:`, e);
    return {
      row,
      duplicate: false,
      share: { armed: false, skipped: "the tick did not save", outcomes: [], line: "Kept on the home. It could not be ticked as checked just now, so it is on the To verify list - verify it there to send it on." },
    };
  }
  try {
    return { row, duplicate: false, share: await shareOnceChecked(row.id) };
  } catch (e) {
    console.error(`[certificate-intake] send-on for ${row.id} failed:`, e);
    return { row, duplicate: false, share: { armed: false, skipped: "the send did not start", outcomes: [], line: "Kept on the home and ticked as checked. Sending it on to the landlord and tenants did not start." } };
  }
}
