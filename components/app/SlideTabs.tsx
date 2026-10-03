"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { calm } from "@/components/app/motion";

/**
 * THE SWITCH THAT BOBBLES (James, 3 Oct 2026): "they shouldn't just jump. It
 * should bobble over to the next side, so I feel like it's getting stretched
 * and then pings over to the other side."
 *
 * One pink pill sits under the chosen option. On a change it first stretches
 * to cover both (squashing a little, like something pulled), then snaps to
 * the new one, overshooting its far edge before it settles. Used for Work and
 * Play, Tenants and Landlords, and every row of tabs in the app.
 */

export interface SlideOption<T extends string> {
  id: T;
  label: React.ReactNode;
}

export default function SlideTabs<T extends string>({
  options,
  value,
  onChange,
  className = "",
  height = 40,
  track = "var(--m-card)",
  pill = "var(--m-pink-wash)",
  ink = "var(--m-coral)",
  textClass = "text-[14px]",
  shadow = false,
}: {
  options: Array<SlideOption<T>>;
  value: T | string;
  onChange: (id: T) => void;
  className?: string;
  height?: number;
  track?: string;
  pill?: string;
  ink?: string;
  textClass?: string;
  shadow?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const bar = useRef<HTMLSpanElement | null>(null);
  const was = useRef<{ l: number; w: number } | null>(null);

  const rectOf = (id: string) => {
    const b = box.current?.querySelector<HTMLElement>(`[data-slide="${CSS.escape(id)}"]`);
    return b ? { l: b.offsetLeft, w: b.offsetWidth } : null;
  };

  const place = (r: { l: number; w: number } | null) => {
    const el = bar.current;
    if (!el) return;
    el.style.opacity = r ? "1" : "0";
    if (r) {
      el.style.left = `${r.l}px`;
      el.style.width = `${r.w}px`;
    }
  };

  useLayoutEffect(() => {
    const next = rectOf(String(value));
    const prev = was.current;
    was.current = next;
    const el = bar.current;
    if (!el) return;
    if (!prev || !next || prev.l === next.l || calm() || typeof el.animate !== "function") return place(next);
    const dir = next.l > prev.l ? 1 : -1;
    const from = Math.min(prev.l, next.l);
    const span = Math.max(prev.l + prev.w, next.l + next.w) - from;
    el.getAnimations().forEach((a) => a.cancel());
    const anim = el.animate(
      [
        { left: `${prev.l}px`, width: `${prev.w}px`, transform: "scaleY(1)" },
        { left: `${from}px`, width: `${span}px`, transform: "scaleY(0.8)", offset: 0.36 },
        /* The ping: pushed into the far side and squeezed, never past the track. */
        { left: `${dir > 0 ? next.l + 10 : next.l}px`, width: `${next.w - 10}px`, transform: "scaleY(1.08)", offset: 0.7 },
        { left: `${dir > 0 ? next.l : next.l + 3}px`, width: `${next.w - 3}px`, transform: "scaleY(0.98)", offset: 0.86 },
        { left: `${next.l}px`, width: `${next.w}px`, transform: "scaleY(1)" },
      ],
      { duration: 620, easing: "cubic-bezier(0.3, 0.8, 0.3, 1)" }
    );
    place(next);
    el.style.opacity = "1";
    void anim;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length]);

  /* Keep it under its option if the row changes size (a rotate, a font). */
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = rectOf(String(value));
      was.current = r;
      place(r);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      ref={box}
      className={`relative grid gap-1 rounded-full p-1 ${shadow ? "shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]" : ""} ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, background: track }}
    >
      <span ref={bar} aria-hidden className="pointer-events-none absolute rounded-full" style={{ top: 4, bottom: 4, background: pill, opacity: 0, transformOrigin: "center" }} />
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            data-slide={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            className={`relative z-[1] flex items-center justify-center gap-1.5 rounded-full px-1 font-medium transition-colors duration-300 ${textClass}`}
            style={{ height, color: on ? ink : undefined }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
