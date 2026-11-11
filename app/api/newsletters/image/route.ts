import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireCapability } from "@/lib/admin";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { judgeFile } from "@/lib/upload-rules";
import { publicOrigin } from "@/lib/origin";
import { MAIL_IMG_PREFIX, MAIL_IMG_TYPES } from "@/lib/mail-images";

/**
 * A picture for a newsletter.
 *
 * Everything else in R2 is private and handed out on five-minute signed links,
 * which an email cannot use: it is opened days later by a mail client with no
 * session. So newsletter pictures get their own prefix and a public address
 * (/mail-img/<name>, see that route), and nothing else is ever served there.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No picture came through." }, { status: 400 });
  /* One judge for every upload route (lib/upload-rules): the refusal names
     the file and what would be taken, and a picture the browser gave no type
     goes by its extension. */
  const judged = judgeFile(file, { types: Object.keys(MAIL_IMG_TYPES), maxBytes: MAX });
  if (!judged.ok) return NextResponse.json({ ok: false, error: judged.status === 413 ? `${judged.error} Emails load slowly with big pictures.` : judged.error }, { status: 400 });
  const ext = MAIL_IMG_TYPES[judged.type];

  const name = `${randomUUID()}.${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());
  try {
    await withR2((client) =>
      client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: `${MAIL_IMG_PREFIX}/${name}`, Body: body, ContentType: judged.type }))
    );
  } catch (e) {
    console.error("Newsletter image upload failed", publicError(e));
    return NextResponse.json({ ok: false, error: "Upload failed. The picture wasn't stored." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: `${publicOrigin(req)}/mail-img/${name}` });
}
