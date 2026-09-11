import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { hideLead, unhideLead } from "@/lib/hidden-leads";

export const dynamic = "force-dynamic";

/** POST: take a lead off the board. DELETE: put it back. REX is untouched. */
async function act(req: NextRequest, ctx: { params: Promise<{ id: string }> }, hide: boolean) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so nothing can be removed." }, { status: 503 });
  const { id } = await ctx.params;
  const who = (actor as unknown as { email?: string; name?: string }).email ?? (actor as unknown as { name?: string }).name ?? null;
  try {
    if (hide) await hideLead(id, who);
    else await unhideLead(id);
    return NextResponse.json({ ok: true, id, hidden: hide });
  } catch {
    return NextResponse.json({ ok: false, error: "That did not save. Try again." }, { status: 500 });
  }
}

export const POST = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => act(req, ctx, true);
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => act(req, ctx, false);
