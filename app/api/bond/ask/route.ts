import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { ask, askConfigured, askHistory, budget, clearAsk, logAsk, type AskContext } from "@/lib/bond-ask";

/**
 * Ask Bond.
 *
 * GET    → this person's own conversation, and whether the panel is live
 * POST   → { text, districts, focus } → the reply, with what it went and read
 * DELETE → start the screen again (a marker row; nothing is deleted)
 *
 * The person's patch and the door in focus arrive from the browser, are
 * coerced here, and go into the prompt as facts about the request, never
 * as instructions. See lib/bond-ask.ts for the rules the reply obeys.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const DISTRICT = /^[A-Z]{1,2}\d{1,2}[A-Z]?$/;

function readDistricts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.slice(0, 60).map((d) => String(d).toUpperCase().trim()).filter((d) => DISTRICT.test(d)))];
}

function readFocus(raw: unknown): AskContext["focus"] {
  const f = raw as Record<string, unknown> | null;
  if (!f || typeof f !== "object") return null;
  const kind = f.kind === "door" || f.kind === "landlord" ? f.kind : null;
  const key = typeof f.key === "string" ? f.key.slice(0, 120) : "";
  const label = typeof f.label === "string" ? f.label.replace(/[\r\n]+/g, " ").slice(0, 160) : "";
  return kind && key ? { kind, key, label: label || key } : null;
}

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "Ask Bond needs the database and this environment has none." }, { status: 503 });
  const who = await whoIs(req);
  const userId = who.subject?.id ?? "anon";
  const [history, b] = await Promise.all([askHistory(userId), budget()]);
  return NextResponse.json({ ok: true, history, live: askConfigured() && b.left > 0, budget: b });
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  const who = await whoIs(req);
  await clearAsk(who.subject?.id ?? "anon", who.subject?.email ?? "");
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  const who = await whoIs(req);
  const userId = who.subject?.id ?? "anon";
  const userEmail = who.subject?.email ?? "";
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; districts?: unknown; focus?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return NextResponse.json({ ok: false, reason: "Say something first." }, { status: 400 });
  const ctx: AskContext = { districts: readDistricts(body.districts), focus: readFocus(body.focus) };
  const focus = ctx.focus ? `${ctx.focus.kind}:${ctx.focus.key}` : "";

  await logAsk({ userId, userEmail, role: "agent", text, focus });
  const history = (await askHistory(userId, 12)).map((l) => ({ role: l.role === "bond" ? ("assistant" as const) : ("user" as const), text: l.text }));
  /* The question just logged is the last line of that history; the brain
     appends it itself, so it comes off here. */
  history.pop();

  try {
    const a = await ask(history, text, ctx);
    await logAsk({ userId, userEmail, role: "bond", text: a.text, steps: a.steps, focus, inTokens: a.inTokens, outTokens: a.outTokens });
    return NextResponse.json({ ok: true, reply: a.text, steps: a.steps, live: !a.canned });
  } catch (e) {
    const msg = "Something went wrong reaching Bond just then. Your question is saved; try again in a moment.";
    await logAsk({ userId, userEmail, role: "bond", text: msg, focus });
    return NextResponse.json({ ok: true, reply: msg, steps: [], live: false, error: e instanceof Error ? e.message : "unknown" });
  }
}
