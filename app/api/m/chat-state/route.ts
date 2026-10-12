import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { canSee, GENERAL, leaveRoom, setChatState } from "@/lib/chats";

/**
 * POST /api/m/chat-state { key, action } - archive, bring back or delete a
 * chat for yourself (12 Oct 2026, the double-click in Huddles). key is
 * room:<id>, landlord:<appraisal id> or tenant:<portal account id>; action is
 * "archive", "unarchive" or "delete". Deleting a huddle is leaving it;
 * deleting anything else clears it from your list until someone writes again.
 * Nobody else's chats change, and customers' messages stay on their file.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else, so nothing is changed." }, { status: 423 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Chats are not on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { key?: string; action?: string };
  const key = String(b.key ?? "");
  const action = b.action === "archive" || b.action === "unarchive" || b.action === "delete" ? b.action : null;
  const m = /^(room|landlord|tenant):(.{1,200})$/.exec(key);
  if (!m || !action) return NextResponse.json({ ok: false, error: "That isn't a chat." }, { status: 400 });

  if (m[1] === "room") {
    const room = await canSee(actor, m[2]!);
    if (!room) return NextResponse.json({ ok: false, error: "That chat is not one you are in." }, { status: 404 });
    if (action === "delete" && room.kind === "huddle" && m[2] !== GENERAL) {
      await leaveRoom(actor, m[2]!);
      return NextResponse.json({ ok: true, left: true });
    }
  }
  await setChatState(actor.id, key, action);
  return NextResponse.json({ ok: true });
}
