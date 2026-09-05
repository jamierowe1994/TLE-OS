import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAnyCapability } from "@/lib/admin";
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

async function writeOne(r: Row, provenance: string): Promise<Row> {
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
  if (w.ok) void refreshComplianceBook().catch(() => null);
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
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const by = me.name || me.email;

  const retry = req.nextUrl.searchParams.get("retry");
  if (retry) {
    const rows = await q<Row>(`SELECT * FROM os_certificates WHERE id = $1`, [retry]);
    if (!rows[0]) return NextResponse.json({ ok: false, error: "No such certificate." }, { status: 404 });
    const r = await writeOne(rows[0], `Written by TLE OS from ${rows[0].source || "a dropped file"} (${rows[0].name}).`);
    return NextResponse.json({ ok: true, certificate: out(r) });
  }

  if (!r2Configured) return NextResponse.json({ ok: false, error: "File storage isn't configured here, so the certificate cannot be kept." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected a file and its facts as a form." }, { status: 400 });
  const file = form.get("file");
  const propertyId = String(form.get("propertyId") ?? "").trim();
  const type = String(form.get("type") ?? "").trim();
  const expiry = String(form.get("expiry") ?? "").trim();
  const issueRaw = String(form.get("issue") ?? "").trim();
  const propertyName = String(form.get("propertyName") ?? "").trim().slice(0, 200);
  const source = String(form.get("source") ?? "dropped file").trim().slice(0, 120);
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });
  if (!/^\d+$/.test(propertyId)) return NextResponse.json({ ok: false, error: "propertyId must be the REX property id." }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ ok: false, error: `type must be one of ${[...TYPES].join(", ")}.` }, { status: 400 });
  if (!YMD.test(expiry)) return NextResponse.json({ ok: false, error: "expiry must be YYYY-MM-DD." }, { status: 400 });
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
  const r = await writeOne(rows[0], `Written by TLE OS from ${source} (${name}).`);
  return NextResponse.json({ ok: true, certificate: out(r) });
}
