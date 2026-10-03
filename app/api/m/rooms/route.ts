import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { createHuddle } from "@/lib/chats";

/**
 * POST /api/m/rooms { name, userIds } - start a huddle (3 Oct 2026): a small
 * group of colleagues, picked from Find Your Local Agents. The person who
 * starts it is in it; everyone named is added.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Chats are not on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; userIds?: unknown };
  const name = String(b.name ?? "").trim().slice(0, 60);
  const userIds = (Array.isArray(b.userIds) ? b.userIds : []).map(String).slice(0, 50);
  if (!name) return NextResponse.json({ ok: false, error: "Give the huddle a name." }, { status: 400 });
  if (!userIds.length) return NextResponse.json({ ok: false, error: "Add at least one person." }, { status: 400 });
  const id = await createHuddle(actor, name, userIds);
  return NextResponse.json({ ok: true, id });
}
