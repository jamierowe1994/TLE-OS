"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";
import AssistantSays, { type Screen } from "@/components/AssistantSays";

/**
 * The character in the corner, and what he says.
 *
 * ── A speech bubble, not a panel ──────────────────────────────────────────
 *
 * James, 29 Aug: "in a perfect world I would love to be able to show this
 * rather than in a square… it should be almost in a speech bubble."
 *
 * The tail is the whole point. A floating card near a character is a UI panel
 * that happens to be nearby; a bubble with a tail pointing at his head is HIM
 * TALKING. Same pixels, completely different relationship — and it is what
 * makes the thinking animation mean something, because you can see who is
 * doing the thinking.
 *
 * ── The introduction ──────────────────────────────────────────────────────
 *
 * First time someone opens him he asks their name, then what they think they
 * will need most help with. We know the name already; asking is the point. It
 * is an introduction, and a thing you have been introduced to gets treated
 * differently from a form. The second answer is the genuinely useful one — it
 * is every agent telling us, before they have been disappointed by anything,
 * what they expect to struggle with.
 *
 * ── Two things carried from the old ReportBug ─────────────────────────────
 *
 * The page tracker and the signed-out guard. Neither has anything to do with
 * the button and everything to do with this being the one component mounted on
 * every page — losing the tracker would silently end the record of who went
 * where.
 */

/* One minute to reach for his phone, another before he nods off. James asked
   for a minute; splitting it in two means you occasionally catch him mid-scroll
   rather than only ever finding him asleep. */
const PHONE_MS = 60_000;
const SLEEP_MS = 120_000;

type Line = { role: "agent" | "assistant"; text: string };

export default function HelpDock() {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"help" | "feedback">("help");

  const [lines, setLines] = useState<Line[]>([]);
  const [stage, setStage] = useState<"ask" | "onboarding-name" | "onboarding-help">("ask");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  /* The screens he is allowed to send anyone to. Comes from the server rather
     than a copy kept here, so a screen added to the rail needs no second edit
     — see the allowlist note in AssistantSays. */
  const [screens, setScreens] = useState<Screen[]>([]);

  const [kind, setKind] = useState("bug");
  const [fb, setFb] = useState("");
  const [sent, setSent] = useState(false);

  const [mood, setMood] = useState<Mood>("idle");
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const thread = useRef(String(Date.now()));
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: unknown } | null) => setSignedIn(Boolean(j?.user)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!signedIn || !path) return;
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {});
  }, [path, signedIn]);

  const rest = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setMood("texting"), PHONE_MS),
      setTimeout(() => setMood("asleep"), SLEEP_MS),
    ];
  }, []);

  useEffect(() => {
    if (!signedIn || open) return;
    rest();
    return () => timers.current.forEach(clearTimeout);
  }, [signedIn, open, rest]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines, busy]);

  if (!signedIn) return null;

  async function toggle() {
    timers.current.forEach(clearTimeout);
    const next = !open;
    setOpen(next);
    if (!next) {
      setMood("idle");
      rest();
      return;
    }

    /* Caught napping or mid-scroll, he startles before he greets you. */
    const waking = mood === "asleep" || mood === "texting";
    setMood(waking ? "surprised" : "wave");
    setTimeout(() => setMood("idle"), waking ? 2600 : 1800);

    if (lines.length) return;
    const r = await fetch("/api/assistant/ask", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setLive(Boolean(r?.live));
    setScreens(Array.isArray(r?.screens) ? r.screens : []);
    const history: Line[] = (r?.history ?? []).map((h: Line) => ({ role: h.role, text: h.text }));

    if (r && !r.onboarded) {
      setStage("onboarding-name");
      setLines([...history, { role: "assistant", text: "Hello — I don't think we've met. What should I call you?" }]);
    } else {
      setStage("ask");
      setLines(
        history.length
          ? history
          : [{ role: "assistant", text: "Hello again. What can I help you with?" }]
      );
    }
  }

  async function say() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setLines((l) => [...l, { role: "agent", text }]);
    setBusy(true);
    setMood("thinking");

    const r = await fetch("/api/assistant/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, kind: stage, thread: thread.current, path }),
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);

    const answer = r?.reply ?? "Something went wrong sending that. Try again in a moment.";
    setLines((l) => [...l, { role: "assistant", text: answer }]);
    setBusy(false);

    /* Thinking ends the moment he has something to say, and he says it —
       which is the whole reason the mouth animates. */
    setMood("talking");
    setTimeout(() => setMood("idle"), 1400);

    setStage(stage === "onboarding-name" ? "onboarding-help" : "ask");
  }

  async function sendFeedback() {
    setBusy(true);
    setMood("thinking");
    await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: fb,
        path,
        kind,
        context: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          ua: navigator.userAgent.slice(0, 160),
        },
      }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
    setFb("");
    setMood("happy");
    setTimeout(() => {
      setSent(false);
      setOpen(false);
      setMood("idle");
      rest();
    }, 2400);
  }

  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
      on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 text-muted hover:text-ink"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Help and feedback"
        aria-label="Help and feedback"
        aria-expanded={open}
        className="fixed bottom-2 right-3 z-[190] text-ink transition-transform hover:scale-105 active:scale-95"
      >
        <AssistantCharacter mood={mood} size={76} />
      </button>

      {open && (
        <div
          /* Shifted left of the character so the tail lands on his head rather
             than beside it, and so the bubble does not sit directly over him. */
          className="fade-up fixed bottom-[104px] right-[68px] z-[190] w-[min(340px,calc(100vw-2.5rem))]"
        >
          <div className="relative rounded-[22px] border border-line/80 bg-panel p-4 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)]">
            {/* The tail. Two stacked squares — the outer one carries the border
                colour, the inner one covers the join so the bubble's own edge
                does not run straight through it. */}
            <span className="absolute -bottom-[9px] right-9 h-4 w-4 rotate-45 border-b border-r border-line/80 bg-panel" />
            <span className="absolute -bottom-[1px] right-9 h-4 w-4 rotate-45 bg-panel" />

            <div className="relative">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setTab("help")} className={pill(tab === "help")}>
                  Need help?
                </button>
                <button type="button" onClick={() => setTab("feedback")} className={pill(tab === "feedback")}>
                  Give feedback
                </button>
              </div>

              {tab === "help" ? (
                <>
                  <div
                    ref={scroller}
                    className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-0.5"
                  >
                    {lines.map((l, i) =>
                      l.role === "agent" ? (
                        <p
                          key={i}
                          className="ml-8 rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[12.5px] text-accent-dark"
                        >
                          {l.text}
                        </p>
                      ) : (
                        <AssistantSays
                          key={i}
                          text={l.text}
                          screens={screens}
                          /* Taking somebody somewhere and leaving the bubble
                             open would cover the screen they just asked to be
                             shown. He gets out of the way. */
                          onNavigate={() => setOpen(false)}
                        />
                      )
                    )}
                    {busy && (
                      <p className="mr-6 rounded-2xl rounded-bl-md bg-box px-3 py-2 text-[12.5px] text-muted">
                        …
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") say();
                      }}
                      autoFocus
                      placeholder={
                        stage === "onboarding-name"
                          ? "Your name"
                          : stage === "onboarding-help"
                            ? "What you'd like a hand with"
                            : "Ask me anything…"
                      }
                      className="min-w-0 flex-1 rounded-lg border border-line/80 bg-box px-2.5 py-2 text-[12.5px]"
                    />
                    <button
                      type="button"
                      onClick={say}
                      disabled={busy || !draft.trim()}
                      className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                  {/* Says which of the two he currently is. Claiming to answer
                      when the key is missing, or claiming not to when it is
                      there, are both worse than the extra line of state. */}
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                    {live
                      ? "I answer from what the business has written down, and I'll say so when it isn't covered. Everything you ask goes to James either way."
                      : "I can't answer on my own just now — everything you ask goes to James, and the answers become the help centre."}
                  </p>
                </>
              ) : sent ? (
                <p className="py-5 text-center text-[13px]">Thanks — that&apos;s logged.</p>
              ) : (
                <>
                  <p className="mt-3 text-[13.5px]">Tell us what happened</p>
                  <p className="mt-1 text-[11px] text-muted">
                    On {path}. We capture the page and your browser, so no need to describe them.
                  </p>
                  {/* Three kinds, not one. A pilot produces far more "confusing"
                      than "broken", and collapsing them means the most useful
                      signal — where people get lost — arrives disguised as a
                      defect and gets closed as "works as designed". */}
                  <div className="mt-3 flex gap-1.5">
                    {[
                      ["bug", "Broken"],
                      ["confusing", "Confusing"],
                      ["idea", "Idea"],
                    ].map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setKind(k)} className={pill(kind === k)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={fb}
                    onChange={(e) => setFb(e.target.value)}
                    rows={4}
                    placeholder="What were you doing, and what happened?"
                    className="mt-3 w-full rounded-lg border border-line/80 bg-box p-2.5 text-[12.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !fb.trim()}
                      onClick={sendFeedback}
                      className="flex-1 rounded-lg bg-accent-dark py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      {busy ? "Sending…" : "Send"}
                    </button>
                    <button
                      type="button"
                      onClick={toggle}
                      className="rounded-lg border border-line/80 px-3 py-2 text-[12px]"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
