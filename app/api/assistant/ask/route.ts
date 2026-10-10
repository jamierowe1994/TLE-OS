import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import type { OpenSurface } from "@/lib/open-record";
import { sealPayload, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { scopeFor } from "@/lib/scope";
import { memoryFor } from "@/lib/assistant-steve-more";
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
import type { ScreenControl, ScreenSnapshot } from "@/lib/steve-never";

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
    screen?: unknown;
    today?: unknown;
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
    const memory = (await memoryFor(userId).catch(() => ({ notes: [] }))).notes.map((n) => n.text);
    answer = await ask(history, text + noted, {
      scope,
      path,
      openListingId,
      surfaces,
      me: { id: userId, name: me.name ?? "", email: me.email },
      memory,
      screen: readScreen(b.screen),
      today: readToday(b.today),
    });
  } catch (e) {
    /* A model outage must not lose the question — it is still logged above,
       and it is still a guide somebody needed. */
    const msg =
      "Something went wrong reaching me just then. Your question is saved and has gone to James.";
    await logLine({ ...common, role: "assistant", text: msg, kind });
    return NextResponse.json({
      reply: msg,
      kind,
      error: publicError(e, "unknown"),
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
    /* A walk-through to start on their screen. Not sealed: it only points,
       and the browser checks the id against its own list of routes. */
    ...(answer.guide ? { guide: answer.guide } : {}),
    /* A file to offer, or to open now (James, 2 Oct 2026). Our own addresses
       only - built by lib/assistant-tools fileHref, checked again here. */
    ...(answer.offer && answer.offer.href.startsWith("/") ? { offer: answer.offer } : {}),
    ...(answer.open && answer.open.href.startsWith("/") ? { open: answer.open } : {}),
    /* File Store downloads: our own signed-link route only. */
    ...(answer.files?.length ? { files: answer.files.filter((f) => f.href.startsWith("/api/r2/file?")) } : {}),
    /* Steps on their own screen (lib/screen-controls). Not sealed: they run
       in the browser with the person's own hands, after their press, and the
       browser refuses a never control again at the moment of pressing. */
    ...(answer.screen ? { screen: answer.screen } : {}),
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

/**
 * What the browser says is on the screen (lib/screen-controls), rebuilt field
 * by field like the surfaces above: it goes straight into a prompt, so it is
 * capped and coerced, never trusted. Ninety controls, short strings.
 */
function readScreen(raw: unknown): ScreenSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").slice(0, n) : "");
  const kinds = ["button", "link", "tab", "text", "number", "date", "select", "checkbox", "textarea"];
  const controls: ScreenControl[] = Array.isArray(r.controls)
    ? r.controls.slice(0, 90).flatMap((c): ScreenControl[] => {
        const x = c as Record<string, unknown>;
        const ref = str(x.ref, 6);
        const kind = str(x.kind, 10);
        if (!/^s\d{1,3}$/.test(ref) || !kinds.includes(kind)) return [];
        return [
          {
            ref,
            kind: kind as ScreenControl["kind"],
            label: str(x.label, 70),
            ...(typeof x.value === "string" ? { value: str(x.value, 120) } : {}),
            ...(Array.isArray(x.options) ? { options: x.options.slice(0, 14).map((o) => str(o, 40)) } : {}),
            ...(x.never === true ? { never: true } : {}),
          },
        ];
      })
    : [];
  return {
    title: str(r.title, 100),
    headings: Array.isArray(r.headings) ? r.headings.slice(0, 14).map((h) => str(h, 60)) : [],
    controls,
  };
}

/** Their own diary today, as the dock holds it - capped and coerced for the prompt. */
function readToday(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").slice(0, n) : "");
  return raw.slice(0, 20).flatMap((d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const start = str(x.start, 5);
    const what = str(x.what, 100);
    if (!/^\d{2}:\d{2}$/.test(start) || !what) return [];
    const where = str(x.where, 100);
    const who = str(x.who, 60);
    return [`${start} ${str(x.kind, 16)}: ${what}${where ? ` at ${where}` : ""}${who ? ` with ${who}` : ""}`];
  });
}
