"use client";

import { useEffect, useRef } from "react";

/**
 * A ring, two thin lines and a couple of hand-drawn squiggles behind a
 * washed panel, each on a slow ease-in-out drift - and each easing AWAY
 * from the mouse as it moves over the panel, by a different amount, so
 * the layer has a little depth without ever being busy (James, 11 Sep
 * 2026). Used by the listing record's hero and tab headers, and behind
 * the listings board.
 *
 * The repel is written straight onto the wrapper's transform, outside
 * React; the drift is a CSS animation on the inner element, so the two
 * never fight. Nothing moves for anyone who has asked for less motion.
 * The host is the parent element, which must be `relative` and clip.
 */
export default function Doodles({ tone = "sage" }: { tone?: "sage" | "blush" }) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
    const move = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      for (const it of items) {
        const d = Number(it.dataset.depth ?? "0");
        it.style.transform = `translate(${(-dx * d).toFixed(1)}px, ${(-dy * d).toFixed(1)}px)`;
      }
    };
    const leave = () => items.forEach((it) => (it.style.transform = "translate(0px, 0px)"));
    host.addEventListener("mousemove", move);
    host.addEventListener("mouseleave", leave);
    return () => {
      host.removeEventListener("mousemove", move);
      host.removeEventListener("mouseleave", leave);
    };
  }, []);
  const ink = tone === "sage" ? "#56634a" : "var(--accent-dark)";
  const soft = tone === "sage" ? "#b3bea5" : "var(--accent)";
  const wrap = "pointer-events-none absolute transition-transform duration-700 ease-out will-change-transform";
  return (
    <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes tle-drift-a { 0%,100% { transform: translate(0,0) } 50% { transform: translate(14px,-10px) } }
        @keyframes tle-drift-b { 0%,100% { transform: translate(0,0) rotate(0deg) } 50% { transform: translate(-16px,8px) rotate(4deg) } }
        @keyframes tle-drift-d { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-24px) } }
        .tle-drift-a { animation: tle-drift-a 12s ease-in-out infinite }
        .tle-drift-b { animation: tle-drift-b 15s ease-in-out infinite }
        .tle-drift-d { animation: tle-drift-d 18s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .tle-drift-a, .tle-drift-b, .tle-drift-d { animation: none } }
      `}</style>
      {/* the ring */}
      <span data-depth="26" className={`${wrap} -right-8 top-4`}>
        <span className="tle-drift-b block h-36 w-36 rounded-full border-[12px]" style={{ borderColor: `color-mix(in srgb, ${soft} 40%, transparent)` }} />
      </span>
      {/* a squiggle, low in the middle - kept below the address line, which
          can run long (James, 11 Sep) */}
      <span data-depth="14" className={`${wrap} bottom-[72px] left-[40%]`}>
        <svg className="tle-drift-a block" width="170" height="34" viewBox="0 0 170 34" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" opacity="0.45">
          <path d="M3 20 C 20 -6, 38 46, 56 20 S 92 -6, 110 20 S 146 46, 167 14" />
        </svg>
      </span>
      {/* a looping doodle, low right */}
      <span data-depth="20" className={`${wrap} bottom-3 right-[28%]`}>
        <svg className="tle-drift-b block" width="150" height="46" viewBox="0 0 150 46" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" opacity="0.38">
          <path d="M4 28 C 24 -4, 44 -4, 58 22 C 70 44, 44 50, 46 30 C 48 8, 80 6, 96 20 C 112 34, 128 34, 146 12" />
        </svg>
      </span>
      {/* two thin lines across the foot */}
      <span data-depth="8" className={`${wrap} bottom-9 left-[36%]`}>
        <span className="tle-drift-d block h-px w-[260px] rotate-[-10deg]" style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${ink} 45%, transparent), transparent)` }} />
      </span>
      <span data-depth="10" className={`${wrap} bottom-5 left-[42%]`}>
        <span className="tle-drift-d block h-px w-[200px] rotate-[-10deg]" style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${ink} 30%, transparent), transparent)`, animationDelay: "-8s" }} />
      </span>
      {/* three short marks, the drawings' own sparkle */}
      <span data-depth="32" className={`${wrap} bottom-[112px] right-[30%]`}>
        <svg className="tle-drift-a block" width="34" height="30" viewBox="0 0 34 30" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" opacity="0.5" style={{ animationDelay: "-5s" }}>
          <path d="M4 26 L 11 15" /><path d="M14 22 L 17 6" /><path d="M24 24 L 31 17" />
        </svg>
      </span>
    </div>
  );
}

