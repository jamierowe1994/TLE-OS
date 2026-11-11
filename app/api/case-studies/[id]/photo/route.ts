import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { judgeFile } from "@/lib/upload-rules";
import { getCaseStudy } from "@/lib/case-studies";
import { mayEdit } from "@/lib/case-study-access";
import { CASE_IMG_PREFIX, CASE_IMG_TYPES } from "@/lib/case-images";

/**
 * A photo the agent adds to a case study. Stored under its own public prefix
 * (see app/case-img) because the website shows it to anybody; the reply is
 * the photo's address, which the editor adds to the list and saves.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX = 12 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCaseStudy(id);
  if (!c || !(await mayEdit(req, c))) return NextResponse.json({ ok: false, error: "That case study isn't there, or isn't yours." }, { status: 404 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No photo came through." }, { status: 400 });
  const judged = judgeFile(file, { types: Object.keys(CASE_IMG_TYPES), maxBytes: MAX });
  if (!judged.ok) return NextResponse.json({ ok: false, error: judged.error }, { status: 400 });
  const name = `${randomUUID()}.${CASE_IMG_TYPES[judged.type]}`;
  const body = new Uint8Array(await file.arrayBuffer());
  try {
    await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: `${CASE_IMG_PREFIX}/${name}`, Body: body, ContentType: judged.type })));
  } catch (e) {
    console.error("Case study photo upload failed", publicError(e));
    return NextResponse.json({ ok: false, error: `${file.name} didn't upload. Try it again.` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, photo: { url: `/case-img/${name}`, from: "upload" } });
}
