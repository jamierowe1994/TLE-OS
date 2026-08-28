"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";

/**
 * The character in the corner, and the panel behind him.
 *
 * Replaces the "!" button. Same corner, same job, plus a Help side — James:
 * "when we click it for now it should have two different tabs, and it'll say,
 * 'Do you need help?' or 'Do you want to give feedback?'"
 *
 * ── What must survive from the old component ──────────────────────────────
 *
 * Two things that had nothing to do with the button and everything to do with
 * it being the one component mounted on every page:
 *
 *   1. THE PAGE TRACKER. It POSTs each navigation to /api/track. Losing it
 *      would quietly stop the record of who went where — no error, just an
 *      empty table nobody notices for a month.
 *   2. THE SIGNED-OUT GUARD. Renders nothing at all when nobody is signed in.
 *
 * ── Help is a question box, not a fake search ─────────────────────────────
 *
 * The guides do not exist yet and the assistant has no model behind it, so
 * anything that looked like search would be a box that always says "no
 * results". Instead the Help tab takes the question and logs it.
 *
 * That is not a placeholder — it is the most useful thing this tab can do
 * right now. Every question asked is a guide somebody needed and could not
 * find, so the list of them IS the writing order for the help centre. Build
 * the search first and you are guessing what to write.
 */

const IDLE_MS = 45_000;
const SLEEP_MS = 90_000;

export default function HelpDock() {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"help" | "feedback">("help");
  const [kind, setKind] = useState("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: unknown } | null) => setSignedIn(Boolean(j?.user)))
      .catch(() => {});
  }, []);

  /* The page tracker rides along here rather than in its own component: it
     fires on the same navigations, and one mount is cheaper than two. */
  useEffect(() => {
    if (!signedIn || !path) return;
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {});
  }, [path, signedIn]);

  /* Left alone he finds something else to do, then nods off. Deliberately slow
     — a character who reaches for his phone every ten seconds is a fidget, and
     the joke only works if you catch him at it occasionally. */
  const rest = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setMood("texting"), IDLE_MS),
      setTimeout(() => setMood("asleep"), SLEEP_MS),
    ];
  }, []);

  useEffect(() => {
    if (!signedIn || open) return;
    rest();
    return () => timers.current.forEach(clearTimeout);
  }, [signedIn, open, rest]);

  if (!signedIn) return null;

  function toggle() {
    timers.current.forEach(clearTimeout);
    const next = !open;
    setOpen(next);
    if (next) {
      /* Caught napping, he startles first and greets afterwards. */
      const waking = mood === "asleep" || mood === "texting";
      setMood(waking ? "surprised" : "wave");
      if (waking) setTimeout(() => setMood("wave"), 1050);
      setTimeout(() => setMood("idle"), waking ? 2900 : 1900);
    } else {
      setMood("idle");
      rest();
    }
  }

  async function send(as: "feedback" | "question") {
    setBusy(true);
    setMood("thinking");
    await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body,
        path,
        /* Questions are their own kind. They are not defects and must not
           land in the same pile — one is a fix, the other is a page that
           needs writing. */
        kind: as === "question" ? "question" : kind,
        context: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          ua: navigator.userAgent.slice(0, 160),
        },
      }),
    }).catch(() => {});
    setBusy(false);
    setDone(true);
    setBody("");
    setMood("happy");
    setTimeout(() => {
      setDone(false);
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
        <div className="fade-up fixed bottom-24 right-5 z-[190] w-[min(340px,calc(100vw-2.5rem))] rounded-2xl border border-line/80 bg-panel p-4 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)]">
          {done ? (
            <p className="py-5 text-center text-[13px]">Thanks — that&apos;s with James.</p>
          ) : (
            <>
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
                  <p className="mt-3 text-[13.5px]">Ask me anything</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    I can&rsquo;t answer on my own yet, so your question goes to James — and the
                    answers become the help centre. Asking is genuinely useful.
                  </p>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="How do I&hellip;?"
                    className="mt-3 w-full rounded-lg border border-line/80 bg-box p-2.5 text-[12.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !body.trim()}
                      onClick={() => send("question")}
                      className="flex-1 rounded-lg bg-accent-dark py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      {busy ? "Sending…" : "Ask"}
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
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="What were you doing, and what happened?"
                    className="mt-3 w-full rounded-lg border border-line/80 bg-box p-2.5 text-[12.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !body.trim()}
                      onClick={() => send("feedback")}
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
            </>
          )}
        </div>
      )}
    </>
  );
}
