"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOAST_EVENT, TOAST_LIFT_EVENT, type ToastDetail, type ToastLift } from "@/lib/toast";

/**
 * Shows lib/toast's messages, one at a time, at the foot of the window.
 *
 * One at a time because they come in bursts - four clicks on a stepper is one
 * save, but a bedroom and then an email a second later is two - and a stack
 * of pills saying Saved is noise. The newest replaces what is showing and
 * restarts its clock. A problem stays up longer than a Saved.
 *
 * Above the drawers (z 120) so it still shows over a lead file, and after one
 * has closed.
 *
 * ── Under Steve, not on him (James, 1 Oct 2026) ──────────────────────────
 *
 * At the foot it sat in the middle and ran into Steve in the corner (Howard,
 * testing). So the bottom toast now comes up in the corner UNDERNEATH him:
 * it tells everything marked .os-toast-lift (Steve, Report a problem, his
 * bubble) how tall it is, they rise out of the way, and it slides in below.
 * When it goes, they drop back to the floor with a little bounce
 * (globals.css). The top toast, on the tenant sheets, moves nothing.
 */

/** Clear space between the top of the toast and Steve's feet. */
const GAP = 14;

export default function Toaster({ at = "bottom" }: { at?: "bottom" | "top" } = {}) {
  const [item, setItem] = useState<(ToastDetail & { key: number }) | null>(null);
  const [shown, setShown] = useState(false);
  const pill = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const clearTimer = useRef<number | null>(null);
  const lifts = at === "bottom";

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (!d?.text) return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      setItem({ ...d, key: Date.now() });
      /* Next frame, so a fresh pill slides in rather than popping. */
      requestAnimationFrame(() => setShown(true));
      hideTimer.current = window.setTimeout(() => {
        setShown(false);
        clearTimer.current = window.setTimeout(() => setItem(null), 250);
      }, d.tone === "bad" ? 6000 : 2400);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, []);

  /* Make room before the pill is painted, and give it back once the pill has
     gone - so Steve is already on his way up as it arrives, and only drops
     when there is nothing left under him. */
  const lifted = useRef(false);
  useLayoutEffect(() => {
    if (!lifts) return;
    const root = document.documentElement;
    const up = Boolean(item && pill.current);
    if (up) root.style.setProperty("--os-toast-lift", `${pill.current!.offsetHeight + GAP}px`);
    root.dataset.osToast = up ? "up" : "down";
    /* Only on a change: a toast replacing a toast keeps him where he is. */
    if (up !== lifted.current) {
      lifted.current = up;
      window.dispatchEvent(new CustomEvent<ToastLift>(TOAST_LIFT_EVENT, { detail: up ? "up" : "down" }));
    }
  }, [item, lifts]);

  useEffect(() => {
    if (!lifts) return;
    return () => {
      delete document.documentElement.dataset.osToast;
    };
  }, [lifts]);

  return (
    <div
      aria-live="polite"
      role="status"
      className={`pointer-events-none fixed z-[200] flex ${
        at === "top" ? "inset-x-0 top-4 justify-center px-4" : "bottom-3 right-3 justify-end pl-4"
      }`}
    >
      {item && (
        <div
          key={item.key}
          ref={pill}
          className={`flex max-w-[min(calc(100vw-1.5rem),460px)] items-center gap-2.5 rounded-2xl px-4 py-2.5 text-[13px] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)] transition-[opacity,translate] ease-out motion-reduce:transition-none ${
            item.tone === "bad" ? "bg-accent-dark text-white" : "bg-ink text-page"
          } ${
            shown
              ? `translate-y-0 opacity-100 duration-200 ${lifts ? "delay-100" : ""}`
              : at === "top"
                ? "-translate-y-2 opacity-0 duration-200"
                : "translate-y-3 opacity-0 duration-200"
          }`}
        >
          {item.tone === "ok" ? (
            <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M8 4v5M8 11.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <span className={item.tone === "bad" ? "line-clamp-3" : "truncate"}>{item.text}</span>
        </div>
      )}
    </div>
  );
}
