import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { canSee, deleteRoomForEveryone, leaveRoom, pairReadAt, postMessage, renameRoom, roomMembers, roomMessages, setTyping } from "@/lib/chats";

/**
 * One room of the team's chat (3 Oct 2026): General or a huddle.
 *   GET ?thread=<id>                        the room (or one question and its answers), marked read
 *   POST { text, question?, replyTo? }      say something; a question in General, or an answer to one
 *   PATCH  { name }                         rename a huddle (admins only)
 *   DELETE ?everyone=1                      leave a huddle, or delete it for all of its people (admins only)
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

/** Rename a huddle. Admins only, and the name everybody sees changes. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  const room = await canSee(actor, id);
  if (!room || room.kind !== "huddle") return NextResponse.json({ ok: false, error: "That huddle is not one you are in." }, { status: 404 });
  /* The check is here, on the server, and not only on the button: a button is
     a suggestion and a route is the rule. */
  if (!room.admin) return NextResponse.json({ ok: false, error: "Only an admin can rename this chat." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { name?: string };
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ ok: false, error: "Give it a name first." }, { status: 400 });
  await renameRoom(id, name);
  return NextResponse.json({ ok: true, name });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const room = await canSee(actor, id);
  if (!room || room.kind !== "huddle") return NextResponse.json({ ok: false, error: "Only a huddle can be left." }, { status: 400 });

  /* ?everyone=1 is a different act from leaving, and is asked for explicitly
     rather than inferred from who is calling: an admin leaving a huddle is
     leaving it, not deleting everybody else's copy of it. */
  if (req.nextUrl.searchParams.get("everyone") === "1") {
    if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
    if (!room.admin) return NextResponse.json({ ok: false, error: "Only an admin can delete this chat for everyone." }, { status: 403 });
    await deleteRoomForEveryone(id);
    return NextResponse.json({ ok: true, deleted: "everyone" });
  }

  await leaveRoom(actor, id);
  return NextResponse.json({ ok: true, deleted: "me" });
}
