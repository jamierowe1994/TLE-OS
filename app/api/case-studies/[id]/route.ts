import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { cleanPatch, getCaseStudy, removeCaseStudy, updateCaseStudy, websiteUrlFor } from "@/lib/case-studies";
import { mayEdit } from "@/lib/case-study-access";

/** One case study: read, save (any of its fields, or publish / unpublish), remove. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function load(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await getCaseStudy(id);
  if (!c || !(await mayEdit(req, c))) return null;
  return c;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const c = await load(req, ctx);
  if (!c) return NextResponse.json({ ok: false, error: "That case study isn't there, or isn't yours." }, { status: 404 });
  return NextResponse.json({ ok: true, caseStudy: { ...c, websiteUrl: websiteUrlFor(c) } }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const c = await load(req, ctx);
  if (!c) return NextResponse.json({ ok: false, error: "That case study isn't there, or isn't yours." }, { status: 404 });
  const patch = cleanPatch((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (typeof patch === "string") return NextResponse.json({ ok: false, error: patch }, { status: 400 });
  if (patch.status === "published" && (patch.photos ?? c.photos).length === 0) {
    return NextResponse.json({ ok: false, error: "Add at least one photo before it goes on the website." }, { status: 400 });
  }
  try {
    const saved = await updateCaseStudy(c.id, patch);
    if (!saved) return NextResponse.json({ ok: false, error: "That case study has gone." }, { status: 404 });
    return NextResponse.json({ ok: true, caseStudy: { ...saved, websiteUrl: websiteUrlFor(saved) } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const c = await load(req, ctx);
  if (!c) return NextResponse.json({ ok: false, error: "That case study isn't there, or isn't yours." }, { status: 404 });
  await removeCaseStudy(c.id);
  return NextResponse.json({ ok: true });
}
