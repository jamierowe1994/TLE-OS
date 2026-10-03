import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { focusUntil, setFocus } from "@/lib/chats";

/**
 * The Focus Hour (Tools, 3 Oct 2026). While it runs, the phone's alerts are
 * held (lib/push) except what a landlord or tenant writes, and arrive
 * together when it ends. The phone's own silence is the agent's Focus
 * Shortcut on an iPhone - no app may switch Do Not Disturb on by itself.
 *   GET                   { until } or null
 *   POST { mins }         start (15 to 180 minutes)
 *   DELETE                end it early
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, until: hasDb() ? await focusUntil(actor.id) : null });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { mins?: number };
  const mins = Math.min(180, Math.max(15, Math.round(Number(b.mins) || 60)));
  const until = new Date(Date.now() + mins * 60_000).toISOString();
  await setFocus(actor.id, until);
  return NextResponse.json({ ok: true, until });
}

export async function DELETE(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await setFocus(actor.id, null);
  return NextResponse.json({ ok: true });
}
