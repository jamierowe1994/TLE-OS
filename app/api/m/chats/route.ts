import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { roomsFor, workThreads } from "@/lib/chats";
import type { OsUser } from "@/lib/users";

/**
 * GET /api/m/chats - the phone's Chats list (3 Oct 2026): Work (what
 * landlords and tenants wrote through their portals, the agent's own) and
 * Play (General and the huddles they are in), each with what is unread.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Chats are not on this environment." }, { status: 503 });
  const me = (subject ?? actor) as OsUser;
  try {
    const [work, rooms] = await Promise.all([workThreads(me), roomsFor(actor)]);
    return NextResponse.json({
      ok: true,
      work,
      rooms,
      unread: { work: work.reduce((s, t) => s + t.unread, 0), play: rooms.reduce((s, r) => s + r.unread, 0) },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Your chats did not load." }, { status: 502 });
  }
}
