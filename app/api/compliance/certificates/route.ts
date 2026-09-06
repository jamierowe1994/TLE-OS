import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAnyCapability, whoIs } from "@/lib/admin";
import { pendingKeyFor } from "@/lib/property-match";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { rexWriteBlockedBecause, writeCertificateToRex } from "@/lib/plc-rex";
import { refreshComplianceBook } from "@/lib/compliance-cache";

/**
 * Certificates that arrive outside a PLC pack - the backlog (5 Sep 2026).
 *
 * James downloads them out of Propoly a batch at a time; each one is read,
 * matched to its REX property, and posted here with what was read. The OS
 * stores the file and writes the compliance entry into REX through the same
 * gated path the pack uses, and records what REX said so a refused one can
 * be written again without a second upload.
 *
 *   GET  /api/compliance/certificates?property=<id>   → what is held, and how REX took it
 *   POST /api/compliance/certificates   multipart: file, propertyId, type, expiry, issue?, propertyName?, source?
 *   POST /api/compliance/certificates?retry=<id>      → write an existing one to REX again
 *
 * Owner or the compliance role.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = new Set([
  "gas_safety", "eicr", "epc", "mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license",
  "legionella_risk_assessment", "portable_appliance_testing", "smoke_alarms", "co_alarms", "emergency_lighting_fire_exit",
]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** No certificate on this book carries a date outside these years; anything else is a misread. */
const PLAUSIBLE = (v: string) => YMD.test(v) && v >= "2000-01-01" && v <= "2045-12-31";

/**
 * REX's type → the OS's certificate key, so the file lands in the SAME vault
 * folder the Compliance drawer already lists (documents/compliance-<property>-
 * <key>/…). One place per property per certificate, whether it arrived by a
 * drop here, an upload on the drawer, or a pack.
 */
const CERT_KEY: Record<string, string> = {
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

interface Row extends Record<string, unknown> {
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

const ymd = (v: Date | string | null) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
const out = (r: Row) => ({
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

async function gate(req: NextRequest) {
  return requireAnyCapability(req, ["manage:switches", "see:agent-compliance"]);
}

async function writeOne(r: Row, provenance: string, req_refresh = false): Promise<Row> {
  /* Held against an address REX does not know yet: kept here, written the
     day the property exists (POST /api/property-file/link). */
  if (r.property_id.startsWith("pending-")) {
    const rows = await q<Row>(`UPDATE os_certificates SET rex_note = $2, rex_at = NOW() WHERE id = $1 RETURNING *`, [r.id, "Held against the address until it has a REX property."]);
    return rows[0];
  }
  const blocked = await rexWriteBlockedBecause();
  const w = blocked
    ? { ok: false, note: blocked, entryId: undefined as string | undefined }
    : await writeCertificateToRex({ propertyId: r.property_id, type: r.type_id, expiry: ymd(r.expiry) as string, issue: ymd(r.issue), key: r.r2_key, name: r.name, provenance, existingEntryId: r.rex_entry_id || null });
  /* A refused UPDATE keeps the entry id: the entry exists in REX, only its
     file is missing, and forgetting the id would make the next retry create
     a second one. */
  const rows = await q<Row>(
    `UPDATE os_certificates SET rex_entry_id = $2, rex_note = $3, rex_at = NOW() WHERE id = $1 RETURNING *`,
    [r.id, w.ok ? w.entryId ?? "" : r.rex_entry_id || null, w.note]
  );
  /* No book refresh here: the backlog writes hundreds in a row and each
     refresh walks REX for every property. The tracker refreshes itself
     within the hour, and the batch runner asks for one at the end. */
  if (w.ok && req_refresh) void refreshComplianceBook().catch(() => null);
  return rows[0];
}

export async function GET(req: NextRequest) {
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, certificates: [] });
  const property = req.nextUrl.searchParams.get("property");
  const rows = property
    ? await q<Row>(`SELECT * FROM os_certificates WHERE property_id = $1 ORDER BY added_at DESC`, [property])
    : await q<Row>(`SELECT * FROM os_certificates ORDER BY added_at DESC LIMIT 500`);
  return NextResponse.json({ ok: true, stored: true, blocked: await rexWriteBlockedBecause(), certificates: rows.map(out) });
}

export async function POST(req: NextRequest) {
  /* Filing a certificate is anyone's job - an agent on a listing, Kirstie on
     a deal - so any signed-in person may. Reading the whole list is not. */
  const { actor } = await whoIs(req);
  const me = actor;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const by = me.name || me.email;

  const retry = req.nextUrl.searchParams.get("retry");
  if (retry) {
    let rows = await q<Row>(`SELECT * FROM os_certificates WHERE id = $1`, [retry]);
    if (!rows[0]) return NextResponse.json({ ok: false, error: "No such certificate." }, { status: 404 });
    /* A corrected date travels with the retry (6 Sep: the small reader gave
       1905 and 1994 on a handful, the bigger one read them right). The
       stored row is put right first, then REX is brought up to it. */
    const fix = (await req.json().catch(() => null)) as { expiry?: string; issue?: string } | null;
    if (fix?.expiry || fix?.issue) {
      if (fix.expiry && !PLAUSIBLE(fix.expiry)) return NextResponse.json({ ok: false, error: "expiry must be YYYY-MM-DD between 2000 and 2045." }, { status: 400 });
      if (fix.issue && !YMD.test(fix.issue)) return NextResponse.json({ ok: false, error: "issue must be YYYY-MM-DD." }, { status: 400 });
      rows = await q<Row>(`UPDATE os_certificates SET expiry = COALESCE($2, expiry), issue = COALESCE($3, issue) WHERE id = $1 RETURNING *`, [retry, fix.expiry ?? null, fix.issue ?? null]);
    }
    const r = await writeOne(rows[0], `Written by TLE OS from ${rows[0].source || "a dropped file"} (${rows[0].name}).`, req.nextUrl.searchParams.get("refresh") === "1");
    return NextResponse.json({ ok: true, certificate: out(r) });
  }

  if (!r2Configured) return NextResponse.json({ ok: false, error: "File storage isn't configured here, so the certificate cannot be kept." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected a file and its facts as a form." }, { status: 400 });
  const file = form.get("file");
  /* No REX property yet (a market appraisal, say): the address is the key,
     and the file waits there for the property. */
  const address = String(form.get("address") ?? "").trim().slice(0, 200);
  const propertyId = String(form.get("propertyId") ?? "").trim() || (address ? pendingKeyFor(address) : "");
  const type = String(form.get("type") ?? "").trim();
  const expiry = String(form.get("expiry") ?? "").trim();
  const issueRaw = String(form.get("issue") ?? "").trim();
  const propertyName = (String(form.get("propertyName") ?? "").trim() || address).slice(0, 200);
  const source = String(form.get("source") ?? "dropped file").trim().slice(0, 120);
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });
  if (!/^(\d+|pending-[a-z0-9-]+)$/.test(propertyId)) return NextResponse.json({ ok: false, error: "propertyId must be the REX property id, or give an address." }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ ok: false, error: `type must be one of ${[...TYPES].join(", ")}.` }, { status: 400 });
  if (!PLAUSIBLE(expiry)) return NextResponse.json({ ok: false, error: "expiry must be YYYY-MM-DD between 2000 and 2045." }, { status: 400 });
  if (issueRaw && !YMD.test(issueRaw)) return NextResponse.json({ ok: false, error: "issue must be YYYY-MM-DD." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "That file is over 25MB." }, { status: 413 });

  const id = uid();
  const name = file.name || `${type}.pdf`;
  const key = `documents/${safeName(`compliance-${propertyId}-${CERT_KEY[type] ?? type}`)}/${Date.now()}-${safeName(name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await withR2((client) =>
    client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: file.type || "application/pdf",
        Metadata: { "original-name": encodeURIComponent(name), "property-id": propertyId, source: encodeURIComponent(source) },
      })
    )
  );
  const rows = await q<Row>(
    `INSERT INTO os_certificates (id, property_id, property_name, type_id, expiry, issue, r2_key, name, source, added_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id, propertyId, propertyName, type, expiry, issueRaw || null, key, name, source, by]
  );
  const r = await writeOne(rows[0], `Written by TLE OS from ${source} (${name}).`, req.nextUrl.searchParams.get("refresh") === "1");
  return NextResponse.json({ ok: true, certificate: out(r) });
}
