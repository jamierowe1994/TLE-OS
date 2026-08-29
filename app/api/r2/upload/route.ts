import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  isScope,
  R2_BUCKET,
  r2Configured,
  safeName,
  SCOPES,
  withR2,
} from "@/lib/r2";

/**
 * Taking a file in.
 *
 * The file goes through the server rather than straight from the browser to a
 * presigned URL. That costs a hop, and buys the thing that matters: the server
 * is the only party that decides what may be stored. A presigned PUT hands the
 * browser a blank cheque for one key — fine for holiday snaps, not for the
 * bucket that will hold right-to-rent evidence.
 *
 * It also means no CORS rules on the bucket, which is one less public surface.
 *
 * Keys are namespaced scope/ref/timestamp-name, so:
 *   - two people uploading "photo.jpg" don't overwrite each other
 *   - everything for one record sits under one prefix
 *   - photos and documents can later take different retention rules without
 *     anything being moved
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  /* The allowlist runs BEFORE the configured check, and the order is the point.
     It used to be the other way round, which meant that on any machine without
     credentials — every developer's, and every preview — this route answered
     "storage isn't configured" to everything and the guards below were never
     once executed. A rule you cannot exercise anywhere except production is a
     rule you are hoping about.
     /api/r2/list already had it this way round and says so; this route was the
     odd one out. Nothing reaches R2 any earlier: the vault check simply sits
     immediately before the only line that needs it. */
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  const scopeRaw = String(form.get("scope") ?? "photo");
  const ref = safeName(String(form.get("ref") ?? "unfiled")) || "unfiled";

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }
  if (!isScope(scopeRaw)) {
    return NextResponse.json({ ok: false, error: "Unknown upload type." }, { status: 400 });
  }

  const scope = SCOPES[scopeRaw];

  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
  }
  if (file.size > scope.maxBytes) {
    return NextResponse.json(
      {
        ok: false,
        error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${
          scope.maxBytes / 1024 / 1024
        }MB.`,
      },
      { status: 413 }
    );
  }
  if (!(scope.types as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { ok: false, error: `${file.type || "That file type"} isn't allowed here.` },
      { status: 415 }
    );
  }

  /* Everything above this line is a decision we can make without a vault.
     Everything below needs one. */
  if (!r2Configured) {
    return NextResponse.json(
      { ok: false, error: "Storage isn't configured on this environment." },
      { status: 503 }
    );
  }

  const clean = safeName(file.name);
  const key = `${scope.prefix}/${ref}/${Date.now()}-${clean}`;
  const body = new Uint8Array(await file.arrayBuffer());

  try {
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.type,
          // The original name, kept for display without it having to survive
          // the trip through the key.
          Metadata: { "original-name": encodeURIComponent(file.name) },
        })
      )
    );
  } catch (e) {
    const err = e as { name?: string; message?: string };
    // The reason goes to the server log; the browser gets a sentence.
    console.error("R2 upload failed", err.name, err.message);
    return NextResponse.json(
      { ok: false, error: "Upload failed. The file wasn't stored." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    key,
    name: file.name,
    size: file.size,
    type: file.type,
    url: `/api/r2/file?key=${encodeURIComponent(key)}`,
  });
}
