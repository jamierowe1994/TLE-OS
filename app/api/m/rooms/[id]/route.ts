import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { canSee, leaveRoom, pairReadAt, postMessage, roomMembers, roomMessages, setTyping } from "@/lib/chats";

/**
 * One room of the team's chat (3 Oct 2026): General or a huddle.
 *   GET ?thread=<id>                        the room (or one question and its answers), marked read
 *   POST { text, question?, replyTo? }      say something; a question in General, or an answer to one
 *   DELETE                                  leave a huddle
 * Read as the person themselves, never as someone viewed-as.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const room = await canSee(actor, id);
  if (!room) return NextResponse.json({ ok: false, error: "That chat is not one you are in." }, { status: 404 });
  const thread = req.nextUrl.searchParams.get("thread");
  /* ?peek=1: the chat is open in a tab nobody is looking at - read it, but do not mark it read. */
  const peek = req.nextUrl.searchParams.get("peek") === "1";
  const [messages, members, otherRead] = await Promise.all([
    roomMessages(actor, id, thread, peek),
    room.kind === "huddle" ? roomMembers(id) : Promise.resolve([]),
    room.kind === "huddle" ? pairReadAt(actor, id) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ok: true, room: { id, ...room }, me: actor.id, messages, members, otherRead });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  const room = await canSee(actor, id);
  if (!room) return NextResponse.json({ ok: false, error: "That chat is not one you are in." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { text?: string; question?: boolean; replyTo?: string };
  const text = String(b.text ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  const message = await postMessage(actor, id, text, Boolean(b.question), b.replyTo ? String(b.replyTo) : null);
  await setTyping(actor, `room:${id}`, false);
  return NextResponse.json({ ok: true, message });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const room = await canSee(actor, id);
  if (!room || room.kind !== "huddle") return NextResponse.json({ ok: false, error: "Only a huddle can be left." }, { status: 400 });
  await leaveRoom(actor, id);
  return NextResponse.json({ ok: true });
}
