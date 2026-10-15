"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Which pages people open, and how long they stay (15 Oct 2026, Admin >
 * Tracking).
 *
 * The view count used to live inside HelpDock, which is not drawn inside the
 * iPhone app or on the phone screens, so nothing an agent did on their phone
 * was ever counted. It is its own piece now, mounted by the OS, the agents'
 * app (/agent) and the phone site (/m).
 *
 * Time is counted only while the page is on screen AND somebody has touched,
 * typed or scrolled in the last five minutes: a tab left open over lunch is
 * not two hours of reading. It is reported when the page changes or is hidden
 * (sendBeacon, so it survives the tab closing). The first report of a visit
 * says so, which is how the server counts visits once and seconds always.
 *
 * Nothing here can break a page: every call is fire-and-forget, and the server
 * answers 204 whoever asks, signed in or not.
 */

const TICK_MS = 5_000;
const IDLE_MS = 5 * 60_000;

function send(body: Record<string, unknown>) {
  try {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([json], { type: "application/json" }))) return;
    void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: json, keepalive: true }).catch(() => {});
  } catch {
    /* never surfaced */
  }
}

export default function PageTracker() {
  const path = usePathname();
  const visit = useRef<{ path: string; seconds: number; reported: boolean } | null>(null);
  const lastInput = useRef(Date.now());

  /* Hand in whatever the current visit has counted and not yet reported. */
  const flush = useRef(() => {
    const v = visit.current;
    if (!v || v.seconds < 1) return;
    send({ path: v.path, seconds: v.seconds, first: !v.reported });
    v.reported = true;
    v.seconds = 0;
  });

  useEffect(() => {
    if (!path) return;
    flush.current();
    visit.current = { path, seconds: 0, reported: false };
    lastInput.current = Date.now();
    send({ path });
  }, [path]);

  useEffect(() => {
    const touched = () => {
      lastInput.current = Date.now();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush.current();
      else touched();
    };
    const leave = () => flush.current();
    const t = setInterval(() => {
      const v = visit.current;
      if (v && document.visibilityState === "visible" && Date.now() - lastInput.current < IDLE_MS) v.seconds += TICK_MS / 1000;
    }, TICK_MS);
    const opts = { passive: true } as const;
    for (const e of ["pointerdown", "keydown", "scroll", "touchstart", "wheel"]) window.addEventListener(e, touched, opts);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(t);
      for (const e of ["pointerdown", "keydown", "scroll", "touchstart", "wheel"]) window.removeEventListener(e, touched);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  return null;
}
