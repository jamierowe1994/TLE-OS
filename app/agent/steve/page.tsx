"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";
import { BackLink } from "../bits";

/**
 * STEVE, full screen (3 Oct 2026). James: in More, "get rid of [The Full OS]
 * and replace it with Steve ... it goes into a full conversation log ... an
 * LLM chat conversation". The same Steve as the desktop dock - the same
 * route (/api/assistant/ask), so the same memory, history and tools - drawn
 * as a phone chat: his face at the top, the conversation, a box at the foot.
 *
 * What he offers to DO arrives as a card with its own button, exactly as on
 * the desk: the sealed copy goes back to /api/assistant/act untouched. His
 * on-screen walk-throughs are a desktop thing and are not shown here.
 */

type Proposal = {
  kind: "note" | "reminder" | "write-up" | "email" | "fill-compose" | "tasks" | "job";
  items?: { title: string; detail?: string; due?: string | null }[];
  text?: string;
  title?: string;
  startsAt?: string;
  heading?: string;
  body?: string;
  toName?: string;
  subject?: string;
  address?: string | null;
};

type Line = {
  role: "agent" | "assistant";
  text: string;
  card?: Proposal;
  sealed?: string;
  settled?: "…" | "done" | "failed";
  offer?: { href: string; label: string };
  downloads?: { name: string; href: string }[];
};

const CARD_TITLE: Record<Proposal["kind"], string> = {
  "fill-compose": "Typed into your email",
  note: "Note, ready to save",
  reminder: "Reminder, ready to set",
  tasks: "Tasks, ready to add",
  job: "Standing job, ready to set up",
  "write-up": "New advert, ready to publish",
  email: "Email, ready to send",
};
const CARD_BUTTON: Record<Proposal["kind"], string> = {
  "fill-compose": "Type it in",
  note: "Save Note",
  reminder: "Set Reminder",
  tasks: "Add Them",
  job: "Set It Up",
  "write-up": "Publish It",
  email: "Send It",
};

type Stage = "onboarding-name" | "onboarding-help" | "ask";

export default function PhoneSteve() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [stage, setStage] = useState<Stage>("ask");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood>("wave");
  const thread = useRef(String(Date.now()));
  const end = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    const r = (await fetch("/api/assistant/ask", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null)) as { history?: Line[]; onboarded?: boolean } | null;
    const history: Line[] = (r?.history ?? []).map((h) => ({ role: h.role, text: h.text }));
    if (r && !r.onboarded) {
      setStage("onboarding-name");
      setLines([...history, { role: "assistant", text: "Hello, I'm Steve. I don't think we've met. What should I call you?" }]);
    } else {
      setStage("ask");
      setLines(history.length ? history : [{ role: "assistant", text: "Hello again. What can I help you with?" }]);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setTimeout(() => setMood("idle"), 2200);
    return () => window.clearTimeout(t);
  }, [load]);

  /* Keep the newest line in view. */
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, busy]);

  const send = async () => {
    const said = text.trim();
    if (!said || busy) return;
    setText("");
    setLines((l) => [...(l ?? []), { role: "agent", text: said }]);
    setBusy(true);
    setMood("thinking");
    const r = (await fetch("/api/assistant/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: said, kind: stage, thread: thread.current, path: "/agent/steve" }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null)) as {
      reply?: string;
      proposal?: Proposal;
      sealed?: string;
      offer?: { href?: unknown; label?: string };
      files?: { name: string; href?: unknown }[];
    } | null;
    setBusy(false);
    setMood(r ? "talking" : "sorry");
    window.setTimeout(() => setMood("idle"), 2400);
    setLines((l) => [
      ...(l ?? []),
      {
        role: "assistant",
        text: r?.reply ?? "Something went wrong sending that. Try again in a moment.",
        card: r?.proposal && r.proposal.kind !== "fill-compose" ? r.proposal : undefined,
        sealed: r?.proposal && r.proposal.kind !== "fill-compose" ? r.sealed : undefined,
        offer: r?.offer && typeof r.offer.href === "string" ? { href: r.offer.href, label: r.offer.label ?? "Open it" } : undefined,
        downloads: Array.isArray(r?.files)
          ? r.files.filter((f): f is { name: string; href: string } => typeof f?.href === "string" && f.href.startsWith("/api/r2/file?"))
          : undefined,
      },
    ]);
    setStage(stage === "onboarding-name" ? "onboarding-help" : "ask");
  };

  /* The button on a card: the sealed copy back, untouched, as on the desk. */
  const confirm = async (at: number) => {
    const line = lines?.[at];
    if (!line?.sealed || line.settled) return;
    setLines((l) => (l ?? []).map((x, i) => (i === at ? { ...x, settled: "…" } : x)));
    const r = (await fetch("/api/assistant/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sealed: line.sealed, thread: thread.current }),
    })
      .then((x) => x.json())
      .catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
    setLines((l) => [
      ...(l ?? []).map((x, i) => (i === at ? { ...x, settled: r?.ok ? ("done" as const) : ("failed" as const) } : x)),
      { role: "assistant", text: r?.message ?? r?.error ?? "That didn't go through. Try asking me again." },
    ]);
  };

  const fresh = async () => {
    await fetch("/api/assistant/ask", { method: "DELETE" }).catch(() => null);
    thread.current = String(Date.now());
    setLines([{ role: "assistant", text: "A fresh start. What can I help you with?" }]);
    setStage("ask");
  };

  return (
    <main className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-180px)] flex-col">
      <header className="flex h-12 items-center justify-between gap-3">
        <BackLink href="/agent" />
        <button type="button" onClick={fresh} className="h-10 rounded-full px-4 text-[14px] font-medium" style={{ background: "var(--m-card)" }}>
          New Chat
        </button>
      </header>

      <div className="mt-2 flex items-center gap-3.5">
        <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: "var(--m-pink-wash)" }}>
          <AssistantCharacter mood={mood} size={58} track={false} />
        </span>
        <span>
          <h1 className="m-title text-[30px] leading-none">Steve</h1>
          <span className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: busy ? "var(--m-coral)" : "var(--m-green)" }} />
            {busy ? "Thinking..." : "Here to help"}
          </span>
        </span>
      </div>

      <ol className="mt-5 flex flex-1 flex-col gap-3 pb-28">
        {lines === null ? (
          <li className="self-start">
            <Dots />
          </li>
        ) : (
          lines.map((l, i) => (
            <li key={i} className={`flex max-w-[86%] flex-col gap-2 ${l.role === "agent" ? "self-end items-end" : "self-start items-start"}`}>
              <p
                className={`whitespace-pre-wrap break-words px-4 py-3 text-[15.5px] leading-snug ${l.role === "agent" ? "rounded-[22px] rounded-br-[8px] text-white" : "rounded-[22px] rounded-bl-[8px]"}`}
                style={l.role === "agent" ? { background: "var(--m-brown)" } : { background: "var(--m-card)" }}
              >
                {l.text}
              </p>
              {l.card && <Card card={l.card} settled={l.settled} onConfirm={() => void confirm(i)} />}
              {l.offer && (
                <a href={l.offer.href} className="m-btn m-press !h-10 !text-[14px]" style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}>
                  {l.offer.label}
                </a>
              )}
              {l.downloads?.map((d) => (
                <a key={d.href} href={d.href} className="m-btn m-press !h-10 !text-[14px]">
                  {d.name}
                </a>
              ))}
            </li>
          ))
        )}
        {busy && (
          <li className="self-start">
            <Dots />
          </li>
        )}
        <div ref={end} />
      </ol>

      {/* The box, above the tab bar. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+63px)] z-30 px-4 pb-2 pt-2"
        style={{ background: "linear-gradient(to top, var(--m-bg) 70%, transparent)" }}
      >
        <div className="mx-auto flex max-w-[560px] items-end gap-2 rounded-[26px] border p-1.5 pl-4" style={{ background: "var(--m-card)", borderColor: "var(--m-line)" }}>
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={stage === "onboarding-name" ? "Your name" : "Ask Steve anything..."}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-snug outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            aria-label="Send"
            className="m-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-35"
            style={{ background: "var(--m-coral)" }}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
            </svg>
          </button>
        </div>
      </form>
    </main>
  );
}

function Card({ card, settled, onConfirm }: { card: Proposal; settled?: Line["settled"]; onConfirm: () => void }) {
  const detail =
    card.kind === "note"
      ? card.text
      : card.kind === "reminder"
        ? [card.title, card.startsAt ? new Date(card.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""].filter(Boolean).join(" - ")
        : card.kind === "email"
          ? [card.toName ? `To ${card.toName}` : "", card.subject].filter(Boolean).join(": ")
          : card.kind === "write-up"
            ? card.heading
            : card.kind === "tasks"
              ? (card.items ?? []).map((t) => `- ${t.title}`).join("\n")
              : card.title;
  return (
    <div className="w-full rounded-[20px] border p-4" style={{ borderColor: "var(--m-line)", background: "var(--m-bg)" }}>
      <p className="text-[13px] font-medium" style={{ color: "var(--m-coral)" }}>
        {CARD_TITLE[card.kind]}
      </p>
      {detail && <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-snug">{detail}</p>}
      {settled === "done" ? (
        <p className="mt-3 text-[14px] font-medium" style={{ color: "var(--m-sage-ink)" }}>
          Done
        </p>
      ) : settled === "failed" ? (
        <p className="mt-3 text-[14px] text-muted">That didn&apos;t go through.</p>
      ) : (
        <button type="button" onClick={onConfirm} disabled={settled === "…"} className="m-btn m-btn-primary m-press mt-3 !h-10 w-full !text-[14.5px]">
          {settled === "…" ? "Working..." : CARD_BUTTON[card.kind]}
        </button>
      )}
    </div>
  );
}

/** He is thinking: three dots on a bounce. */
function Dots() {
  return (
    <span className="flex items-center gap-1.5 rounded-[22px] rounded-bl-[8px] px-4 py-4" style={{ background: "var(--m-card)" }} role="status" aria-label="Steve is thinking">
      <style>{`
        @keyframes steve-dot { 0%, 80%, 100% { transform: translateY(0); opacity: .4 } 40% { transform: translateY(-5px); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .steve-dot { animation: none !important } }
      `}</style>
      {[0, 1, 2].map((i) => (
        <span key={i} className="steve-dot h-2 w-2 rounded-full" style={{ background: "var(--m-muted)", animation: `steve-dot 1.1s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
    </span>
  );
}
