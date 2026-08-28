import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { logLine, myHistory, isOnboarded, type LogKind } from "@/lib/assistant-log";

/**
 * Talking to the assistant.
 *
 * GET  → this person's own history, and whether they've been introduced
 * POST → logs what they said, logs what he says back, returns the reply
 *
 * ── There is no model behind this ────────────────────────────────────────
 *
 * Worth stating at the top of the file that answers it: nothing here calls
 * Claude or anything else. No key, no SDK, no network. Every reply below is
 * written by hand.
 *
 * That is not a stub. The onboarding James described — "what's your name",
 * then "what do you think you'll need the most help with" — is a SCRIPT, and
 * scripts do not need a model. Wiring one in would have made the introduction
 * less reliable, not more: a fixed sequence asks the same two questions of
 * everybody and gets a clean, comparable answer out of each, which is exactly
 * what you want from an initiation.
 *
 * The model belongs at the point where somebody asks something we did not
 * anticipate. Until then, the honest reply is that we have written it down.
 *
 * ── Own history only ──────────────────────────────────────────────────────
 *
 * GET takes no user parameter. Reading across everybody is an admin route with
 * its own capability check; an endpoint that accepts an id is one missing
 * check away from letting any agent read every other agent's questions.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A reply, written by hand, honest about what it is. */
function reply(kind: LogKind, said: string): string {
  const first = said.trim().split(/\s+/)[0] ?? "";
  if (kind === "onboarding-name") {
    return `Good to meet you, ${first}. What do you think you'll need the most help with?`;
  }
  if (kind === "onboarding-help") {
    return "Noted, thank you — that goes straight to James and it shapes what gets built first. Ask me anything from here and I'll pass it on.";
  }
  /* Deliberately not "I'll find that out for you". He can't, and a help system
     that over-promises spends the credit it needs later. */
  return "Written down and sent to James. I can't answer that myself yet, but questions like yours are what the help centre gets built from.";
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const [history, onboarded] = await Promise.all([myHistory(userId), isOnboarded(userId)]);
  return NextResponse.json({ history, onboarded });
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
  const answer = reply(kind, text);
  await logLine({ ...common, role: "assistant", text: answer, kind });

  return NextResponse.json({ reply: answer, kind });
}
