import { NextRequest, NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { pendingKeyFor } from "@/lib/property-match";
import { listVault } from "@/lib/vault";

/**
 * POST /api/property-file/link  { address, propertyId }
 *
 * The day an address becomes a REX property, the files that were held
 * against the address move onto it: copied to the property's vault
 * folders, their OS rows re-keyed, and each one written into REX through
 * the intake's retry. Anyone signed in can do it - it is filing, not a
 * decision - and it is idempotent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { address?: string; propertyId?: string } | null;
  const address = String(body?.address ?? "").trim();
  const propertyId = String(body?.propertyId ?? "").trim();
  if (!address || !/^\d+$/.test(propertyId)) return NextResponse.json({ ok: false, error: "An address and a REX property id, please." }, { status: 400 });
  if (!hasDb() || !r2Configured) return NextResponse.json({ ok: false, error: "No vault on this environment." }, { status: 503 });

  const pendingKey = pendingKeyFor(address);
  const held = await listVault(pendingKey);
  const moved: string[] = [];
  for (const f of held) {
    const to = `documents/${safeName(`compliance-${propertyId}-${f.certKey}`)}/${f.key.split("/").pop()}`;
    await withR2((client) => client.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `${R2_BUCKET}/${f.key}`, Key: to })));
    await q(`UPDATE os_certificates SET property_id = $2, r2_key = $3 WHERE r2_key = $1`, [f.key, propertyId, to]);
    moved.push(to);
  }
  const rows = await q<{ id: string }>(`SELECT id FROM os_certificates WHERE property_id = $1 AND (rex_entry_id IS NULL OR rex_entry_id = '')`, [propertyId]);
  /* REX writes go through the intake's own retry, so the switch and the
     allowlist are honoured the same way as everywhere else. */
  const origin = req.nextUrl.origin;
  let written = 0;
  for (const r of rows) {
    const res = await fetch(`${origin}/api/compliance/certificates?retry=${encodeURIComponent(r.id)}`, { method: "POST", headers: { cookie: req.headers.get("cookie") ?? "" } }).then((x) => x.json()).catch(() => null);
    if (res?.certificate?.rex?.ok) written++;
  }
  return NextResponse.json({ ok: true, moved: moved.length, written });
}
