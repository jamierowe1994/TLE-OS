import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { safeName } from "@/lib/r2";
import { judgeFile } from "@/lib/upload-rules";
import { homeContext, isRefusal } from "@/lib/home-send";
import { EVIDENCE_PREFIX, canKeepFiles, isReviewId, keepFile, rentReviewOn } from "@/lib/rent-reviews";

/**
 * The market evidence on a Scottish rent review (Michael Healy, 20 Nov 2026):
 * Rightmove comparables, a valuation. Kept in R2 under the review's own id
 * before it is sent, and on the record once it is (lib/rent-reviews). Never
 * on the notice, never emailed to the tenant.
 *
 * POST (multipart) id, listing, listings, file  ->  { key, name, size, mime }
 *
 * The model is the section notices' files route; the home must be in the
 * person's book.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
/* Next cuts a request body off at 10MB once middleware has seen it (lib/r2 SCOPES.library). */
const MAX_BYTES = 10 * 1024 * 1024;
const list = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Switch back to add files." }, { status: 403 });
  if (!(await rentReviewOn(actor))) return NextResponse.json({ ok: false, error: "The Scottish rent review isn't switched on for you." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 });
  }
  const id = String(form.get("id") ?? "");
  if (!isReviewId(id)) return NextResponse.json({ ok: false, error: "Close this and start the rent review again." }, { status: 400 });
  const ctx = await homeContext(req, String(form.get("listing") ?? "").trim(), list(form.get("listings")));
  if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  const judged = judgeFile(file, { types: TYPES, maxBytes: MAX_BYTES });
  if (!judged.ok) return NextResponse.json({ ok: false, error: judged.error }, { status: judged.status });
  if (!canKeepFiles()) return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });

  const key = `${EVIDENCE_PREFIX(id)}${Date.now()}-${safeName(judged.name)}`;
  try {
    const body = new Uint8Array(await file.arrayBuffer());
    await keepFile(key, body, judged.type, file.name);
  } catch (e) {
    console.error("[rent-reviews] evidence upload failed", (e as Error)?.message);
    return NextResponse.json({ ok: false, error: "Upload failed. The file wasn't stored." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, file: { key, name: judged.name, size: file.size, mime: judged.type, url: `/api/r2/file?key=${encodeURIComponent(key)}` } });
}
