import { NextRequest, NextResponse } from "next/server";
import type { OpenSurface } from "@/lib/open-record";
import { sealPayload, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { scopeFor } from "@/lib/scope";
import { findUserById } from "@/lib/users";
import {
  logLine,
  myHistory,
  isOnboarded,
  clearChat,
  type LogAttachment,
  type LogKind,
} from "@/lib/assistant-log";
import { ask, budget, assistantConfigured } from "@/lib/assistant-brain";
import { AGENT_NAV } from "@/lib/nav";
import { keyIsOurs } from "@/lib/r2";

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

/**
 * Start the screen again.
 *
 * DELETE, because from where the agent is standing this removes their
 * conversation — the verb should match what they think they are doing. Nothing
 * is actually deleted; see clearChat.
 *
 * Takes no id and clears only the caller's own thread, for the same reason GET
 * takes no user parameter: an endpoint that accepts somebody else's id is one
 * missing check away from letting any agent wipe another's screen.
 */
export async function DELETE(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  await clearChat(userId, me.email);
  return NextResponse.json({ ok: true });
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
    openListingId?: string;
    surfaces?: unknown;
    attachments?: unknown;
  };
  const attachments = readAttachments(b.attachments);
  const text = (b.text ?? "").trim();
  /* A file on its own is a message. Somebody who attaches a certificate and
     presses send without typing has said something, and refusing it because
     the box was empty would be the panel arguing with them. */
  if (!text && !attachments.length) {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }

  const kind: LogKind =
    b.kind === "onboarding-name" || b.kind === "onboarding-help" ? b.kind : "ask";
  const thread = (b.thread ?? "").slice(0, 64) || "t";
  const path = (b.path ?? "").slice(0, 200);
  /* The record open in front of them. It is what turns "how many bedrooms is
     this one" from an unanswerable question into a lookup. */
  const openListingId = (b.openListingId ?? "").slice(0, 40) || null;
  /* Everything layered on screen. Capped and coerced HERE rather than trusted:
     it arrives from the browser and goes straight into a prompt, so a hostile
     or simply enormous payload must not be able to fill the context window or
     smuggle instructions in as a field label. */
  const surfaces = readSurfaces(b.surfaces);
  const common = { userId, userEmail: me.email, thread, path };

  await logLine({
    ...common,
    role: "agent",
    text: text.slice(0, 4000) || `[${attachments.length === 1 ? "a file" : `${attachments.length} files`}]`,
    kind,
    attachments,
  });

  /* ── What happens to a file ────────────────────────────────────────────
     He cannot read it. The model gets the name and the type and nothing
     else, because handing a PDF of somebody's tenancy to a model is a
     decision James has not made and is not one to make by accident here.
     What the file DOES do is reach a person: it is on the question in the
     console, which is the whole of "which we should be able to receive".
     Saying so in the reply, rather than letting him answer as though he had
     read it, is the difference between a system that is young and one that
     is lying. */
  const noted = attachments.length
    ? `\n\n[The person attached ${attachments
        .map((a) => `"${a.name}"`)
        .join(", ")}. You cannot open files. Say plainly that you can see it has come through and that it has gone to the office with their question, then answer whatever you can from what they typed.]`
    : "";

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

  /* WHOSE data may his tools read. Resolved here, from the request, and
     handed down — a tool that decided its own scope would be one forgotten
     import away from answering across the whole group. */
  const scope = await scopeFor(req);

  let answer;
  try {
    answer = await ask(history, text + noted, { scope, path, openListingId, surfaces });
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

  return NextResponse.json({
    reply: answer.text,
    kind,
    live: !answer.canned,
    /* What he actually went and read. Shown under the reply, because an
       assistant that quotes a rent should be able to say where it got it. */
    steps: answer.steps,
    /* The card, if he offered to do something. Sent BOTH ways: `proposal` for
       the widget to render, `sealed` for it to hand back untouched. What gets
       executed is the sealed copy, so an edited card is a rejected one. */
    ...(answer.proposal
      ? { proposal: answer.proposal, sealed: sealPayload(answer.proposal) }
      : {}),
  });
}

/**
 * The files that came with the question, checked rather than believed.
 *
 * The browser has already uploaded them through /api/r2/upload, which is the
 * only party that decides what may be stored - so what arrives here is a claim
 * about what was stored, and a claim is not evidence. Every key is tested
 * against the bucket's own prefixes before it is written to a row that a link
 * will later be signed from.
 *
 * Four at most, because the panel is a speech bubble and this is a question,
 * not a submission.
 */
function readAttachments(raw: unknown): LogAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 4).flatMap((r): LogAttachment[] => {
    const a = r as Record<string, unknown>;
    const key = typeof a.key === "string" ? a.key : "";
    if (!keyIsOurs(key)) return [];
    return [
      {
        key: key.slice(0, 300),
        name: typeof a.name === "string" ? a.name.slice(0, 160) : "file",
        type: typeof a.type === "string" ? a.type.slice(0, 100) : "",
        size: typeof a.size === "number" && Number.isFinite(a.size) ? Math.max(0, Math.round(a.size)) : 0,
      },
    ];
  });
}

/**
 * The open-surface stack, sanitised.
 *
 * Everything here came from the browser and is about to be pasted into a
 * prompt, so it is rebuilt field by field rather than passed through: unknown
 * kinds are dropped, strings are cut to length, and the number of surfaces,
 * fields and notes is capped. The caps are generous enough for a drawer with a
 * composer on top and mean enough that nothing can crowd out the instructions.
 */
function readSurfaces(raw: unknown): OpenSurface[] {
  if (!Array.isArray(raw)) return [];
  const kinds = ["listing", "lead", "contact", "compose", "case", "record"];
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  return raw.slice(-4).flatMap((r): OpenSurface[] => {
    const s = r as Record<string, unknown>;
    const kind = String(s.kind ?? "");
    if (!kinds.includes(kind)) return [];
    return [
      {
        kind: kind as OpenSurface["kind"],
        id: str(s.id, 60) || null,
        label: str(s.label, 120),
        fields: Array.isArray(s.fields)
          ? s.fields.slice(0, 12).map((f) => {
              const x = f as Record<string, unknown>;
              return { label: str(x.label, 40), value: str(x.value, 400) };
            })
          : [],
        notes: Array.isArray(s.notes)
          ? s.notes.slice(-8).map((n) => str(n, 400)).filter(Boolean)
          : [],
      },
    ];
  });
}
