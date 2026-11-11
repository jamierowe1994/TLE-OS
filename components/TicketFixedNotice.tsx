"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * STEVE SAYS IT'S FIXED (James, 9 Nov 2026): "have Steve pop up and open the
 * next time that they sign in, or if they're on the platform at the time, to
 * say that we've fixed that ticket and give them the explanation ... If the
 * problem persists, they should be able to reply back to that message, and
 * then that will relaunch a ticket with the new context."
 *
 * A card from Steve, beside him in the corner: what they told us, how we fixed
 * it, and two answers - Sorted, thanks / It's still happening. The second
 * opens a box; what they type goes back on the ticket and it opens again
 * (POST /api/bugs/fixed, lib/ticket-fixed). Asked for on arrival, when the
 * window comes back into focus, and every couple of minutes while they're
 * here, so a fix that goes live mid-afternoon reaches them without a reload.
 * Mounted once in the OS layout.
 */

type Notice = { id: string; said: string; story: string; path: string; fixedAt: string; firstName: string };

const POLL_MS = 120_000;

export default function TicketFixedNotice() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState<"read" | "reply" | "sending" | "sent" | "sorted">("read");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const n = notices[0] ?? null;

  const load = useCallback(async () => {
    const j = await fetch("/api/bugs/fixed", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const list: Notice[] = Array.isArray(j?.notices) ? j.notices : [];
    setNotices((cur) => (cur.length && mode !== "read" ? cur : list));
  }, [mode]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  /* In a beat after it arrives, so it slides in rather than being there. */
  useEffect(() => {
    if (!n) return setShown(false);
    const t = window.setTimeout(() => setShown(true), 600);
    /* Steve waves as it comes in. */
    window.dispatchEvent(new CustomEvent("os-steve-wave"));
    return () => window.clearTimeout(t);
  }, [n?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === "reply") window.setTimeout(() => box.current?.focus(), 60);
  }, [mode]);

  if (!n) return null;

  const post = (body: Record<string, unknown>) =>
    fetch("/api/bugs/fixed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id, ...body }) })
      .then((r) => r.json().catch(() => ({})))
      .catch(() => ({ ok: false }));

  const next = (delay = 0) =>
    window.setTimeout(() => {
      setShown(false);
      window.setTimeout(() => {
        setNotices((cur) => cur.slice(1));
        setMode("read");
        setText("");
        setErr(null);
      }, 320);
    }, delay);

  const close = () => {
    void post({ action: "seen" });
    next();
  };
  const sorted = () => {
    setMode("sorted");
    void post({ action: "sorted" });
    next(1600);
  };
  const send = async () => {
    const words = text.trim();
    if (!words) return setErr("Tell me what's still happening.");
    setMode("sending");
    const j = await post({ action: "reopen", text: words });
    if (j?.ok) {
      setMode("sent");
      next(2600);
    } else {
      setMode("reply");
      setErr(j?.error ?? "That didn't go. Try again in a minute.");
    }
  };

  const said = n.said.split(/\n\nCame back /)[0];

  return (
    <aside className={`tfn${shown ? " is-on" : ""}`} role="dialog" aria-live="polite" aria-label="Steve: your ticket is fixed">
      <style>{CSS}</style>
      <header className="tfn-h">
        <span className="tfn-face" aria-hidden>
          <i />
          <i />
        </span>
        <div className="min-w-0 flex-1">
          <p className="tfn-k">Steve · your ticket</p>
          <h2 className="tfn-t">Great news, {n.firstName}</h2>
        </div>
        <button type="button" className="tfn-x" onClick={close} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {mode === "sent" ? (
        <p className="tfn-p">Thanks - I&apos;ve sent that straight back to the team with what you said. You&apos;ll hear from me when it&apos;s sorted.</p>
      ) : mode === "sorted" ? (
        <p className="tfn-p">Brilliant. Thanks for letting us know.</p>
      ) : (
        <>
          <p className="tfn-p">We&apos;ve fixed the problem you reported, and it&apos;s live now.</p>
          <div className="tfn-row">
            <span className="tfn-l">You told us</span>
            <p className="tfn-q">{said}</p>
          </div>
          {n.story && (
            <div className="tfn-row is-fix">
              <span className="tfn-l">How we fixed it</span>
              <p className="tfn-s">{n.story}</p>
            </div>
          )}
          {mode === "read" ? (
            <div className="tfn-acts">
              <button type="button" className="tfn-btn is-primary" onClick={sorted}>
                Sorted, Thanks
              </button>
              <button type="button" className="tfn-btn" onClick={() => setMode("reply")}>
                It&apos;s Still Happening
              </button>
            </div>
          ) : (
            <div className="tfn-reply">
              <label className="tfn-l" htmlFor="tfn-text">
                What&apos;s still happening?
              </label>
              <textarea
                id="tfn-text"
                ref={box}
                value={text}
                rows={3}
                maxLength={2000}
                onChange={(e) => {
                  setText(e.target.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                }}
                placeholder="What you did, and what happened"
              />
              {err && <p className="tfn-err">{err}</p>}
              <div className="tfn-acts">
                <button type="button" className="tfn-btn is-primary" disabled={mode === "sending"} onClick={() => void send()}>
                  {mode === "sending" ? "Sending…" : "Send It Back"}
                </button>
                <button type="button" className="tfn-btn" disabled={mode === "sending"} onClick={() => setMode("read")}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {notices.length > 1 && mode === "read" && <p className="tfn-more">{notices.length - 1} more fixed after this one</p>}
    </aside>
  );
}

const CSS = `
.tfn { position: fixed; right: 24px; bottom: 104px; z-index: 120; width: min(392px, calc(100vw - 32px)); background: #fff; color: #231d1b;
  border: 1px solid rgba(35,29,27,.14); border-top: 3px solid #56634a; box-shadow: 0 24px 60px -24px rgba(35,29,27,.45);
  padding: 18px 20px 18px; font-family: var(--font-inter), Inter, system-ui, sans-serif;
  opacity: 0; transform: translateY(14px) scale(.98); transform-origin: 100% 100%; pointer-events: none;
  transition: opacity .32s cubic-bezier(.22,1,.36,1), transform .42s cubic-bezier(.22,1,.36,1); }
.tfn.is-on { opacity: 1; transform: none; pointer-events: auto; }
.tfn::after { content: ""; position: absolute; right: 30px; bottom: -9px; width: 16px; height: 16px; background: #fff;
  border-right: 1px solid rgba(35,29,27,.14); border-bottom: 1px solid rgba(35,29,27,.14); transform: rotate(45deg); }
.tfn-h { display: flex; align-items: center; gap: 12px; }
.tfn-face { position: relative; flex: none; width: 38px; height: 38px; border-radius: 50%; background: #56423e; display: flex; align-items: center; justify-content: center; gap: 7px; }
.tfn-face i { width: 5px; height: 8px; border-radius: 3px; background: #f5efe6; animation: tfn-blink 4.5s infinite; }
@keyframes tfn-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.15); } }
.tfn-k { margin: 0; font-family: var(--font-bricolage), "Helvetica Neue", Arial, sans-serif; font-stretch: 75%; font-weight: 500; text-transform: uppercase; letter-spacing: .18em; font-size: 10.5px; color: #56634a; }
.tfn-t { margin: 2px 0 0; font-family: var(--font-bricolage), "Helvetica Neue", Arial, sans-serif; font-stretch: 75%; font-weight: 500; text-transform: uppercase; letter-spacing: .02em; font-size: 24px; line-height: 1; }
.tfn-x { flex: none; width: 32px; height: 32px; display: grid; place-items: center; color: #6b5f5a; border: 1px solid transparent; }
.tfn-x:hover { color: #231d1b; border-color: rgba(35,29,27,.14); }
.tfn-p { margin: 12px 0 0; font-size: 14px; line-height: 1.5; color: #231d1b; }
.tfn-row { margin-top: 12px; padding: 10px 12px; background: #f5efe6; }
.tfn-row.is-fix { background: #f1f4ec; }
.tfn-l { display: block; font-family: var(--font-bricolage), "Helvetica Neue", Arial, sans-serif; font-stretch: 75%; font-weight: 500; text-transform: uppercase; letter-spacing: .16em; font-size: 10.5px; color: #6b5f5a; }
.tfn-row.is-fix .tfn-l { color: #56634a; }
.tfn-q { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: #6b5f5a; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tfn-s { margin: 4px 0 0; font-size: 14px; line-height: 1.5; color: #231d1b; }
.tfn-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tfn-btn { height: 38px; padding: 0 14px; border: 1px solid rgba(35,29,27,.24); background: #fff; color: #231d1b;
  font-family: var(--font-bricolage), "Helvetica Neue", Arial, sans-serif; font-stretch: 75%; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; font-size: 12px; cursor: pointer; }
.tfn-btn:hover { border-color: #231d1b; }
.tfn-btn.is-primary { background: #56423e; border-color: #56423e; color: #fff; }
.tfn-btn.is-primary:hover { background: #3f302d; }
.tfn-btn:disabled { opacity: .55; cursor: default; }
.tfn-reply { margin-top: 14px; }
.tfn-reply textarea { width: 100%; margin-top: 6px; padding: 10px 12px; border: 1px solid rgba(35,29,27,.24); background: #fff; font: inherit; font-size: 14px; line-height: 1.45; resize: vertical; outline: 0; }
.tfn-reply textarea:focus { border-color: #231d1b; }
.tfn-err { margin: 6px 0 0; font-size: 12.5px; color: #a85a51; }
.tfn-more { margin: 10px 0 0; font-size: 12px; color: #9a8d86; }
@media (max-width: 640px) { .tfn { right: 16px; bottom: 92px; } }
@media (prefers-reduced-motion: reduce) { .tfn { transition: none; } .tfn-face i { animation: none; } }
`;
