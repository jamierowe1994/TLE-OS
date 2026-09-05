import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { markSeen, noticesFor, seenAt } from "@/lib/notifications";

/**
 * GET  /api/notifications → the bell: what happened, newest first, with how
 *      many are newer than the last time this person looked.
 * POST /api/notifications → they looked. Everything up to now is read.
 *
 * Scoped to the SUBJECT, so an owner viewing as an agent sees that agent's
 * bell - but the read marker is the actor's own, so looking as somebody else
 * never clears their unread.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const me = subject ?? actor;
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 40) || 40, 1), 100);
  const [notices, seen] = await Promise.all([noticesFor(me, limit), seenAt(actor.id)]);
  const unread = seen ? notices.filter((n) => n.at > seen).length : notices.length;
  return NextResponse.json({ ok: true, notices, unread, seenAt: seen });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await markSeen(actor.id);
  return NextResponse.json({ ok: true });
}
