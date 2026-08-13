"use client";

import { HAND_WORDS, type HandWord as Word } from "@/lib/handwriting-data";

/**
 * A word, written by hand.
 *
 * The technique is the one from css-tricks, "How to get handwriting animation
 * with irregular SVG strokes": the letterforms become a clipPath, a pen path
 * runs through the middle of them in writing order, and that path is stroked
 * far wider than the letters are thick and animated with stroke-dashoffset.
 * Clipped to the letters, all you see is them filling in along the writing
 * path — irregular widths, loops and all.
 *
 * A mask wipe was the first attempt and it is NOT this: a wipe uncovers a
 * finished word left to right, and no wipe can go back on itself, lift, or
 * travel up the ascender of an l. It also clipped the swash off the W,
 * because a mask only paints inside the element's own box.
 *
 * ── Why one path per letter ─────────────────────────────────────────────────
 *
 * The hop from the end of one letter to the start of the next is still path
 * LENGTH, and stroke-dashoffset spends real time travelling it. Clipped away,
 * that showed up as the pen stalling between letters. A stroke each, with its
 * own delay and a duration set by its share of the word's ink, has no dead
 * air in it — and the pen still moves at one steady speed, because the share
 * drives the timing rather than every letter getting an equal slice.
 *
 * ── Sizing ──────────────────────────────────────────────────────────────────
 *
 * Set `size`, in any CSS length. Inline in a sentence that wants an em value
 * so the word scales with the type around it; standing alone it wants a px or
 * rem. The other dimension follows from the word's own aspect ratio, because
 * an SVG given only a height fills its container's width rather than doing
 * the sensible thing.
 */
export default function HandWord({
  word,
  written,
  color,
  /** Height of the ink box. Width follows. */
  size,
  className = "",
  ms = 2600,
  delay = 0,
  /** Nudges the baseline when it sits inline in a line of type. */
  align,
}: {
  word: keyof typeof HAND_WORDS;
  /** Flips once, when the block arrives. */
  written: boolean;
  color: string;
  size: string;
  className?: string;
  ms?: number;
  delay?: number;
  align?: string;
}) {
  const w: Word = HAND_WORDS[word];

  /* Each letter starts the instant the one before it finishes. That is what
     makes it read as one hand moving rather than four animations. */
  let elapsed = 0;
  const timed = w.strokes.map((s) => {
    const at = elapsed;
    elapsed += s.f;
    return { ...s, delay: delay + at * ms, dur: s.f * ms };
  });

  /**
   * Wider than the letters are thick, so the clip fills completely. Measured
   * on the outline: the stroke averages ~34 units across and corners need
   * more than the average, so 95 with round caps and joins — a pen has a
   * round nib.
   */
  const NIB = 95;

  /* Unique per word: two of these on one page sharing a clipPath id means the
     second one silently takes the first one's letterforms. */
  const clipId = `hand-${word}`;

  return (
    <svg
      viewBox={w.viewBox}
      className={`present-hand ${className}`}
      role="img"
      aria-label={word}
      style={{
        height: size,
        width: `calc(${size} * ${w.ratio.toFixed(4)})`,
        ...(align ? { verticalAlign: align } : null),
        // The viewBox already contains the ink; this means a rounding error
        // can never shave a swash the way the old mask did.
        overflow: "visible",
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={w.outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {timed.map((s, i) => (
          <path
            key={i}
            d={s.d}
            // pathLength normalises each stroke to 1, so the dash maths is the
            // same whatever the letter actually measures.
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={NIB}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            style={{
              strokeDashoffset: written ? 0 : 1,
              // Linear, deliberately. A hand writes at a steady speed; easing
              // each letter makes it read as a machine drawing rather than a
              // person writing.
              transition: `stroke-dashoffset ${s.dur}ms linear`,
              transitionDelay: `${s.delay}ms`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
