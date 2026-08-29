import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { logLine, myHistory, isOnboarded, type LogKind } from "@/lib/assistant-log";
import { ask, budget, assistantConfigured } from "@/lib/assistant-brain";
import { AGENT_NAV } from "@/lib/nav";

/**
 * Talking to the assistant.
 *
 * GET  → this person's own history, and whether they've been introduced
 * POST → logs what they said, logs what he says back, returns the reply
 *
 * ── The introduction is a script; the questions go to Claude ─────────────
 *
 * Deliberately split. "What's your name" then "what will you need help with"
 * is a fixed sequence, and a model would make it LESS reliable: the point of
 * an initiation is that everybody gets asked the same two things and gives a
 * clean, comparable answer. Scripts are better at that than models.
 *
 * Real questions go to Claude, over the knowledge base, with a daily spend
 * ceiling — see lib/assistant-brain.ts. Where there is no key or the ceiling
 * has been reached, he says so plainly rather than pretending.
 *
 * ── Own history only ──────────────────────────────────────────────────────
 *
 * GET takes no user parameter. Reading across everybody is an admin route with
 * its own capability check; an endpoint that accepts an id is one missing
 * check away from letting any agent read every other agent's questions.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The two scripted turns of the introduction. */
function scripted(kind: LogKind, said: string): string | null {
  const first = said.trim().split(/\s+/)[0] ?? "";
  if (kind === "onboarding-name") {
    return `Good to meet you, ${first}. What do you think you'll need the most help with?`;
  }
  if (kind === "onboarding-help") {
    return "Noted, thank you — that goes to James and it shapes what gets built first. Ask me anything from here.";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const [history, onboarded, b] = await Promise.all([
    myHistory(userId),
    isOnboarded(userId),
    budget(),
  ]);
  return NextResponse.json({
    history,
    onboarded,
    /* So the panel can say what he is rather than guess. */
    live: assistantConfigured() && b.left > 0,
    /* The screens a "take me there" button is allowed to point at. Sent from
       here rather than hardcoded in the dock so the rail stays the one list;
       Admin is excluded upstream in AGENT_NAV. */
    screens: AGENT_NAV.map((n) => ({ href: n.href, label: n.label })),
  });
}

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    text?: string;
    kind?: string;
    thread?: string;
    path?: string;
  };
  const text = (b.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Say something first." }, { status: 400 });

  const kind: LogKind =
    b.kind === "onboarding-name" || b.kind === "onboarding-help" ? b.kind : "ask";
  const thread = (b.thread ?? "").slice(0, 64) || "t";
  const path = (b.path ?? "").slice(0, 200);
  const common = { userId, userEmail: me.email, thread, path };

  await logLine({ ...common, role: "agent", text: text.slice(0, 4000), kind });

  const canned = scripted(kind, text);
  if (canned) {
    await logLine({ ...common, role: "assistant", text: canned, kind });
    return NextResponse.json({ reply: canned, kind });
  }

  /* Their own recent turns, so a follow-up like "and the second one?" lands.
     Capped in the brain, not here. */
  const history = (await myHistory(userId, 12)).map((l) => ({
    role: l.role === "assistant" ? ("assistant" as const) : ("user" as const),
    text: l.text,
  }));

  let answer;
  try {
    answer = await ask(history, text);
  } catch (e) {
    /* A model outage must not lose the question — it is still logged above,
       and it is still a guide somebody needed. */
    const msg =
      "Something went wrong reaching me just then. Your question is saved and has gone to James.";
    await logLine({ ...common, role: "assistant", text: msg, kind });
    return NextResponse.json({
      reply: msg,
      kind,
      error: e instanceof Error ? e.message : "unknown",
    });
  }

  await logLine({
    ...common,
    role: "assistant",
    text: answer.text,
    kind,
    inTokens: answer.inTokens,
    outTokens: answer.outTokens,
  });

  return NextResponse.json({ reply: answer.text, kind, live: !answer.canned });
}
