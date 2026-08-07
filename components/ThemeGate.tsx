"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTheme,
  isNight,
  readTheme,
  resolve,
  writeTheme,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * The theme layer: a one-time chooser on first visit, the paint transition
 * that plays whenever the theme changes, and the timer that keeps Automatic
 * honest as the evening arrives.
 *
 * The chooser is a split screen — light on the left, dark on the right —
 * because the fastest way to explain the choice is to show both at once.
 */

const CHOSEN_KEY = "os-theme-chosen";

/** Paint the incoming theme across the screen from wherever it was clicked. */
function usePaint() {
  const [paint, setPaint] = useState<{ colour: string; x: string; y: string } | null>(null);

  const run = useCallback((next: ThemeChoice, origin?: { x: number; y: number }) => {
    const mode = resolve(next);
    const colour = mode === "dark" ? "#1c1c1e" : "#f2f0eb";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      applyTheme(next);
      return;
    }

    const x = origin ? `${origin.x}px` : "50%";
    const y = origin ? `${origin.y}px` : "50%";
    setPaint({ colour, x, y });
    // Flip the tokens under the wash while it's mid-sweep, so the page is
    // already the new theme by the time the paint clears.
    window.setTimeout(() => applyTheme(next), 420);
    window.setTimeout(() => setPaint(null), 1100);
  }, []);

  const overlay = paint ? (
    <div
      aria-hidden
      className="paint-spread pointer-events-none fixed inset-0 z-[200]"
      style={
        {
          backgroundColor: paint.colour,
          ["--px" as string]: paint.x,
          ["--py" as string]: paint.y,
        } as React.CSSProperties
      }
    />
  ) : null;

  return { run, overlay };
}

export default function ThemeGate({ children }: { children: React.ReactNode }) {
  const [choosing, setChoosing] = useState(false);
  const [toast, setToast] = useState(false);
  const { run, overlay } = usePaint();
  const choice = useRef<ThemeChoice>("auto");

  // First paint: honour the saved choice, or open the chooser if there isn't one.
  useEffect(() => {
    const saved = readTheme();
    if (saved) {
      choice.current = saved;
      applyTheme(saved);
    }
    if (!localStorage.getItem(CHOSEN_KEY)) {
      // Preview the automatic answer behind the chooser, so the split screen
      // isn't sitting on an arbitrary theme.
      applyTheme("auto");
      setChoosing(true);
    }
  }, []);

  // Automatic has to keep watching — 19:00 arrives while the tab is open.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (choice.current !== "auto") return;
      const want = isNight() ? "dark" : "light";
      const have = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      if (want !== have) run("auto");
    }, 60_000);
    return () => window.clearInterval(id);
  }, [run]);

  // The settings panel changes the theme through a window event, so Shell
  // doesn't need this component's internals to trigger the paint.
  useEffect(() => {
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        choice: ThemeChoice;
        origin?: { x: number; y: number };
      };
      choice.current = detail.choice;
      writeTheme(detail.choice);
      run(detail.choice, detail.origin);
    };
    window.addEventListener("os-set-theme", onSet);
    return () => window.removeEventListener("os-set-theme", onSet);
  }, [run]);

  function pick(next: ThemeChoice, e: React.MouseEvent) {
    choice.current = next;
    writeTheme(next);
    localStorage.setItem(CHOSEN_KEY, "1");
    run(next, { x: e.clientX, y: e.clientY });
    // Let the paint sweep before the chooser goes, or it vanishes mid-stroke.
    window.setTimeout(() => {
      setChoosing(false);
      setToast(true);
    }, 700);
    window.setTimeout(() => setToast(false), 6200);
  }

  return (
    <>
      {children}

      {choosing && (
        <div className="fixed inset-0 z-[150] flex">
          {/* ── Light half ── */}
          <button
            type="button"
            onClick={(e) => pick("light", e)}
            className="group relative flex flex-1 flex-col items-center justify-center gap-4 bg-[#f2f0eb] text-[#101014] transition-[flex] duration-500 hover:flex-[1.15]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-[2.5px] border-[#101014]">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </svg>
            </span>
            <span className="hand text-[28px]">Light</span>
            <span className="max-w-[16rem] px-6 text-center text-[12.5px] opacity-60">
              Ink on paper, the way the illustrations were drawn.
            </span>
          </button>

          {/* ── Dark half ── */}
          <button
            type="button"
            onClick={(e) => pick("dark", e)}
            className="group relative flex flex-1 flex-col items-center justify-center gap-4 bg-[#1c1c1e] text-[#ecebe8] transition-[flex] duration-500 hover:flex-[1.15]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-[2.5px] border-[#ecebe8]">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z" />
              </svg>
            </span>
            <span className="hand text-[28px]">Dark</span>
            <span className="max-w-[16rem] px-6 text-center text-[12.5px] opacity-60">
              Warm charcoal, with the linework turned to chalk.
            </span>
          </button>

          {/* ── The title and the automatic option, straddling the seam ── */}
          <div className="pointer-events-none absolute inset-x-0 top-[14%] flex flex-col items-center gap-2">
            <p className="hand text-[13px] uppercase tracking-[0.2em] text-[#8a8a8a]">
              TLE OS
            </p>
            <p className="hand text-[26px] text-[#8a8a8a]">How do you like it?</p>
          </div>

          <div className="absolute inset-x-0 bottom-[12%] flex justify-center">
            <button
              type="button"
              onClick={(e) => pick("auto", e)}
              className="hand rounded-full border-[1.5px] border-[#8a8a8a] bg-[#8a8a8a]/10 px-6 py-3 text-[13.5px] text-[#8a8a8a] backdrop-blur-sm transition-colors hover:border-[#b5b5b5] hover:text-[#d8d8d8]"
            >
              Automatic — light by day, dark after 7pm
            </button>
          </div>
        </div>
      )}

      {overlay}

      {toast && (
        <div className="toast-in fixed bottom-8 left-1/2 z-[160] -translate-x-1/2 rounded-full border border-line/80 bg-card px-5 py-3 text-[12.5px] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]">
          Changed your mind? It&apos;s in your profile, bottom left.
        </div>
      )}
    </>
  );
}
