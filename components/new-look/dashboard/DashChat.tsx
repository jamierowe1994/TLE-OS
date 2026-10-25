"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import AssistantSays, { type Screen } from "@/components/AssistantSays";
import { GUIDE_EVENT } from "@/lib/steve-guide";
import { getOpenListing } from "@/lib/open-record";

/**
 * Asking Steve from the Dashboard (James, 25 Oct 2026): "rather than inputting
 * it into Steve's chat function, just replying on the actual chat... all of
 * the stats should drop out, and then it just becomes an LLM conversation
 * screen." The box is one white pill with a coral send; the conversation is
 * drawn on the page itself, the question as text, his three dots while he
 * works, then his answer, with the box risen to the foot of the screen.
 *
 * The same Steve as his own panel (POST /api/assistant/ask), in a thread of
 * its own (`d<time>`, kept apart like the orb's chats), so it is there in his
 * list of conversations afterwards. What the panel does that a page of text
 * cannot - a card to check and press, a plan of presses on the screen - is
 * handed to the panel with the same question rather than half-drawn here.
 */

export type Said = {
  who: "me" | "steve";
  text: string;
  /** Somewhere he opened or offered: a button, never a jump away from the chat. */
  go?: { href: string; label: string };
  /** He walks them through a screen (lib/steve-guide). */
  guide?: string;
  /** A card or a plan to press: carried on in his panel. */
  handOff?: boolean;
};

export function useDashChat() {
  const [talk, setTalk] = useState<Said[]>([]);
  const [busy, setBusy] = useState(false);
  const [screens, setScreens] = useState<Screen[]>([]);
  const thread = useRef<string>("");
  const asked = useRef(false);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    if (!thread.current) thread.current = `d${Date.now()}`;
    setTalk((t) => [...t, { who: "me", text }]);
    setBusy(true);
    /* The screens he may link to, once a visit: a link to anything else stays as words (AssistantSays). */
    if (!asked.current) {
      asked.current = true;
      void fetch("/api/assistant/ask", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((r) => setScreens(Array.isArray(r?.screens) ? r.screens : []))
        .catch(() => null);
    }
    const r = await fetch("/api/assistant/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, kind: "ask", thread: thread.current, separate: true, path: "/dashboard", openListingId: getOpenListing() }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    const go = [r?.open, r?.offer].find((o) => o && typeof o.href === "string" && typeof o.label === "string");
    setTalk((t) => [
      ...t,
      {
        who: "steve",
        text: r?.reply ?? "Something went wrong sending that. Try again in a moment.",
        go: go ? { href: go.href, label: go.label } : undefined,
        guide: typeof r?.guide === "string" ? r.guide : undefined,
        handOff: Boolean(r?.proposal || (r?.screen && Array.isArray(r.screen.steps) && r.screen.steps.length)),
      },
    ]);
    setBusy(false);
  }, [busy]);

  const reset = useCallback(() => {
    setTalk([]);
    setBusy(false);
    thread.current = "";
  }, []);

  return { talk, busy, screens, send, reset };
}

/** The one-line box: a white pill, a faint grey edge, a coral round send. */
export const AskPill = forwardRef<HTMLInputElement, { onSend: (text: string) => void; busy?: boolean; docked?: boolean; placeholder?: string }>(function AskPill(
  { onSend, busy = false, docked = false, placeholder = "How can Steve help today?" },
  ref
) {
  const [q, setQ] = useState("");
  const go = () => {
    if (!q.trim() || busy) return;
    onSend(q);
    setQ("");
  };
  return (
    <form
      className={`nl-dash-pillbox${docked ? " is-docked" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Ask Steve" autoComplete="off" enterKeyHint="send" />
      <button type="submit" className="nl-dash-pillsend" aria-label="Send to Steve" disabled={!q.trim() || busy}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </form>
  );
});

/** The conversation on the page: theirs as text on the right, his on the left, his dots while he works. */
export function DashThread({ talk, busy, screens, onSend, onBack }: { talk: Said[]; busy: boolean; screens: Screen[]; onSend: (text: string) => void; onBack: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    /* Each new line glides into view above the box. */
    const t = window.setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    return () => window.clearTimeout(t);
  }, [talk.length, busy]);
  useEffect(() => {
    const t = window.setTimeout(() => box.current?.focus({ preventScroll: true }), 520);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section className="nl-dash-chat" aria-label="Talking to Steve">
      <div className="nl-dash-chat-top">
        <button type="button" className="nl-link" onClick={onBack}>
          Back to your day
        </button>
      </div>
      <ol className="nl-dash-lines" aria-live="polite">
        {talk.map((l, i) => (
          <li key={i} className={`nl-dash-line is-${l.who}`}>
            {l.who === "me" ? (
              <p>{l.text}</p>
            ) : (
              <>
                <span className="nl-dash-line-who">
                  <i aria-hidden />
                  Steve
                </span>
                <div className="nl-dash-line-text">
                  <AssistantSays text={l.text} screens={screens} />
                </div>
                {(l.go || l.guide || l.handOff) && (
                  <div className="nl-dash-line-acts">
                    {l.go && (
                      <a className="nl-btn nl-btn--secondary nl-btn--sm" href={l.go.href}>
                        Open {l.go.label}
                      </a>
                    )}
                    {l.guide && (
                      <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: l.guide }))}>
                        Show me
                      </button>
                    )}
                    {l.handOff && (
                      <button
                        type="button"
                        className="nl-btn nl-btn--secondary nl-btn--sm"
                        onClick={() => {
                          const asked = [...talk.slice(0, i)].reverse().find((x) => x.who === "me")?.text;
                          if (asked) window.dispatchEvent(new CustomEvent("os-steve-ask", { detail: asked }));
                        }}
                      >
                        Check it in Steve&apos;s panel
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {busy && (
          <li className="nl-dash-line is-steve is-typing" aria-label="Steve is typing">
            <span className="nl-dash-line-who">
              <i aria-hidden />
              Steve
            </span>
            <span className="nl-dash-typing" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </li>
        )}
      </ol>
      <div ref={end} />
      <div className="nl-dash-dock">
        <AskPill ref={box} onSend={onSend} busy={busy} docked placeholder="Ask Steve something else" />
      </div>
    </section>
  );
}
