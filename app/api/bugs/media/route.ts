import { NextRequest, NextResponse } from "next/server";
import { requireCapability, whoIs } from "@/lib/admin";
import { addBugMedia, mediaFor, MEDIA_MAX_BYTES, MEDIA_TYPES } from "@/lib/bug-media";

/**
 * A screen recording, or somebody's own pictures, added to a report.
 *
 * POST is open to any signed-in person, for a report they filed themselves -
 * the same rule as the picture that catches up with a report (PUT /api/bugs).
 * The words are always posted first and this follows, so a recording that
 * will not upload never costs anybody the report itself.
 *
 * GET is for whoever reads the reports. See lib/bug-media for why these files
 * have no other door.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file." }, { status: 400 });
  }
  const file = form.get("file");
  const bugId = String(form.get("id") ?? "").trim();
  if (!(file instanceof File) || !bugId) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  /* A recorder reports "video/webm;codecs=vp9". The part before the semicolon
     is the type; the rest is how it was made. */
  const mime = file.type.split(";")[0].trim();
  if (!(MEDIA_TYPES as readonly string[]).includes(mime)) {
    return NextResponse.json({ ok: false, error: "That kind of file can't be added to a report." }, { status: 415 });
  }
  if (file.size === 0 || file.size > MEDIA_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `That's too big to send - the limit is ${MEDIA_MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  const result = await addBugMedia({
    bugId, reporterId: actor.id, mime, body: new Uint8Array(await file.arrayBuffer()),
  });
  if (result === "ok") return NextResponse.json({ ok: true });
  const status = result === "not-yours" ? 404 : result === "full" ? 409 : result === "no-storage" ? 503 : 502;
  return NextResponse.json({ ok: false, error: "That didn't store." }, { status });
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) return new NextResponse(null, { status: 404 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  return NextResponse.json({ media: await mediaFor(id) });
}
