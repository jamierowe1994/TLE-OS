import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { can } from "@/lib/roles";
import { addFile, getNotice, removeFile } from "@/lib/section-notices";
import { SPECS, agentCanEdit } from "@/lib/section-notices-spec";

/**
 * The evidence on a notice, filed against the checklist line it proves.
 *
 * POST (multipart) file, line, side?  → stored in R2 under the notice, then
 *                                        on the notice. `side: compliance` is
 *                                        Michael's: the final notice and the
 *                                        proof of service, once approved.
 * DELETE ?file=<id>&side=<side>        → off the notice. The object stays in
 *                                        storage; evidence is not destroyed
 *                                        from a screen.
 *
 * The agent can add and take away only while the notice is theirs to change
 * (a draft, or returned). With compliance, it is fixed.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Evidence comes as a PDF, a photo, a Word document, a rent statement as a
   spreadsheet, or an email saved out of Outlook. */
const TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv",
  "message/rfc822", "application/vnd.ms-outlook",
];
const BY_NAME = /\.(pdf|jpe?g|png|webp|heic|docx?|xlsx?|csv|eml|msg)$/i;
/* Next cuts a request body off at 10MB once middleware has seen it (see
   SCOPES.library in lib/r2), so 10MB is the honest ceiling here. */
const MAX_BYTES = 10 * 1024 * 1024;

async function who(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) } as const;
  if (subject && subject.id !== actor.id) {
    return { error: NextResponse.json({ ok: false, error: "You are viewing as somebody else. Switch back to change it." }, { status: 403 }) } as const;
  }
  if (!hasDb()) return { error: NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be kept." }, { status: 503 }) } as const;
  return { actor } as const;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const w = await who(req);
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  const notice = await getNotice(id);
  if (!notice) return NextResponse.json({ ok: false, error: "That notice is not there any more." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 });
  }
  const file = form.get("file");
  const line = String(form.get("line") ?? "").slice(0, 60);
  const side = form.get("side") === "compliance" ? "compliance" : "agent";
  const spec = SPECS[notice.kind];

  if (side === "compliance") {
    if (!can(w.actor.role, "see:agent-compliance")) return NextResponse.json({ ok: false, error: "Only compliance files these." }, { status: 403 });
    if (notice.status !== "approved" && notice.status !== "served") return NextResponse.json({ ok: false, error: "Only once it is approved." }, { status: 409 });
    if (!spec.postService.some((l) => l.id === line && l.evidence) && line !== "final_notice") {
      return NextResponse.json({ ok: false, error: "Which line is this for?" }, { status: 400 });
    }
  } else {
    if (!agentCanEdit(notice.status)) return NextResponse.json({ ok: false, error: "This one is with compliance now, so its files are fixed." }, { status: 409 });
    const lines = spec.sections.flatMap((s) => s.lines).filter((l) => l.type === "check" && l.evidence).map((l) => l.id);
    if (!lines.includes(line) && line !== "other") return NextResponse.json({ ok: false, error: "Which line is this for?" }, { status: 400 });
  }

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB - the limit is 10MB.` }, { status: 413 });
  }
  if (!TYPES.includes(file.type) && !BY_NAME.test(file.name)) {
    return NextResponse.json({ ok: false, error: "Only a PDF, a photo, a Word or Excel file, or a saved email can go here." }, { status: 415 });
  }
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });

  const key = `${SCOPES.document.prefix}/notice-${safeName(id)}/${Date.now()}-${safeName(file.name)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type || "application/octet-stream",
          Metadata: { "original-name": encodeURIComponent(file.name) },
        })
      )
    );
  } catch (e) {
    console.error("[section-notices] R2 upload failed", (e as Error)?.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }

  const saved = await addFile({
    noticeId: id, lineId: line, side, name: file.name, r2Key: key, mime: file.type, sizeBytes: file.size,
    byName: w.actor.name || w.actor.email,
  });
  return NextResponse.json({ ok: true, file: saved, notice: await getNotice(id) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const w = await who(req);
  if ("error" in w) return w.error;
  const { id } = await ctx.params;
  const fileId = req.nextUrl.searchParams.get("file") ?? "";
  const side = req.nextUrl.searchParams.get("side") === "compliance" ? "compliance" : "agent";
  const notice = await getNotice(id);
  if (!notice) return NextResponse.json({ ok: false, error: "That notice is not there any more." }, { status: 404 });
  if (side === "compliance") {
    if (!can(w.actor.role, "see:agent-compliance")) return NextResponse.json({ ok: false, error: "Only compliance changes these." }, { status: 403 });
    if (notice.status !== "approved") return NextResponse.json({ ok: false, error: "Once it is marked served, its files are fixed." }, { status: 409 });
  } else if (!agentCanEdit(notice.status)) {
    return NextResponse.json({ ok: false, error: "This one is with compliance now, so its files are fixed." }, { status: 409 });
  }
  const gone = await removeFile(id, fileId, side);
  if (!gone) return NextResponse.json({ ok: false, error: "That file is not on this notice." }, { status: 404 });
  return NextResponse.json({ ok: true, notice: await getNotice(id) });
}
