import { NextRequest, NextResponse } from "next/server";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { requireCapability } from "@/lib/admin";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";

/**
 * The File Store's upload, in pieces (30 Sep 2026).
 *
 * Francesca's 135MB file failed without a word. Two reasons, both fixed here:
 *
 *   1. Next cuts a request body off at 10MB once middleware has read it, and
 *      ours reads every request, so /api/r2/upload never saw anything bigger
 *      than 10MB - the 25MB limit on the page was never true.
 *   2. That route holds the whole file in memory before sending it on.
 *
 * So the browser cuts the file into 8MB pieces and sends them one at a time,
 * and each piece goes straight on to R2 as one part of a multipart upload.
 * The server still decides everything: the key, the type, the size, and who
 * may upload at all. No presigned URL is handed out and the bucket needs no
 * CORS rules, which is the reason /api/r2/upload gives for going through the
 * server in the first place.
 *
 *   POST { action: "start", name, type, size }        -> { key, uploadId, partSize }
 *   PUT  ?key&uploadId&part=<1..n>   body: the bytes   -> { etag }
 *   POST { action: "complete", key, uploadId, parts }  -> { key, name, size }
 *   POST { action: "abort", key, uploadId }            -> { ok }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIB = SCOPES.library;
const SHELF = `${LIB.prefix}/shelf/`;
/** Under Next's 10MB body limit with room to spare, over R2's 5MB part minimum. */
const PART_SIZE = 8 * 1024 * 1024;

const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const onShelf = (key: string) => key.startsWith(SHELF) && !key.includes("..");

async function gate(req: NextRequest) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return fail("The File Store is for marketing and the office.", 403);
  if (!r2Configured) return fail("Storage isn't configured on this environment.", 503);
  return null;
}

export async function POST(req: NextRequest) {
  const no = await gate(req);
  if (no) return no;
  let body: {
    action?: string;
    name?: string;
    type?: string;
    size?: number;
    key?: string;
    uploadId?: string;
    parts?: { part: number; etag: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return fail("Expected JSON.");
  }

  if (body.action === "start") {
    const name = String(body.name ?? "");
    const type = String(body.type ?? "");
    const size = Number(body.size ?? 0);
    if (!name) return fail("The file has no name.");
    if (!size) return fail("The file is empty.");
    if (size > LIB.maxBytes) {
      return fail(`It is ${mb(size)}, and the limit is ${mb(LIB.maxBytes)} a file.`, 413);
    }
    if (!(LIB.types as readonly string[]).includes(type)) {
      return fail(
        `The File Store doesn't take that type of file (${type || "unknown type"}). PDFs, images, GIFs, MP4 and MOV video, Word and PowerPoint only.`,
        415
      );
    }
    const key = `${SHELF}${Date.now()}-${safeName(name)}`;
    try {
      const made = await withR2((c) =>
        c.send(
          new CreateMultipartUploadCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: type,
            Metadata: { "original-name": encodeURIComponent(name) },
          })
        )
      );
      if (!made.UploadId) return fail("Storage didn't start the upload. Try again.", 502);
      return NextResponse.json({ ok: true, key, uploadId: made.UploadId, partSize: PART_SIZE });
    } catch (e) {
      console.error("library upload start failed", e);
      return fail("Storage didn't start the upload. Try again.", 502);
    }
  }

  const key = String(body.key ?? "");
  const uploadId = String(body.uploadId ?? "");
  if (!onShelf(key) || !uploadId) return fail("That upload isn't one of ours.");

  if (body.action === "complete") {
    const parts = (body.parts ?? [])
      .map((p) => ({ PartNumber: Number(p.part), ETag: String(p.etag ?? "") }))
      .filter((p) => p.PartNumber > 0 && p.ETag)
      .sort((a, b) => a.PartNumber - b.PartNumber);
    if (!parts.length) return fail("No pieces arrived.");
    try {
      await withR2((c) =>
        c.send(
          new CompleteMultipartUploadCommand({
            Bucket: R2_BUCKET,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
          })
        )
      );
      return NextResponse.json({ ok: true, key });
    } catch (e) {
      console.error("library upload complete failed", e);
      return fail("Storage couldn't put the pieces back together. Try again.", 502);
    }
  }

  if (body.action === "abort") {
    await withR2((c) => c.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }))).catch(
      () => null
    );
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action.");
}

export async function PUT(req: NextRequest) {
  const no = await gate(req);
  if (no) return no;
  const sp = req.nextUrl.searchParams;
  const key = sp.get("key") ?? "";
  const uploadId = sp.get("uploadId") ?? "";
  const part = Number(sp.get("part") ?? 0);
  if (!onShelf(key) || !uploadId) return fail("That upload isn't one of ours.");
  /* R2 allows 10,000 parts; 500MB in 8MB pieces is 63. Anything past that is
     somebody going round the size check. */
  const maxParts = Math.ceil(LIB.maxBytes / PART_SIZE);
  if (!Number.isInteger(part) || part < 1 || part > maxParts) return fail("That piece is out of range.");

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return fail("That piece arrived empty.");
  if (bytes.length > PART_SIZE) return fail("That piece is too big.", 413);

  try {
    const out = await withR2((c) =>
      c.send(new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: part, Body: bytes }))
    );
    if (!out.ETag) return fail("Storage didn't confirm that piece.", 502);
    return NextResponse.json({ ok: true, etag: out.ETag });
  } catch (e) {
    console.error("library upload part failed", part, e);
    return fail("A piece didn't reach storage.", 502);
  }
}
