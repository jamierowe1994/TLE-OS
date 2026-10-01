"use client";

import { useEffect, useState } from "react";
import "./launch-clock.css";

/**
 * The launch countdown on the Admin overview, in place of the illustration
 * (James, 2 Oct 2026). The same retro flip clock as the team's countdown
 * (repo jamierowe1994/CLOCK, app/CountdownClock.tsx): sage casing, dark face,
 * white split-flap cards, counting to 9am London on Wednesday 14 October.
 *
 * Written in UTC on purpose: the clocks do not go back until 25 October, so
 * 9am that morning is BST, 08:00Z. A fixed launch moment, not a month scope -
 * everything is counted to it from the clock at the moment of asking.
 */
export const LAUNCH_AT = Date.UTC(2026, 9, 14, 8, 0, 0);

const secondsLeft = (now: number) => Math.max(0, Math.ceil((LAUNCH_AT - now) / 1000));

/** Worked out from the clock on every tick, never counted: a background tab
    throttles timers, and a counter would drift. */
function useSecondsLeft() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now();
      setLeft(secondsLeft(now));
      timer = setTimeout(tick, 1000 - (now % 1000) + 15);
    };
    tick();
    const wake = () => document.visibilityState === "visible" && setLeft(secondsLeft(Date.now()));
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  return left;
}

/* ── One split-flap card ──────────────────────────────────────────────────── */

function Flap({ char }: { char: string }) {
  const [cur, setCur] = useState(char);
  const [prev, setPrev] = useState(char);
  const [turn, setTurn] = useState(0);
  const [hot, setHot] = useState(false);

  useEffect(() => {
    if (char === cur) return;
    setPrev(cur);
    setCur(char);
    setTurn((t) => t + 1);
    setHot(true);
    const t = setTimeout(() => setHot(false), 650);
    return () => clearTimeout(t);
    // Only a new character starts a turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const turning = prev !== cur;
  return (
    <span className={hot ? "cd-flap cd-hot" : "cd-flap"} aria-hidden>
      <span className="cd-half cd-top"><span>{cur}</span></span>
      <span className="cd-half cd-bot"><span>{turning ? prev : cur}</span></span>
      {turning && (
        <>
          <span key={`t${turn}`} className="cd-half cd-top cd-fold-top"><span>{prev}</span></span>
          <span key={`b${turn}`} className="cd-half cd-bot cd-fold-bot" onAnimationEnd={() => setPrev(cur)}>
            <span>{cur}</span>
          </span>
        </>
      )}
      <span className="cd-line" />
    </span>
  );
}

const UNITS = ["Days", "Hours", "Minutes", "Seconds"];

export default function LaunchClock({ size = 26 }: { size?: number }) {
  const left = useSecondsLeft();
  const s = left ?? 0;
  const t = { days: Math.floor(s / 86_400), hours: Math.floor((s % 86_400) / 3_600), minutes: Math.floor((s % 3_600) / 60), seconds: s % 60 };
  const live = left === 0;
  const two = (n: number) => String(Math.min(n, 99)).padStart(2, "0");
  /* Blank cards until the browser's own clock has answered, so the first
     paint never shows a server-worked figure flipping to the right one. */
  const digits = left == null ? "        " : two(t.days) + two(t.hours) + two(t.minutes) + two(t.seconds);

  return (
    <div className="cd-mini" style={{ ["--d" as string]: `${size}px` }}>
      <p className="sr-only" role="timer">
        {live ? "TLE OS is live." : `TLE OS goes live in ${t.days} days, ${t.hours} hours, ${t.minutes} minutes and ${t.seconds} seconds.`}
      </p>
      <div className="cd-clock">
        <div className="cd-body">
          <span className="cd-button" style={{ left: "9%", width: "calc(var(--d) * 0.7)", background: "#a85a51" }} />
          <span className="cd-button" style={{ left: "46%", width: "calc(var(--d) * 1.2)", background: "#dbe2d2" }} />
          <span className="cd-stand" />
          <div className="cd-face">
            <div className="flex flex-col items-center" style={{ gap: "calc(var(--d) * 0.14)" }}>
              <span className="cd-lamp"><span /></span>
              <span style={{ fontWeight: 600, fontSize: "clamp(9px, calc(var(--d) * 0.19), 18px)", opacity: 0.85, whiteSpace: "nowrap" }}>
                {live ? "Is Live" : "Live In"}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="cd-window">
                {[0.18, 0.4, 0.62, 0.84].map((x) => (
                  <span key={x} className="cd-peg" style={{ left: `${x * 100}%` }} />
                ))}
                {UNITS.map((u, g) => (
                  <div key={u} className="cd-pair">
                    {[0, 1].map((k) => (
                      <Flap key={k} char={digits[g * 2 + k]} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex w-full justify-around">
                {UNITS.map((u) => (
                  <span key={u} className="cd-label">{u}</span>
                ))}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/tle-os-type-dark.png" alt="TLE OS" style={{ height: "calc(var(--d) * 0.3)", width: "auto" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
