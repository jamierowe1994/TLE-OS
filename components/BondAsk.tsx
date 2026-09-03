"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { CopyButton } from "@/components/Bits";

/**
 * Ask Bond - the consult drawer.
 *
 * Opens over any room, stays open across rooms, and knows what is in front
 * of the person: open a door on the board and ask "why is this one flagged",
 * open a landlord and ask for the letter. The focus is a chip at the top,
 * and it can be taken off without closing the drawer.
 *
 * It never acts. Drafts come back as text with a copy button; the rooms do
 * the doing. The conversation is this person's own and is kept on the
 * server, so it survives a reload and a change of room.
 */

export interface AskFocus {
  kind: "door" | "landlord";
  key: string;
  label: string;
}

interface Line {
  role: "agent" | "bond";
  text: string;
  steps?: string[];
  pending?: boolean;
}

const OPENERS = [
  "What should I do first today?",
  "Pick this week's ten",
  "Who holds the most stock in my patch?",
  "Which anniversaries are coming up?",
];
const DOOR_OPENERS = ["Tell me the story of this door", "Why is it scored the way it is?", "Draft a letter to this landlord", "Draft a postcard for this door"];
const LANDLORD_OPENERS = ["Tell me about this landlord", "Which of their doors should I start with?", "Draft a letter to this landlord"];

/** Bold and lists, nothing more. Bond writes short. */
function Says({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const bullet = lines.every((l) => /^[-•]\s+/.test(l));
        const numbered = lines.every((l) => /^\d+[.)]\s+/.test(l));
        if (bullet || numbered) {
          const Tag = numbered ? "ol" : "ul";
          return (
            <Tag key={i} className={`space-y-1 pl-4 ${numbered ? "list-decimal" : "list-disc"}`}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^([-•]|\d+[.)])\s+/, ""))}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b)}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(s.slice(last, at));
    out.push(<strong key={at} className="font-semibold">{m[1]}</strong>);
    last = at + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export default function BondAsk({
  open,
  onClose,
  districts,
  focus,
  onClearFocus,
}: {
  open: boolean;
  onClose: () => void;
  districts: string[];
  focus: AskFocus | null;
  onClearFocus: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    if (!loaded) {
      fetch("/api/bond/ask", { cache: "no-store" })
        .then(async (r) => {
          const j = await r.json();
          if (!j.ok) throw new Error(j.reason ?? "Could not open Ask Bond.");
          setLines((j.history as Line[]).map((l) => ({ role: l.role, text: l.text, steps: l.steps })));
          setLive(Boolean(j.live));
          setLoaded(true);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not open Ask Bond."));
    }
    window.setTimeout(() => box.current?.focus(), 350);
    return () => cancelAnimationFrame(id);
  }, [open, loaded]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines, busy]);

  async function send(q?: string) {
    const said = (q ?? text).trim();
    if (!said || busy) return;
    setText("");
    setError(null);
    setBusy(true);
    setLines((l) => [...l, { role: "agent", text: said }]);
    try {
      const r = await fetch("/api/bond/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: said, districts, focus }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.reason ?? "Bond did not answer.");
      setLines((l) => [...l, { role: "bond", text: j.reply, steps: j.steps }]);
      if (j.live === false && live !== false) setLive(false);
      if (j.live === true) setLive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bond did not answer.");
    } finally {
      setBusy(false);
      window.setTimeout(() => box.current?.focus(), 50);
    }
  }

  async function clear() {
    await fetch("/api/bond/ask", { method: "DELETE" }).catch(() => null);
    setLines([]);
  }

  if (!open) return null;

  const openers = focus ? (focus.kind === "door" ? DOOR_OPENERS : LANDLORD_OPENERS) : OPENERS;

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/25 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] sm:w-[480px] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <DoodleIcon name="magic-wand" size={18} />
            <div>
              <p className="hand text-[20px] leading-none">Ask Bond</p>
              <p className="mt-0.5 text-[10.5px] text-muted">
                {live === false ? "Not switched on in this environment" : "Reads the patch, drafts the words, never presses the button"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lines.length > 0 && (
              <button type="button" onClick={clear} className="text-[11px] text-muted underline-offset-2 hover:underline" title="Start again. The conversation is kept for James.">
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {focus && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line/60 bg-accent-soft/30 px-5 py-2">
            <DoodleIcon name={focus.kind === "door" ? "home" : "user"} size={14} />
            <p className="min-w-0 flex-1 truncate text-[12px]">
              <span className="text-muted">Asking about </span>
              {focus.label}
            </p>
            <button type="button" onClick={onClearFocus} className="text-[11px] text-muted hover:text-ink" title="Ask about the patch instead">
              ✕
            </button>
          </div>
        )}

        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!loaded && !error && <p className="text-[12px] text-muted">Opening…</p>}
          {loaded && lines.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line/80 p-4 text-[12.5px] text-muted">
              <p>Ask anything about the patch: what to do first, why a door is flagged, the story of one address, or for the letter. Bond reads what is on the board and answers from that.</p>
            </div>
          )}
          {lines.map((l, i) =>
            l.role === "agent" ? (
              <p key={i} className="ml-10 whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-[12.5px] text-accent-dark">
                {l.text}
              </p>
            ) : (
              <div key={i} className="mr-6">
                <div className="group relative rounded-2xl rounded-bl-md bg-box px-3.5 py-2.5">
                  <Says text={l.text} />
                  <div className="absolute -right-1 -top-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyButton value={l.text} label="reply" />
                  </div>
                </div>
                {l.steps && l.steps.length > 0 && <p className="mt-1 pl-1 text-[10px] leading-relaxed text-muted">{l.steps.join(" · ")}</p>}
              </div>
            )
          )}
          {busy && (
            <div className="mr-6 rounded-2xl rounded-bl-md bg-box px-3.5 py-2.5 text-[12px] text-muted">
              <span className="inline-block animate-pulse">Reading the board…</span>
            </div>
          )}
          {error && <p className="text-[12px] text-red-700">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-line/70 px-5 pb-5 pt-3">
          {loaded && !busy && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {openers.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => send(o)}
                  className="rounded-full border border-line/80 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2 rounded-2xl border border-line/80 bg-panel px-3 py-2"
          >
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
              rows={Math.min(4, Math.max(1, text.split("\n").length))}
              placeholder={focus ? "Ask about this one…" : "Ask Bond…"}
              disabled={busy || !loaded}
              className="min-h-[28px] flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted/70"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-page disabled:opacity-40"
            >
              Ask
            </button>
          </form>
          <p className="mt-1.5 text-[10px] text-muted">Drafts are for James or Susan to sign off. Conversations are kept.</p>
        </div>
      </aside>
    </div>
  );
}
