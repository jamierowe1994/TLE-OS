"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyDarkPalette,
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

const Sun = (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </svg>
);

const Moon = (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z" />
  </svg>
);

/** Half sun, half moon — automatic, in one mark. */
const Both = (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6z" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="8.8" />
  </svg>
);

const THEMES: {
  id: ThemeChoice;
  label: string;
  blurb: string;
  swatchBg: string;
  swatchLine: string;
  swatchInk: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "light",
    label: "Light",
    blurb: "Ink on paper, the way the illustrations were drawn.",
    swatchBg: "#f2f0eb",
    swatchLine: "#d9d5ca",
    swatchInk: "#101014",
    icon: Sun,
  },
  {
    id: "dark",
    label: "Dark",
    blurb: "Warm charcoal, with the linework turned to chalk.",
    swatchBg: "#363432",
    swatchLine: "#524e49",
    swatchInk: "#ecebe8",
    icon: Moon,
  },
  {
    id: "auto",
    label: "Auto",
    blurb: "Light through the day, dark after 7pm.",
    swatchBg: "#f2f0eb",
    swatchLine: "#3a3a3d",
    swatchInk: "#101014",
    icon: Both,
  },
];

/** Paint the incoming theme across the screen from wherever it was clicked. */
function usePaint() {
  const [paint, setPaint] = useState<{ colour: string; x: string; y: string } | null>(null);

  const run = useCallback((next: ThemeChoice, origin?: { x: number; y: number }) => {
    const mode = resolve(next);
    const colour = mode === "dark" ? "#363432" : "#f2f0eb";
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
    applyDarkPalette();
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
        // One calm beige screen. The split-screen version made the page itself
        // the sample, which meant the choice arrived before the greeting — too
        // loud for a first impression. Here the eggshell stays, and the two
        // themes are shown as swatches you pick from.
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-10 bg-[#f2f0eb] px-6 text-[#101014]">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="hand text-[12px] uppercase tracking-[0.22em] text-[#101014]/40">
              TLE OS
            </p>
            <h2 className="hand text-[30px]">How do you like it?</h2>
          </div>

          <div className="flex flex-wrap items-stretch justify-center gap-5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={(e) => pick(t.id, e)}
                className="group flex w-52 flex-col items-center gap-3 rounded-3xl border-[1.5px] border-[#101014]/15 px-6 py-7 transition-all hover:-translate-y-1 hover:border-[#101014]/50"
              >
                {/* The swatch IS the preview — page colour behind, card and
                    linework in front, so you can see the theme not just name it. */}
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border-[1.5px]"
                  style={{
                    backgroundColor: t.swatchBg,
                    borderColor: t.swatchLine,
                    color: t.swatchInk,
                  }}
                >
                  {t.icon}
                </span>
                <span className="hand text-[19px]">{t.label}</span>
                <span className="text-[11.5px] leading-snug text-[#101014]/50">
                  {t.blurb}
                </span>
              </button>
            ))}
          </div>

          <p className="text-[11.5px] text-[#101014]/40">
            You can change this any time from your profile, bottom left.
          </p>
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
