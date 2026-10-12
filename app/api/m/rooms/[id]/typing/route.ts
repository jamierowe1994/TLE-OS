import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { canSee, pairReadAt, setTyping, typingIn } from "@/lib/chats";

/**
 * Typing, and seen, in a team chat (12 Oct 2026): the quick read an open chat
 * makes every few seconds, and the ping while someone writes.
 *   GET           who else is typing now (names), and in a huddle of two how
 *                 far the other person has read
 *   POST { on }   I am typing (on: true, sent every few seconds) or stopped
 * Never as someone viewed-as: an owner looking through an agent's eyes must
 * not make the agent appear to type.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const room = await canSee(actor, id);
  if (!room) return NextResponse.json({ ok: false, error: "That chat is not one you are in." }, { status: 404 });
  const [typing, otherRead] = await Promise.all([typingIn(actor, `room:${id}`), room.kind === "huddle" ? pairReadAt(actor, id) : Promise.resolve(null)]);
  return NextResponse.json({ ok: true, typing, otherRead });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: true });
  const room = await canSee(actor, id);
  if (!room) return NextResponse.json({ ok: false, error: "That chat is not one you are in." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { on?: boolean };
  await setTyping(actor, `room:${id}`, b.on !== false);
  return NextResponse.json({ ok: true });
}
