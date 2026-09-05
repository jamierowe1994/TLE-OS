import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { itemsFor, markDone } from "@/lib/agent-compliance";

/**
 * GET  /api/agent-compliance → what the signed-in person holds, against
 *      the list as it stands today.
 * POST /api/agent-compliance → "I have this, from this date". Their own
 *      word; Michael's check is a separate act on the overview.
 *
 * Scoped to the SUBJECT, so an owner viewing as an agent sees that agent's
 * list - but a mark is always written by the actor for themselves.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, items: [] });
  const me = subject ?? actor;
  return NextResponse.json({ ok: true, stored: true, items: await itemsFor(me.id) });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    requirementId?: string;
    doneAt?: string;
    expiresAt?: string | null;
    note?: string;
    link?: string;
  };
  if (!body.requirementId || !body.doneAt) {
    return NextResponse.json({ ok: false, error: "Which requirement, and from when?" }, { status: 400 });
  }
  try {
    await markDone({
      userId: actor.id,
      requirementId: body.requirementId,
      doneAt: body.doneAt,
      expiresAt: body.expiresAt ?? null,
      note: body.note,
      link: body.link,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't save." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, items: await itemsFor(actor.id) });
}
