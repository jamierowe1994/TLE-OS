"use client";

import { useEffect, useState } from "react";

/**
 * What the pre-tenancy board shows while it is fetching.
 *
 * James, 29 Aug: "the screen was loading in, but it was taking ages... can we
 * add a loading screen in there? I think actually an illustration would be
 * better."
 *
 * ── There WAS a skeleton, and it was invisible ────────────────────────────
 *
 * Ten pulsing cards at `bg-white/70` on an eggshell page — white at 70% over a
 * warm off-white is very nearly the page itself. So the board looked blank for
 * the whole load, which is worse than slow: slow with something moving is
 * waiting, and slow with nothing moving is broken. He screenshotted an empty
 * white screen and reasonably asked what was wrong.
 *
 * ── Why one illustration rather than a card grid ──────────────────────────
 *
 * A skeleton is a promise about shape: it says "cards are coming, roughly
 * here". That promise is worth making when the wait is a few hundred
 * milliseconds. This wait is several seconds and sometimes much more, because
 * the board asks Propoly, REX and PayProp at once and the slowest decides — and
 * across that long a wait a grid of grey rectangles reads as a page that has
 * failed to fill in. Something drawn, and moving, reads as work happening.
 *
 * ── The line underneath is true ───────────────────────────────────────────
 *
 * Not "Loading…", which tells nobody anything. It names the three systems being
 * waited on, because they genuinely are all fired in parallel (see
 * /api/pretenancy/deals). And after eight seconds it says REX is usually the
 * slow one, which is also true — REX commonly takes ~15s for a single call, and
 * a wait you understand is a wait you tolerate.
 *
 * Nothing here is a progress bar. There is no progress to report: the route
 * resolves when it resolves, and a bar that advances on a timer is a lie drawn
 * smoothly.
 */

/** When the wait stops being ordinary and deserves an explanation. */
const SLOW_AFTER_MS = 8_000;

export default function BoardLoading() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      {/* The waiting screen actually animates now, rather than being a still
          drawing rocked by a keyframe. `board-loading-art` is deliberately NOT
          on the GIF: the class exists to put motion on something that has
          none, and running it over a moving image is two animations fighting.

          `.art` on both, which neither had: this board lives inside the OS,
          so it has a dark room, and black line art on warm charcoal is very
          nearly invisible. That was already true of the still - the GIF would
          just have inherited it.

          The still is kept for prefers-reduced-motion, where it keeps its CSS
          nudge (which globals.css already switches off for that preference).
          A GIF ignores the setting entirely, so without this the one screen
          somebody stares at while waiting would be the one that would not sit
          still for them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/loading.gif"
        alt=""
        className="art h-auto w-[min(260px,60vw)] select-none motion-reduce:hidden"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/notioly/looking-for-something.svg"
        alt=""
        className="art board-loading-art hidden h-auto w-[min(260px,60vw)] select-none motion-reduce:block"
        draggable={false}
      />
      <p className="hand mt-6 text-[17px] text-ink">Fetching the pipeline</p>
      <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-muted">
        Propoly, REX and PayProp are all being asked at once - the slowest one decides.
      </p>
      {/* Appears rather than replaces: the first line stays true, this adds to
          it. Swapping the text would read as the load having changed state when
          nothing has happened except time passing. */}
      <p
        className={`mt-2 max-w-[380px] text-[12px] leading-relaxed text-muted transition-opacity duration-500 ${
          slow ? "opacity-100" : "opacity-0"
        }`}
      >
        REX is usually the slow one. It is still going.
      </p>
    </div>
  );
}
