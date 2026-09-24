"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT, type ToastDetail } from "@/lib/toast";

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
 */
export default function Toaster() {
  const [item, setItem] = useState<(ToastDetail & { key: number }) | null>(null);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const clearTimer = useRef<number | null>(null);

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

  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4">
      {item && (
        <div
          key={item.key}
          className={`flex max-w-[min(92vw,460px)] items-center gap-2.5 rounded-2xl px-4 py-2.5 text-[13px] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
            item.tone === "bad" ? "bg-accent-dark text-white" : "bg-ink text-page"
          } ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
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
          <span className={item.tone === "bad" ? "line-clamp-2" : "truncate"}>{item.text}</span>
        </div>
      )}
    </div>
  );
}
