"use client";

/**
 * "Swipe to read on", drawn rather than filmed.
 *
 * James, 15 Sep 2026, wanted an illustration-style swipe animation across the
 * foot of the deck on a phone, and wondered about an animated GIF. This is the
 * same idea in SVG and CSS, which is better here for four reasons a GIF cannot
 * match: it takes the deck's own accent colour instead of being baked in one
 * palette, it stays sharp at any pixel density, it costs no download, and it
 * can stop itself for somebody who has asked their phone for less motion.
 *
 * The drawing is the deck's own line-art language - the same weight and round
 * caps as the icons in `Line` - so it reads as part of the presentation rather
 * than a widget dropped on top of it.
 *
 * ── Where it appears ───────────────────────────────────────────────────────
 *
 * On the FIRST slide only, in the same slot the action button uses, so the
 * foot never changes height as they move. Slide one is the only place a
 * landlord does not yet know the deck swipes; by slide two they have either
 * worked it out or used the arrows, and a hint that keeps insisting is a
 * hint that has become decoration.
 */

export default function SwipeHint({ label = "Swipe to read on" }: { label?: string }) {
  return (
    <div
      className="mb-3 flex h-[50px] w-full items-center justify-center gap-3 text-[13.5px] font-semibold"
      style={{ color: "var(--p-accent, #56423e)" }}
    >
      <style>{`
        @keyframes tle-swipe {
          0%        { transform: translateX(-9px); opacity: 0 }
          18%       { opacity: 1 }
          62%       { transform: translateX(16px); opacity: 1 }
          84%, 100% { transform: translateX(22px); opacity: 0 }
        }
        /* The trail is drawn on, then wiped, a beat behind the hand. */
        @keyframes tle-swipe-trail {
          0%        { stroke-dashoffset: 30; opacity: 0 }
          20%       { opacity: 0.55 }
          62%       { stroke-dashoffset: 0; opacity: 0.55 }
          88%, 100% { stroke-dashoffset: 0; opacity: 0 }
        }
        .tle-swipe-hand  { animation: tle-swipe 2100ms cubic-bezier(0.4, 0, 0.2, 1) infinite }
        .tle-swipe-trail { animation: tle-swipe-trail 2100ms cubic-bezier(0.4, 0, 0.2, 1) infinite }
        /* Asked for less motion: the hand simply sits where it points. */
        @media (prefers-reduced-motion: reduce) {
          .tle-swipe-hand, .tle-swipe-trail { animation: none }
          .tle-swipe-hand { transform: translateX(6px) }
          .tle-swipe-trail { stroke-dashoffset: 0; opacity: 0.55 }
        }
      `}</style>

      {/* The viewBox is cropped to the drawing so the hand is not a small
          thing floating in a large empty box. */}
      <svg viewBox="8 2 40 40" aria-hidden className="h-[32px] w-[32px] overflow-visible">
        {/* The trail the finger leaves, swept out ahead of it. */}
        <path
          className="tle-swipe-trail"
          d="M14 11C22 6 32 6 41 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="30"
        />
        {/* The hand: one finger out, the rest closed - line art, no fill, the
            same round caps and 2px weight as the deck's own icons. */}
        <g className="tle-swipe-hand" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 30V19a3 3 0 0 1 6 0v8" />
          <path d="M28 24a2.6 2.6 0 0 1 5 0v3" />
          <path d="M33 26a2.6 2.6 0 0 1 5 0v2" />
          <path d="M38 27a2.6 2.6 0 0 1 5 0v4c0 4.5-3 7-7.5 7h-5c-2 0-3-.8-4.2-2.2L22 31" />
        </g>
      </svg>

      <span>{label}</span>
    </div>
  );
}
