import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { currentLandlord, isDocKind, landlordOwnsAppraisal, recordLandlordDocument } from "@/lib/landlord-account";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { hasDb } from "@/lib/db";

/**
 * A landlord sends us a document.
 *
 * Their own route rather than /api/r2/upload, for two reasons: that one is
 * behind the staff sign-in, and it stores bytes without recording what they
 * are. This one requires the landlord's session, files the bytes under the
 * landlord's own prefix, and records the KIND - which is what lets the file
 * say "the EPC is in" and take the ask off their list.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!r2Configured) {
    return NextResponse.json({ ok: false, error: "Document storage isn't set up on this environment yet." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") ?? "other");
  const kind = isDocKind(kindRaw) ? kindRaw : "other";
  const appraisalId = String(form.get("appraisalId") ?? "").trim() || null;
  if (appraisalId && !(await landlordOwnsAppraisal(me, appraisalId))) {
    return NextResponse.json({ ok: false, error: "That property isn't on your file." }, { status: 403 });
  }

  const scope = SCOPES.document;
  if (file.size > scope.maxBytes) {
    return NextResponse.json(
      { ok: false, error: `That file is too big. Up to ${Math.round(scope.maxBytes / 1024 / 1024)}MB, please.` },
      { status: 413 }
    );
  }
  if (!(scope.types as readonly string[]).includes(file.type)) {
    return NextResponse.json({ ok: false, error: "A PDF or a photograph, please." }, { status: 415 });
  }

  const clean = safeName(file.name) || "document";
  const key = `${scope.prefix}/landlord/${me.id}/${Date.now()}-${clean}`;
  const body = new Uint8Array(await file.arrayBuffer());

  try {
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.type,
          Metadata: { "original-name": encodeURIComponent(file.name), "landlord-account": me.id, kind },
        })
      )
    );
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("[landlord/documents] R2 upload failed", err.name, err.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }

  const document = await recordLandlordDocument({
    accountId: me.id,
    appraisalId,
    kind,
    name: file.name,
    r2Key: key,
    bytes: file.size,
    contentType: file.type,
  });
  return NextResponse.json({ ok: true, document });
}
