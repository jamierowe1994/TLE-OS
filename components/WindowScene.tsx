"use client";

import { useEffect, useState } from "react";
import { skyState, type SkyState } from "@/lib/sun";

/**
 * The dashboard illustration, with a sky that tells the truth.
 *
 * The Notioly drawing had a tree, a squiggle and a scatter of stars painted
 * permanently into the panes. Those are stripped out (window-frame.svg), and a
 * live sky is drawn BEHIND the frame instead — so the sun and moon pass behind
 * the mullions exactly as they would through a real window.
 *
 * Position comes from real sunrise/sunset for Manchester on today's date, so
 * in December the sun is up for eight hours and in June for seventeen, without
 * anybody hardcoding a schedule.
 */

/* Geometry measured off the artwork's own paths (getBBox on the 520 viewBox):
   inner glazing starts at x=67 below the head rail at y=91; mullions cross at
   x=177/296 and y=208/331; the seated figure's hair begins at x=364. So the
   sky gets the clear glass to her left, and the arc stops short of her. */
const SKY = { x: 67, y: 88, w: 293, h: 258 };
const ARC = { x0: 88, x1: 330, yHorizon: 305, yPeak: 112 };

/** Where the body sits along its arc: across in a line, up in a curve. */
function position(progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  return {
    cx: ARC.x0 + (ARC.x1 - ARC.x0) * p,
    cy: ARC.yHorizon - (ARC.yHorizon - ARC.yPeak) * Math.sin(p * Math.PI),
  };
}

/* The original artwork's own stars, lifted out of the SVG so they can be shown
   only when it's actually dark. Same coordinates, so they land where drawn. */
const STARS = [
  [280.15, 195.66, 1.82], [271.74, 147.45, 1.71], [226.72, 137.35, 2.73],
  [205.61, 159.89, 2.07], [153.56, 143.36, 1.44], [109.72, 134.56, 2.69],
  [116.51, 161.05, 1.44], [91.51, 176.61, 1.14], [107.4, 195.66, 2.4],
  [243.16, 189.26, 1.14], [249.82, 241.88, 2.01], [218.22, 219.33, 1.14],
  [84.68, 116.05, 1.44],
] as const;

function Sun({ cx, cy, rays }: { cx: number; cy: number; rays: number }) {
  return (
    <g stroke="#231f20" strokeWidth={4.5} strokeLinecap="round" fill="none">
      <circle cx={cx} cy={cy} r={17} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
        const from = 25;
        const to = from + 11 * rays;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * from}
            y1={cy + Math.sin(a) * from}
            x2={cx + Math.cos(a) * to}
            y2={cy + Math.sin(a) * to}
            opacity={rays}
          />
        );
      })}
    </g>
  );
}

function Moon({ cx, cy }: { cx: number; cy: number }) {
  // A crescent drawn as one closed path — two arcs, the way you'd draw it.
  const r = 17;
  return (
    <path
      d={`M ${cx + r * 0.35} ${cy - r * 0.94}
          A ${r} ${r} 0 1 0 ${cx + r * 0.35} ${cy + r * 0.94}
          A ${r * 0.78} ${r * 0.78} 0 1 1 ${cx + r * 0.35} ${cy - r * 0.94} Z`}
      fill="#231f20"
      stroke="#231f20"
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

export default function WindowScene({
  className = "",
  at,
}: {
  className?: string;
  /** Render the sky at a given instant instead of now — for design review. */
  at?: Date;
}) {
  // Rendered on the client only: the server has no idea what time it is where
  // the reader is, and a mismatched sun would hydrate-error.
  const [sky, setSky] = useState<SkyState | null>(null);

  useEffect(() => {
    if (at) {
      setSky(skyState(at));
      return;
    }
    setSky(skyState());
    // Every five minutes the sun has moved about a degree — plenty often
    // enough for a drawing, and it means a dashboard left open all afternoon
    // watches the sun go down.
    const id = window.setInterval(() => setSky(skyState()), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [at]);

  const { cx, cy } = position(sky?.progress ?? 0.5);
  // Rays shorten as the sun nears the horizon — but never below 0.45, or a low
  // sun renders as a bare circle and reads as the moon.
  const rays = sky
    ? Math.min(1, Math.max(0.45, Math.sin(Math.min(1, Math.max(0, sky.progress)) * Math.PI) * 1.6))
    : 1;
  const deepNight = sky?.phase === "night";

  return (
    <div className={`relative ${className}`} title={sky ? `${sky.label} · Manchester` : undefined}>
      {/*
        Registered against the other page illustrations.

        Every Notioly drawing is on a 520×520 canvas, but the ink inside sits
        differently in each one. Measured: this frame's ink is 395 tall ending
        at y458, where the leads inbox is 404 ending at y462. Rendered into the
        same 190px box that left the window floating ~23px clear of the rule
        and reading a size smaller than every other page — the container was
        identical all along, the artwork just doesn't fill it the same way.

        So: scale 404/395 and drop it so the ink bottom lands on 462, matching
        leads exactly. Applied to the WRAPPER rather than to the frame, because
        the sky is a separate SVG underneath and the two must move as one or
        the sun leaves the window.
      */}
      <div
        className="relative h-full w-full"
        style={{ transformOrigin: "0 0", transform: "translate(-1.04%, -1.23%) scale(1.0228)" }}
      >
      {/* The sky, behind the glass. */}
      <svg
        viewBox="0 0 520 520"
        aria-hidden
        className="art absolute inset-0 h-full w-full"
      >
        <defs>
          <clipPath id="window-glass">
            <rect x={SKY.x} y={SKY.y} width={SKY.w} height={SKY.h} />
          </clipPath>
        </defs>
        {/* The wash: the frame's band and the shirt, filled in the surface's
            own grey BEHIND the ink — the drawing's lines are open, so the
            fills are drawn shapes, slightly inset, the way a colourist works
            under an inker. --art-wash inverts with the theme via .art. */}
        <path
          d="M36 66 H488 V450 H36 Z M62 92 H466 V434 H62 Z"
          fillRule="evenodd"
          fill="var(--art-wash)"
        />
        <path
          d="M418 292
             C404 299 395 308 391 320
             C387 331 384 342 385 352
             C394 359 403 363 412 369
             C425 378 439 388 452 398
             C459 390 463 378 465 362
             C466 344 464 316 457 300
             C445 291 430 288 418 292 Z"
          fill="var(--art-wash)"
        />
        {sky && (
          <g clipPath="url(#window-glass)" style={{ transition: "opacity 0.6s ease" }}>
            {deepNight &&
              STARS.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} fill="#231f20" />
              ))}
            {sky.daylight ? <Sun cx={cx} cy={cy} rays={rays} /> : <Moon cx={cx} cy={cy} />}
          </g>
        )}
      </svg>

      {/* The frame and the figure, on top — so the sky passes behind the bars. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/notioly/window-frame.svg"
        alt=""
        aria-hidden
        className="art relative h-full w-full"
      />
      </div>
    </div>
  );
}
