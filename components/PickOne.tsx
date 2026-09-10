"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * A dropdown that belongs to this OS.
 *
 * ── Why not a <select> ────────────────────────────────────────────────────
 *
 * Market Appraisals had one, and it looked exactly like what it was: a native
 * control sitting next to hand-drawn pills, a different height, a different
 * font, and a menu drawn by the operating system (James, 10 Sep 2026 - "it
 * looks completely unstyled compared to the rest of it"). A select cannot be
 * styled open, so the only way to have it match is not to use one.
 *
 * ── Why the menu is portalled ─────────────────────────────────────────────
 *
 * Same reason as the Listings filter: these controls sit inside the masthead,
 * which animates and carries a clip-path, and a menu positioned inside that
 * is at the mercy of its ancestors. Out at <body> there is nothing above it
 * to be trapped by, and it is placed from the button's measured position.
 */
export default function PickOne<T extends string>({
  label,
  options,
  value,
  onChange,
  icon,
}: {
  /** Shown when nothing is chosen, and as the menu's heading. */
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const current = options.find((o) => o.id === value);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 8, left: r.left, width: r.width });
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

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[12.5px] transition-colors ${
          open
            ? "border-ink bg-panel text-ink"
            : "border-line/80 bg-panel text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        {icon && <DoodleIcon name={icon} size={13} />}
        {current?.label ?? label}
        <span className={`text-[9px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && at && createPortal(
        <>
          <button
            type="button"
            aria-label={`Close ${label}`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200] cursor-default"
          />
          <div
            data-pick-one
            className="fade-up fixed z-[201] max-h-[60vh] overflow-auto rounded-2xl border border-line/80 bg-card p-1.5 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.34)]"
            style={{ top: at.top, left: at.left, minWidth: Math.max(at.width, 168) }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-accent-soft/40 ${
                  o.id === value ? "font-semibold text-accent-dark" : ""
                }`}
              >
                {o.label}
                {o.id === value && <span aria-hidden className="text-[11px]">✓</span>}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
