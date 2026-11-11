import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { isFactKey, sweepDetail } from "@/lib/clean-sweep";
import { recordFact } from "@/lib/property-facts";
import { keyClimbs, R2_BUCKET, r2Configured, r2Problem, safeName, SCOPES, withR2 } from "@/lib/r2";
import { judgeFile } from "@/lib/upload-rules";

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
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  /* One judge for every upload route (lib/upload-rules): the refusal names
     the file and what would be taken, a .jfif is kept as the JPEG it is, and
     a file the browser gave no type goes by its extension. */
  const judged = judgeFile(file, SCOPES.document);
  if (!judged.ok) return NextResponse.json({ ok: false, error: judged.error }, { status: judged.status });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });

  const prefix = `documents/property-${id}/${field}/`;
  const key = `${prefix}manual-${Date.now()}-${safeName(judged.name)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await withR2((c) => c.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: judged.type, Metadata: { "original-name": encodeURIComponent(file.name), source: "manual" } })));
  } catch (e) {
    return NextResponse.json({ ok: false, error: r2Problem(e, `${file.name} did not reach file storage, so it was not kept. Try it again.`) }, { status: 502 });
  }
  const by = actor.name || actor.email;
  const detail = await sweepDetail(id);
  const count = detail?.facts.find((f) => f.key === field)?.files.length ?? 1;
  await recordFact({ propertyId: id, field, value: `${count} file${count === 1 ? "" : "s"}`, fileKey: prefix, source: "manual", by });
  await q(`UPDATE os_property_facts SET verified_at = NOW(), verified_by = $3 WHERE property_id = $1 AND field = $2`, [id, field, by]);
  return NextResponse.json({ ok: true, ...(await sweepDetail(id)) });
}

/**
 * Take a wrong file off a home (James, 30 Sep 2026): the checker picks the file
 * and it goes, from R2 and from the column. Only files under this home's own
 * documents folder. When the column's last file goes, a value that only said
 * "N files" goes with it, so the column reads missing again; a real value (a
 * date, a reference) stays and just loses its folder.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:clean-sweep")) return NextResponse.json({ ok: false, error: "The clean sweep is for the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { key?: string };
  const key = String(body.key ?? "");
  const home = `documents/property-${id}/`;
  const field = key.startsWith(home) ? key.slice(home.length).split("/")[0] : "";
  if (!field || !isFactKey(field) || keyClimbs(key) || key.endsWith("/")) {
    return NextResponse.json({ ok: false, error: "That file is not on this home." }, { status: 400 });
  }
  try {
    await withR2((c) => c.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })));
  } catch {
    return NextResponse.json({ ok: false, error: "The file could not be deleted. Nothing changed." }, { status: 502 });
  }
  const by = actor.name || actor.email;
  const detail = await sweepDetail(id);
  const left = detail?.facts.find((f) => f.key === field)?.files.length ?? 0;
  const countOnly = /^\d+ files?\b/i;
  const rows = await q<{ value: string | null }>(`SELECT value FROM os_property_facts WHERE property_id = $1 AND field = $2`, [id, field]);
  const value = rows[0]?.value ?? null;
  if (rows.length) {
    if (left === 0 && (!value || countOnly.test(value))) {
      await q(`DELETE FROM os_property_facts WHERE property_id = $1 AND field = $2`, [id, field]);
    } else if (left === 0) {
      await q(`UPDATE os_property_facts SET file_key = NULL, captured_at = NOW(), captured_by = $3 WHERE property_id = $1 AND field = $2`, [id, field, by]);
    } else if (value && countOnly.test(value)) {
      await q(`UPDATE os_property_facts SET value = regexp_replace(value, '^\\d+ files?', $3), captured_at = NOW(), captured_by = $4 WHERE property_id = $1 AND field = $2`,
        [id, field, `${left} file${left === 1 ? "" : "s"}`, by]);
    }
  }
  console.log(`[clean-sweep] ${by} deleted ${key}`);
  return NextResponse.json({ ok: true, ...(await sweepDetail(id)) });
}
