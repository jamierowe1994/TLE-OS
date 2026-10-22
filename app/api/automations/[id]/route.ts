import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { deleteAutomation, setEnabled } from "@/lib/automations/store";
import { caller } from "@/lib/automations/http";

/**
 * PATCH { on } → switch one on (theirs only) or off (theirs, or anyone's for
 *                an owner - the agent is told who and when).
 * DELETE       → delete one of theirs.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { on?: boolean };
  try {
    const a = await setEnabled({ id, on: b.on === true, by: { id: who.me.id, name: who.me.name || who.me.email, owner: who.owner } });
    return NextResponse.json({ ok: true, automation: a });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, "It could not be changed.") }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteAutomation(id, who.me.id).catch(() => false);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No such automation of yours." }, { status: 404 });
}
