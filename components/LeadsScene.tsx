/**
 * The Leads header, in James's three layers.
 *
 * ── What each one does ───────────────────────────────────────────────────
 *
 *   wash    the watercolour, BEHIND the rule - the line runs across it
 *   lady    sits on the rule, legs hanging below into the search row
 *   plant   off to her right, its pot standing on the rule
 *
 * ── Why they share one canvas ────────────────────────────────────────────
 *
 * They arrived as three separate exports on three different canvases, so
 * they were composed onto ONE before shipping: her seat and the pot's base
 * both placed on the same y, the watercolour set behind her at the offset
 * taken from James's own flattened composite. Everything therefore stacks at
 * a single offset here rather than three, and the arithmetic that could drift
 * lives in the build rather than in the render.
 *
 * ── The one measured number ──────────────────────────────────────────────
 *
 * RULE is where the line crosses the shared canvas. It is her seat: the
 * sharpest sustained narrowing in her silhouette, where the seated mass gives
 * way to her legs, measured at 0.668 of her height.
 */

/** Where the rule crosses the canvas. */
const RULE = 1;
/** How far the watercolour reaches across it, so the line is put back over
 *  exactly that span and no further. */
const WASH = { from: 0, to: 1 };

/* This box's bottom edge IS the rule, so everything is pushed down by
   whatever sits above the line. One offset, because one canvas. */
const DROP = `${(1 - RULE) * 100}%`;
const layer = "art art-figure absolute left-0 block w-full";

export default function LeadsScene() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 block">
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/illustrations/leads/wash.webp" alt="" className={layer} style={{ top: DROP }} />

      {/* The rule, put back across the watercolour.
          The wash paints over the header's own border, and a border cannot be
          drawn on top of a positioned child - so the line is redrawn here,
          between the wash and the figures. It stops where the wash stops:
          beyond that the header's real border is still showing, and a second
          line would double it. */}
      <span
        className="absolute border-t border-line/80"
        style={{ top: "100%", left: `${WASH.from * 100}%`, right: `${(1 - WASH.to) * 100}%` }}
      />

      <img src="/illustrations/leads/lady.webp" alt="" className={layer} style={{ top: DROP }} />
      <img src="/illustrations/leads/plant.webp" alt="" className={layer} style={{ top: DROP }} />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
