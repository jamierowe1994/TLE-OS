import { NextRequest, NextResponse } from "next/server";
import { leadAccess } from "@/lib/lead-access";
import { hasDb } from "@/lib/db";
import { readFacts, writeFacts, type LeadFacts } from "@/lib/lead-facts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { denied } = await leadAccess(req, id);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await readFacts(id)) });
}

/** PATCH { tags?: string[], property?: PropertyFactsData } - only what is sent changes. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { denied } = await leadAccess(req, id);
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so this cannot be saved." }, { status: 503 });
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
