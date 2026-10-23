"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Rent between two figures (James, 23 Oct 2026): "two toggles ... higher or
 * lower, and then everything in between". A pill like PickOne that opens a
 * two-handled slider running from £0 to the top rent in the book on show.
 *
 * Null is "not filtering". Dragging both handles back to the ends hands null
 * back, so the pill never lights up while it is showing every rent.
 *
 * Two native range inputs laid over one track: the track takes no clicks and
 * only the thumbs do, so each handle drags on its own and keyboards work.
 */

const STEP = 25;
const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

export default function RentRange({
  max,
  value,
  onChange,
}: {
  /** The top of the slider: the highest rent in the book, rounded up. */
  max: number;
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const top = Math.max(STEP, Math.ceil(max / STEP) * STEP);
  const [lo, hi] = value ?? [0, top];
  const on = value !== null;

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    /* Kept on screen at phone width: the panel is 300 wide. */
    setAt({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - 316)) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const set = (a: number, b: number) => onChange(a <= 0 && b >= top ? null : [a, b]);
  const pct = (n: number) => `${(n / top) * 100}%`;

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={max <= 0}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[12.5px] transition-colors disabled:opacity-40 ${
          open
            ? "border-ink bg-panel text-ink"
            : on
              ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
              : "border-line/80 bg-panel text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        {on ? `Rent ${money(lo)} - ${money(hi)}` : "Rent"}
        <span className={`text-[9px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && at && createPortal(
        <>
          <button
            type="button"
            aria-label="Close rent"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200] cursor-default"
          />
          <div
            className="fade-up fixed z-[201] w-[300px] rounded-2xl border border-line/80 bg-card p-4 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.34)]"
            style={{ top: at.top, left: at.left }}
          >
            <div className="flex items-baseline justify-between text-[12.5px]">
              <span className="text-muted">Rent pcm</span>
              <span className="font-semibold text-ink">{money(lo)} - {money(hi)}</span>
            </div>

            <div className="rent-range relative mt-4 h-6">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line/70" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-dark"
                style={{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }}
              />
              <input
                type="range"
                aria-label="Lowest rent"
                min={0}
                max={top}
                step={STEP}
                value={lo}
                onChange={(e) => set(Math.min(Number(e.target.value), hi), hi)}
                /* The low handle sits above once both reach the top, or it could never be pulled back. */
                className={`absolute inset-0 w-full ${lo >= top - STEP ? "z-[2]" : "z-[1]"}`}
              />
              <input
                type="range"
                aria-label="Highest rent"
                min={0}
                max={top}
                step={STEP}
                value={hi}
                onChange={(e) => set(lo, Math.max(Number(e.target.value), lo))}
                className="absolute inset-0 z-[1] w-full"
              />
            </div>

            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>£0</span>
              <span>{money(top)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button type="button" disabled={!on} onClick={() => onChange(null)} className="text-[12px] text-muted underline hover:text-ink disabled:no-underline disabled:opacity-40">
                Any rent
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-ink/80 px-4 py-1.5 text-[12px] font-semibold transition-colors hover:bg-ink hover:text-page">
                Done
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
