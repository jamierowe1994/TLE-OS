import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { addMembers, canSee } from "@/lib/chats";

/** POST /api/m/rooms/<id>/members { userIds } - invite more colleagues into a huddle you are in. */

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
