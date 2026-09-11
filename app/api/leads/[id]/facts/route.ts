import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { readFacts, writeFacts, type LeadFacts } from "@/lib/lead-facts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, ...(await readFacts(id)) });
}

/** PATCH { tags?: string[], property?: PropertyFactsData } - only what is sent changes. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so this cannot be saved." }, { status: 503 });
  const { id } = await ctx.params;
  let body: Partial<LeadFacts>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 }); }
  const patch: Partial<LeadFacts> = {};
  if (Array.isArray(body.tags)) patch.tags = body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 40);
  if (body.property && typeof body.property === "object") patch.property = body.property;
  try {
    await writeFacts(id, patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "That did not save. Try again." }, { status: 500 });
  }
}
