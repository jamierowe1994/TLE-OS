import { NextRequest, NextResponse } from "next/server";
import { openPayload, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { scopeFor } from "@/lib/scope";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { perform, type ActionProposal } from "@/lib/assistant-actions";
import { logLine } from "@/lib/assistant-log";

/**
 * The button on Steve's card. This is the only thing that acts.
 *
 * Steve composes; a person presses; this runs. The split is the whole design —
 * see lib/assistant-actions.ts for why, and for the three guards. The one
 * worth repeating here is that NOTHING about the action is read from the
 * request body. The proposal arrives sealed with our own HMAC, and if the seal
 * doesn't hold, the request is a forgery and is refused as one.
 *
 * A page that has been sitting open for an hour is also refused: the seal
 * carries a ten-minute expiry, so a stale card asks them to say it again
 * rather than acting on something they typed before lunch.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  /* Wearing somebody else's face is for SEEING their screen, never for acting
     on their behalf — an owner viewing as an agent must not be able to put a
     note on a file under that agent's name. */
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    }
    throw e;
  }

  const body = (await req.json().catch(() => ({}))) as { sealed?: string; thread?: string };
  const proposal = openPayload<ActionProposal>(body.sealed);
  if (!proposal) {
    return NextResponse.json(
      { ok: false, error: "That's expired or doesn't check out. Ask me again and I'll rebuild it." },
      { status: 400 }
    );
  }

  /* Re-checked here, not carried on the proposal. A sealed action is not a
     capability somebody else can spend. */
  const scope = await scopeFor(req);

  let outcome;
  try {
    outcome = await perform(proposal, scope, {
      id: me.id,
      name: me.name || me.email,
      osUserId: me.id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That didn't go through." },
      { status: 502 }
    );
  }

  /* Into the same log the console reads, so an action taken through Steve is
     as visible as anything he said. */
  await logLine({
    userId,
    userEmail: me.email,
    thread: (body.thread ?? "").slice(0, 64) || "t",
    path: "/api/assistant/act",
    role: "assistant",
    kind: "ask",
    text: `[${proposal.kind}] ${outcome.ok ? "done" : "refused"} — ${outcome.message}`,
  });

  return NextResponse.json(outcome);
}
