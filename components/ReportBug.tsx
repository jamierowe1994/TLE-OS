"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The button in the corner, and the page tracker.
 *
 * ── Why it follows you rather than living on a page ───────────────────────
 *
 * A pilot agent who hits something odd must be one click from saying so, FROM
 * THE PAGE IT HAPPENED ON. A feedback form they have to go and find only ever
 * catches the things somebody was still annoyed about ten minutes later —
 * a biased and much smaller sample than the small confusions that actually
 * shape whether a product feels finished.
 *
 * ── Three kinds, not one ──────────────────────────────────────────────────
 *
 * "Broken", "Confusing" and "Idea". A pilot produces far more of the middle
 * one than of the first, and collapsing them into "bug" means the most useful
 * signal — where people get lost — arrives disguised as a defect report and
 * gets closed as "works as designed".
 *
 * ── Context is captured, not asked for ────────────────────────────────────
 *
 * The path, the viewport and the browser go automatically. Half of triage is
 * working out where somebody was standing, and asking them turns a fix into a
 * conversation.
 */
export default function ReportBug() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

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

  if (!signedIn) return null;

  async function send() {
    setBusy(true);
    await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body,
        path,
        kind,
        context: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          ua: navigator.userAgent.slice(0, 160),
        },
      }),
    }).catch(() => {});
    setBusy(false);
    setDone(true);
    setBody("");
    setTimeout(() => {
      setDone(false);
      setOpen(false);
    }, 2200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Report something"
        aria-label="Report something"
        className="fixed bottom-5 right-5 z-[190] h-12 w-12 rounded-full bg-accent-dark text-[18px] text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)]"
      >
        !
      </button>

      {open && (
        <div className="fade-up fixed bottom-20 right-5 z-[190] w-[min(340px,calc(100vw-2.5rem))] rounded-2xl border border-line/80 bg-panel p-4 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)]">
          {done ? (
            <p className="py-4 text-center text-[13px]">Thanks — that&apos;s logged.</p>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold">Tell us what happened</p>
              <p className="mt-1 text-[11px] text-muted">
                On {path}. We capture the page and your browser, so no need to describe them.
              </p>
              <div className="mt-3 flex gap-1.5">
                {[
                  ["bug", "Broken"],
                  ["confusing", "Confusing"],
                  ["idea", "Idea"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-full border px-3 py-1 text-[11.5px] ${
                      kind === k ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
                    }`}
                  >
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
                  onClick={send}
                  className="flex-1 rounded-lg bg-accent-dark py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-line/80 px-3 py-2 text-[12px]"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
