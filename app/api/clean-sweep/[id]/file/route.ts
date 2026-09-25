import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { isFactKey, sweepDetail } from "@/lib/clean-sweep";
import { recordFact } from "@/lib/property-facts";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";

/**
 * A paper the checker found, filed against a home's column: into R2 under
 * documents/property-<id>/<field>/, the same folder REX PM's and Propoly's
 * copies sit in, and the column marked as held by hand. PDFs and photos only,
 * the rules every piece of evidence in the OS keeps (the document scope).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:clean-sweep")) return NextResponse.json({ ok: false, error: "The clean sweep is for the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 }); }
  const file = form.get("file");
  const field = String(form.get("field") ?? "");
  if (!isFactKey(field)) return NextResponse.json({ ok: false, error: "That is not one of the columns." }, { status: 400 });
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  const scope = SCOPES.document;
  if (file.size > scope.maxBytes) return NextResponse.json({ ok: false, error: `That file is over ${scope.maxBytes / 1024 / 1024}MB.` }, { status: 413 });
  if (!(scope.types as readonly string[]).includes(file.type)) return NextResponse.json({ ok: false, error: "Only a PDF or a photo can go here." }, { status: 415 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });

  const prefix = `documents/property-${id}/${field}/`;
  const key = `${prefix}manual-${Date.now()}-${safeName(file.name)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await withR2((c) => c.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type, Metadata: { "original-name": encodeURIComponent(file.name), source: "manual" } })));
  } catch {
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }
  const by = actor.name || actor.email;
  const detail = await sweepDetail(id);
  const count = detail?.facts.find((f) => f.key === field)?.files.length ?? 1;
  await recordFact({ propertyId: id, field, value: `${count} file${count === 1 ? "" : "s"}`, fileKey: prefix, source: "manual", by });
  await q(`UPDATE os_property_facts SET verified_at = NOW(), verified_by = $3 WHERE property_id = $1 AND field = $2`, [id, field, by]);
  return NextResponse.json({ ok: true, ...(await sweepDetail(id)) });
}
