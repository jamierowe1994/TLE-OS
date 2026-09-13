"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The load-in moment.
 *
 * It used to play a video, which meant one fixed clip, a download before
 * anyone saw anything, and a greeting that was identical every single time.
 * Now it's a drawing and a line of type: a different illustration on each
 * visit, so the OS feels like it has more than one mood, and nothing to wait
 * for because the art is already in the app.
 *
 * Short on purpose. A splash screen is a greeting, not a toll gate — it holds
 * for a beat and a half, and any click, key or scroll goes straight through.
 * Reduced motion skips it entirely, and it only shows once per session.
 */

/** James's own paintings (13 Sep 2026), not the stock line drawings. */
const ART = [
  "/brand/art/sign-in.webp",
  "/brand/art/lead-house.webp",
  "/brand/art/lead-building.webp",
  "/brand/art/appraisal-house.webp",
];

/** A line under the title, drawn from the same shuffle so it varies too. */
const LINES = [
  "Everything in one place.",
  "Let's get on with it.",
  "The day, ready when you are.",
  "Your book, live.",
  "Right then.",
];

export default function IntroGate({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);
  const done = useRef(false);

  /* Picked once per mount, and NOT during render on the server: the server
     and the browser would choose different pictures and React would keep the
     server's, so the shuffle would look broken about half the time. */
  const [pick, setPick] = useState<{ art: string; line: string } | null>(null);

  useEffect(() => {
    if (
      sessionStorage.getItem("os-intro-seen") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setPick({
      art: ART[Math.floor(Math.random() * ART.length)],
      line: LINES[Math.floor(Math.random() * LINES.length)],
    });
    setShow(true);
  }, []);

  const dismiss = useMemo(
    () => () => {
      if (done.current) return;
      done.current = true;
      sessionStorage.setItem("os-intro-seen", "1");
      setFading(true);
      window.setTimeout(() => setShow(false), 650);
    },
    []
  );

  /* It leaves on its own, and on any sign of impatience. */
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(dismiss, 2100);
    const go = () => dismiss();
    window.addEventListener("keydown", go);
    window.addEventListener("wheel", go, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", go);
      window.removeEventListener("wheel", go);
    };
  }, [show, dismiss]);

  return (
    <>
      {children}
      {show && pick && (
        <div
          onClick={dismiss}
          className={`os-type fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-7 bg-page px-6 transition-opacity duration-700 ${
            fading ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pick.art}
            alt=""
            aria-hidden
            className="intro-rise h-[clamp(180px,36vh,340px)] w-auto max-w-[min(90vw,620px)] rounded-[24px] object-contain"
          />
          <div className="intro-rise-late text-center">
            <h1 className="leading-none">
              <span className="sr-only">Welcome to TLE OS</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo.png" alt="" aria-hidden className="art-light mx-auto h-auto w-[clamp(180px,22vw,240px)]" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo-dark.png" alt="" aria-hidden className="art-dark mx-auto h-auto w-[clamp(180px,22vw,240px)]" />
            </h1>
            <p className="mt-3 text-[13px] text-muted">{pick.line}</p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="absolute bottom-8 right-8 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            Skip →
          </button>
        </div>
      )}
    </>
  );
}
