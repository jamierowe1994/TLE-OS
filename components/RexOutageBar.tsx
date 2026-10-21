"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The band that says REX is down and the screen is showing the copy
 * (21 Oct 2026, lib/rex-outage).
 *
 * James's live-figures rule allows the copy only because it is labelled, so
 * this sits across every OS screen and the phone view while REX is down -
 * with the time the copy was taken, and the earlier time too if anything on
 * screen is older than that. It asks every half minute and goes away by itself
 * when REX is back.
 */

type Status = { down: boolean; copyTakenAt: string | null; oldestServedAt: string | null; waiting: number };

function clock(isoAt: string): string {
  const d = new Date(isoAt);
  const time = d
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" })
    .replace(":", ".")
    .replace(/\s/g, "")
    .toLowerCase();
  const day = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  if (day(d) === day(new Date())) return time;
  const yesterday = new Date(Date.now() - 86_400_000);
  return day(d) === day(yesterday) ? `${time} yesterday` : `${time} on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}`;
}

export default function RexOutageBar({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let gone = false;
    const read = () =>
      fetch("/api/rex/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Status | null) => {
          if (!gone && j) setS(j);
        })
        .catch(() => {});
    void read();
    const t = setInterval(read, 30_000);
    const onFocus = () => void read();
    window.addEventListener("focus", onFocus);
    return () => {
      gone = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  /* The band's height for the shell's sticky rail (--os-band-h), so the
     rail sits under it rather than behind it when the page scrolls. */
  const ref = useRef<HTMLDivElement | null>(null);
  const down = Boolean(s?.down);
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!down || !el) {
      root.style.removeProperty("--os-band-h");
      return;
    }
    const set = () => root.style.setProperty("--os-band-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--os-band-h");
    };
  }, [down]);

  if (!s?.down) return null;

  /* Older than the run by more than ten minutes: say so, rather than let
     a 9am answer pass as the 2.25pm copy. */
  const older =
    s.oldestServedAt && s.copyTakenAt && Date.parse(s.copyTakenAt) - Date.parse(s.oldestServedAt) > 10 * 60_000
      ? s.oldestServedAt
      : !s.copyTakenAt
        ? s.oldestServedAt
        : null;

  return (
    <div
      ref={ref}
      role="status"
      data-rex-outage
      className="sticky top-0 z-[199] flex items-start gap-2.5 bg-[#5b3a29] px-4 py-2.5 text-white"
      style={{ paddingTop: compact ? "max(10px, env(safe-area-inset-top))" : undefined }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="mt-[1px] h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <p className={`${compact ? "text-[12px]" : "text-[12.5px]"} leading-snug`}>
        <span className="font-semibold">REX is down for maintenance until about 8am.</span>{" "}
        {s.copyTakenAt ? (
          <>You&rsquo;re seeing the copy taken at {clock(s.copyTakenAt)}{older ? `, and some of it from ${clock(older)}` : ""}.</>
        ) : older ? (
          <>You&rsquo;re seeing the last copy we have, from {clock(older)}.</>
        ) : (
          <>You&rsquo;re seeing the last copy we have.</>
        )}{" "}
        Changes made now are saved in TLE OS and sent to REX when it&rsquo;s back
        {s.waiting > 0 ? ` (${s.waiting} waiting)` : ""}.
      </p>
    </div>
  );
}
