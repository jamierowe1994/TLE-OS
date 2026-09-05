import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { addTouch, spineFor } from "@/lib/lead-touches";
import {
  ATTEMPT_KINDS,
  OUTCOMES,
  type TouchKind,
  type TouchOutcome,
} from "@/lib/lead-spine";

/**
 * GET  /api/leads/[id]/touches → the log and the spine folded from it.
 * POST /api/leads/[id]/touches → log one thing: a call, a text, a visit, an
 *      email, a note, or the lead going to nurture / coming back.
 *
 * Anyone signed in can log against any lead - a colleague covering a call
 * writes it down under their own name, which is the point of a log.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS: TouchKind[] = ["call", "text", "email", "visit", "note", "nurture", "rejoin"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, touches: [], spine: null });
  const { touches, spine } = await spineFor(id);
  return NextResponse.json({ ok: true, stored: true, touches, spine });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be logged." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    outcome?: string | null;
    body?: string;
  };
  const kind = body.kind as TouchKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, error: "Say what it was: a call, a text, a visit, an email or a note." }, { status: 400 });
  }
  let outcome: TouchOutcome | null = null;
  if (ATTEMPT_KINDS.includes(kind) || kind === "email") {
    const o = OUTCOMES.find((x) => x.id === body.outcome && x.for.includes(kind));
    if (!o) {
      return NextResponse.json({ ok: false, error: "Say how it went." }, { status: 400 });
    }
    outcome = o.id;
  }
  const text = (body.body ?? "").toString().slice(0, 2000);
  if (kind === "note" && !text.trim()) {
    return NextResponse.json({ ok: false, error: "An empty note is not a note." }, { status: 400 });
  }
  const who = subject ?? actor;
  const touch = await addTouch({
    leadId: id,
    kind,
    outcome,
    body: text,
    byId: who.id,
    byName: who.name || who.email,
  });
  const { touches, spine } = await spineFor(id);
  return NextResponse.json({ ok: true, touch, touches, spine });
}
