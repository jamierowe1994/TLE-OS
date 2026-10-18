import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { addMembers, canSee, removeMember } from "@/lib/chats";

/**
 * Who is in a huddle.
 *   POST   { userIds }   invite more colleagues into a huddle you are in
 *   DELETE { userId }    take somebody out of it - admins only
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  const room = await canSee(actor, id);
  if (!room || room.kind !== "huddle") return NextResponse.json({ ok: false, error: "That huddle is not one you are in." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { userIds?: unknown };
  const userIds = (Array.isArray(b.userIds) ? b.userIds : []).map(String).slice(0, 50);
  if (!userIds.length) return NextResponse.json({ ok: false, error: "Pick someone to add." }, { status: 400 });
  const added = await addMembers(id, actor.id, userIds);
  return NextResponse.json({ ok: true, added });
}

/**
 * Take somebody out of a huddle.
 *
 * Admins only (an owner, or whoever started it). Taking yourself out is
 * leaving, which DELETE on the room itself already does, so it is refused here
 * rather than quietly doing something else - the two leave different trails
 * and the person pressing them means different things by them.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  const room = await canSee(actor, id);
  if (!room || room.kind !== "huddle") return NextResponse.json({ ok: false, error: "That huddle is not one you are in." }, { status: 404 });
  if (!room.admin) return NextResponse.json({ ok: false, error: "Only an admin can take someone out of this chat." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { userId?: unknown };
  const userId = String(b.userId ?? "");
  if (!userId) return NextResponse.json({ ok: false, error: "Say who to take out." }, { status: 400 });
  if (userId === actor.id) return NextResponse.json({ ok: false, error: "To take yourself out, leave the chat." }, { status: 400 });
  await removeMember(id, userId);
  return NextResponse.json({ ok: true });
}
