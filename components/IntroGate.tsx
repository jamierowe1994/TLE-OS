"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The load-in moment: the "Coming to a PC Near You" cut plays once, centred
 * on the eggshell with its corners blended away, and the OS fades in as it
 * ends. Once per browser session — a greeting, not a toll gate.
 *
 * Anything that can't or shouldn't play (reduced motion, a video error, an
 * impatient click on Skip) drops straight through to the app.
 */
export default function IntroGate({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (
      !sessionStorage.getItem("os-intro-seen") &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShow(true);
    }
  }, []);

  function dismiss() {
    if (done.current) return;
    done.current = true;
    sessionStorage.setItem("os-intro-seen", "1");
    setFading(true);
    window.setTimeout(() => setShow(false), 750);
  }

  return (
    <>
      {children}
      {show && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center bg-page transition-opacity duration-700 ${
            fading ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <div className="relative w-full max-w-3xl px-6">
            <video
              src="/illustrations/hero-intro.mp4"
              autoPlay
              muted
              playsInline
              onEnded={dismiss}
              onError={dismiss}
              className="art block w-full"
            />
            {/* The blend: the video's near-white plate melts into the eggshell
                so it reads as drawn on the page, not embedded in it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 62% 58% at 50% 50%, transparent 52%, var(--page) 82%)",
              }}
            />
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
