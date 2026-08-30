/**
 * A small T-Rex, for the screen that asks you to connect REX.
 *
 * It is a joke that takes half a second to land and then makes the step
 * memorable, which is worth more on a first morning than another icon. The
 * step it sits on is the one an agent must not skip - everything the OS knows
 * comes through REX - so anything that makes that screen stick is doing real
 * work.
 *
 * ── Drawn, not imported ───────────────────────────────────────────────────
 *
 * Inline SVG stroked in `currentColor` rather than a file in
 * /public/illustrations, for one reason: it has to be legible in both themes.
 * The `.art` class inverts and hue-rotates ink-on-transparent line art for the
 * dark room, which works for the existing set but is a filter applied to a
 * bitmap. Stroking in currentColor means this is simply the ink colour,
 * whatever the ink colour currently is, with no filter in the way.
 *
 * ── Two drafts, and why this is the one ───────────────────────────────────
 *
 * A second version exists with a proper raised skull, a heavier tail and
 * chunky hind legs - more accurately a Tyrannosaurus, and duller. James
 * picked this one on sight (30 Aug): the low head and the daft little arms
 * read as a drawing rather than a diagram, which is the entire point of
 * putting it there. Do not "fix" the anatomy.
 *
 * If James's own drawing arrives, swap the body of this component for an
 * <img> and leave the export alone - every caller takes `size` and
 * `className` and nothing else.
 */

export default function RexDino({
  size = 132,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 170"
      width={size}
      height={(size * 170) / 220}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="A small friendly Tyrannosaurus"
    >
      {/* The outline, in one stroke: snout → skull → back → tail → belly → jaw.
          One path rather than overlapping shapes, so there are no seams where
          a body meets a head - the giveaway that line art was assembled. */}
      <path
        d="M18 62
           Q22 47 46 44
           Q67 35 87 47
           Q106 39 129 48
           Q157 57 177 71
           Q195 64 211 55
           Q196 84 172 94
           Q157 103 141 117
           Q119 131 96 119
           Q71 107 51 91
           Q35 83 26 74
           Z"
      />

      {/* Bumps down the spine. Three, unevenly spaced - evenly spaced reads
          as machined, and the whole set is meant to look hand drawn. */}
      <path d="M104 43 q5 -8 11 -1" />
      <path d="M132 50 q5 -8 11 0" />
      <path d="M158 60 q5 -7 10 1" />

      {/* Eye, and a brow that does the entire job of making him friendly
          rather than hungry. */}
      <circle cx="45" cy="57" r="3.4" fill="currentColor" stroke="none" />
      <path d="M37 48 q7 -4 14 -1" />

      {/* Snout: nostril and the line of the mouth. */}
      <circle cx="24" cy="61" r="1.6" fill="currentColor" stroke="none" />
      <path d="M20 69 q16 6 33 7" />

      {/* The famous little arm. Deliberately tiny - it is the punchline. */}
      <path d="M79 97 q11 7 20 4" />
      <path d="M99 101 l5 -3 M99 101 l5 1" />

      {/* Legs. The back one is drawn behind, a touch lighter, so he stands in
          three dimensions instead of lying flat on the page. */}
      <g opacity={0.55}>
        <path d="M136 116 q10 17 4 29" />
        <path d="M127 145 q13 3 20 0" />
      </g>
      <path d="M97 120 q-2 16 -6 25" />
      <path d="M80 145 q13 4 22 0" />

      {/* Belly creases - two short arcs, the shorthand this icon set uses for
          a soft surface. */}
      <path d="M74 106 q7 6 15 8" opacity={0.45} />
      <path d="M92 116 q8 4 16 4" opacity={0.45} />
    </svg>
  );
}
