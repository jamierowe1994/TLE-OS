import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { deletePhoto, listPhotos, photoUrl, storePhoto } from "@/lib/property-photos";

/**
 * The take-on photographs on one appraisal.
 *   GET            → what is on the file
 *   GET ?photo=id  → that photograph itself, for an hour
 *   POST (file)    → one photograph; the drop box posts them one at a time
 *   DELETE ?photo= → remove one
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const one = (req.nextUrl.searchParams.get("photo") ?? "").trim();
  if (one) {
    const url = await photoUrl(id, one);
    if (!url) return NextResponse.json({ ok: false, error: "No such photograph." }, { status: 404 });
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ ok: true, photos: await listPhotos(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a photograph." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No photograph was attached." }, { status: 400 });
  const out = await storePhoto({ appraisalId: id, file, by: actor.name || actor.email });
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, photo: out.photo });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const one = (req.nextUrl.searchParams.get("photo") ?? "").trim();
  if (!one) return NextResponse.json({ ok: false, error: "Which photograph?" }, { status: 400 });
  return NextResponse.json({ ok: await deletePhoto(id, one) });
}
