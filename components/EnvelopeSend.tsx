"use client";

/**
 * The terms leaving.
 *
 * A tick is the right mark for "that worked" — it is the wrong mark for "that
 * has gone to someone else". Sending terms is the one moment in the process
 * where something physically leaves the office and lands in a landlord's
 * inbox, and the confirmation should say GONE rather than DONE.
 *
 * So: the flap closes, and then the whole thing goes. Two beats, in that
 * order, because a letter that flies away with its flap still open reads as
 * a mistake.
 *
 * Drawn rather than illustrated so it takes `currentColor` and works on the
 * accent and on ink, and so there is no image to load at the exact moment
 * the screen is meant to feel instant.
 */
export default function EnvelopeSend({ size = 92 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="envelope-send relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* The speed lines are behind, and only show while it is travelling. */}
      <span className="envelope-dashes absolute inset-0">
        <svg viewBox="0 0 92 92" className="h-full w-full">
          <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.5">
            <line x1="6" y1="58" x2="26" y2="58" />
            <line x1="2" y1="68" x2="16" y2="68" />
            <line x1="14" y1="48" x2="28" y2="48" />
          </g>
        </svg>
      </span>

      <svg viewBox="0 0 92 92" className="envelope-body h-full w-full">
        {/* Body */}
        <rect
          x="14"
          y="28"
          width="64"
          height="44"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        {/* The two creases that make it read as an envelope even shut. */}
        <path
          d="M14 66 L38 50 M78 66 L54 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.65"
        />
        {/* The flap. Hinged along its top edge, so it shuts downward — the
            transform-box/origin pair is what makes an SVG child rotate about
            its own edge rather than the viewBox corner. */}
        <path
          className="envelope-flap"
          d="M14 32 L46 54 L78 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
