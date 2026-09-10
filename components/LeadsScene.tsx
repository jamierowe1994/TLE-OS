/**
 * The Leads header, in three layers instead of one picture.
 *
 * ── Why it is not one file ───────────────────────────────────────────────
 *
 * Flattened, the whole artwork sat in front of the rule: the pink wash hid
 * the line behind her, and the plant pot hung in mid air 11% of the artwork's
 * height below it, because the pot's base and her seat are at different
 * heights in the drawing. James wanted what the drawing actually implies -
 * the scribble BEHIND the line, the pot standing ON it, her sitting on it.
 *
 * So the file was cut into three by colour and connected region (the wash is
 * (252,220,213), her skin is (252,202,172), the pot is (246,238,232) - the
 * gaps between those are what separate a brush stroke from a hand and from a
 * pot). All three keep the SAME canvas, so stacking them at the same size
 * rebuilds the original exactly; only the offsets differ.
 *
 * ── The offsets ──────────────────────────────────────────────────────────
 *
 * This box's BOTTOM EDGE is the rule - that is how PageHeader positions a
 * figure. A layer is therefore pushed down by however much of it should sit
 * above the line, measured off the artwork rather than guessed:
 *
 *   her seat  0.670  the underside of her thigh, where her legs break away
 *   pot base  0.783  the bottom of the pot
 *
 * The wash travels with her, so it keeps its place behind her shoulder.
 */

/** Measured off the artwork. See the note above. */
const SEAT = 0.67;
const POT_BASE = 0.783;
/** How far the wash reaches across the canvas, so the rule can be redrawn
 *  over exactly that span and no further. */
const WASH = { from: 0.245, to: 0.898 };

const layer = "art art-figure absolute left-0 block w-full";

export default function LeadsScene() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 block">
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/illustrations/leads/blush.png" alt="" className={layer} style={{ top: `${(1 - SEAT) * 100}%` }} />

      {/* The rule, put back across the wash.
          The wash is painted over the header's own border, and a border
          cannot be drawn on top of a positioned child - so the line is
          redrawn here, between the wash and the figures. It spans the wash
          and stops: either side of that the header's real border is still
          showing and a second line would double it. */}
      <span
        className="absolute border-t border-line/80"
        style={{ top: "100%", left: `${WASH.from * 100}%`, right: `${(1 - WASH.to) * 100}%` }}
      />

      <img src="/illustrations/leads/lady.png" alt="" className={layer} style={{ top: `${(1 - SEAT) * 100}%` }} />
      <img src="/illustrations/leads/plant.png" alt="" className={layer} style={{ top: `${(1 - POT_BASE) * 100}%` }} />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
