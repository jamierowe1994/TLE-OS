"use client";

import { useEffect, useId, useState } from "react";
import { skyState, type Phase, type SkyState } from "@/lib/sun";

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
   mullions cross at x=177/296 and y=208/331; the seated figure's hair begins
   at x=364, and the sun's arc stops short of her. */
/*
 * The glass, as the artwork actually draws it — NOT a rectangle.
 *
 * It's a hand-drawn window in perspective: the right stile leans in hard
 * (x = 498 − 0.081y, so 490 at the head rail and 461 at the sill) and the left
 * inner edge leans the other way (x = 49 + 0.043y, 51 → 67). Both lines were
 * fitted by least squares over the rasterised ink, sampling only the rows the
 * seated figure doesn't cover. A rectangle inside that shape has to choose
 * between a gap at the top-left and a spill past the stile at the bottom
 * right; this doesn't.
 *
 * The right edge then comes in a further 26 — the width of the frame's face on
 * the left, measured from the outer line to the glass. The artwork draws only
 * ONE line on the right, because she is sat against the frame and her back and
 * hair cover the face of it, but the frame is still there: without that gap the
 * sky ran out to the very edge of the drawing and the window lost its depth on
 * that side. So the face is inferred rather than drawn — no invented ink, just
 * the same band of frame the other side has.
 *
 * The sky used to stop at the arc's horizon and at her hair, which was
 * invisible while the glass was empty and reads as a hard seam the moment it
 * has colour.
 */
const GLASS = { top: 88, bottom: 448, path: "M51 88 L466 88 L437 448 L67 448 Z" };

/*
 * The frame's face and her shirt used to be washed in --art-wash, a beige laid
 * behind the open ink so the drawing had a surface. The sky retired it (James,
 * 11 Aug 2026): with the glass carrying real colour, the face reads simply by
 * being the part the sky does NOT reach, and the beige had become a second,
 * competing background. Both are the page's own colour now.
 */

/**
 * The figure's silhouette, so the sky passes BEHIND her rather than through
 * her: her face, her arm and shirt, and her shoe. Everything else of her —
 * hair, trousers — is solid ink in the artwork and hides the sky by itself.
 *
 * Traced from the artwork rather than drawn by eye: the frame SVG was
 * rasterised, the glass flood-filled from outside (with the ink thickened by
 * three so the loose pen's gaps close), and the regions the flood could not
 * reach are these. The boundary therefore lands under her own ink line, which
 * is what stops a pale halo appearing along her edge.
 */
const FIGURE =
  "M409 154L416 161L423 180L424 211L422 220L415 222L414 225L403 234L389 233L382 224L382 216" +
  "L386 215L387 211L380 210L380 201L384 184L387 184L392 178L392 175L389 175L389 164L400 164" +
  "L402 167L404 167L404 165L400 162Z" +
  "M468 266L473 281L471 329L460 382L453 405L451 407L430 406L406 399L404 397L401 397L401 389" +
  "L399 389L398 391L388 391L338 364L338 356L350 355L365 364L380 368L389 357L389 355L380 355" +
  "L380 346L386 339L402 310L402 299L406 299L413 295L433 273L433 271L440 267Z" +
  "M197 421L203 426L203 435L194 435L194 442L182 453L174 453L165 448L162 448L161 450L137 450" +
  "L131 447L131 437L167 436L171 433L179 433L180 427L188 422Z";
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

/**
 * The sky's colour, phase by phase.
 *
 * `sky` runs top of the glass → horizon, so every gradient warms as it falls.
 * The night values are deliberately off-black — a blue-charcoal — because the
 * seated figure's hair is near-black ink and the two must not merge.
 * `star` and `body` are the light against that dark; the daytime `body` is the
 * warm orange that makes the sun read as the sun and not as a hole in a pane.
 */
const PALETTE: Record<Phase, {
  /** Top of the glass → mid → the horizon band → the hazy ground below it. */
  sky: [string, string, string, string];
  body: string;
  bodyFill: string;
  glow: string;
  star: string;
  stars: number;
}> = {
  night:   { sky: ["#191E2D", "#222940", "#31384F", "#3C445E"], body: "#E7DDBE", bodyFill: "#F7F2E2", glow: "#8FA0C8", star: "#F6F1DE", stars: 1 },
  dawn:    { sky: ["#2B3350", "#57536F", "#A8807C", "#C09A93"], body: "#E4D6B4", bodyFill: "#F9F4E4", glow: "#C79A8A", star: "#EFE9DA", stars: 0.45 },
  sunrise: { sky: ["#A9CFEA", "#DCCDBC", "#F3B27E", "#F7CBA4"], body: "#D9762C", bodyFill: "#FBD9A6", glow: "#F6B87A", star: "#FFFFFF", stars: 0 },
  day:     { sky: ["#9CCBEB", "#BEDFF4", "#DCEDF9", "#EAF3FB"], body: "#DE8C1F", bodyFill: "#FCD87F", glow: "#F7CE8A", star: "#FFFFFF", stars: 0 },
  sunset:  { sky: ["#7FA9D2", "#C79A9E", "#E9834C", "#F2AD79"], body: "#C24A22", bodyFill: "#F7B96F", glow: "#EE9457", star: "#FFFFFF", stars: 0 },
  dusk:    { sky: ["#2F3855", "#5C5675", "#A97567", "#C08D7F"], body: "#E9DCBE", bodyFill: "#F8F3E3", glow: "#B790A0", star: "#EFE9DA", stars: 0.5 },
};

type Paint = (typeof PALETTE)[Phase];

const hex = (c: string) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

/** Blend two colours in sRGB. Good enough for neighbours on the same wheel. */
function mix(a: string, b: string, t: number) {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const to = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

function blend(a: Paint, b: Paint, t: number): Paint {
  return {
    sky: [
      mix(a.sky[0], b.sky[0], t),
      mix(a.sky[1], b.sky[1], t),
      mix(a.sky[2], b.sky[2], t),
      mix(a.sky[3], b.sky[3], t),
    ],
    body: mix(a.body, b.body, t),
    bodyFill: mix(a.bodyFill, b.bodyFill, t),
    glow: mix(a.glow, b.glow, t),
    star: mix(a.star, b.star, t),
    stars: a.stars + (b.stars - a.stars) * t,
  };
}

/**
 * The palette as a continuous function of where the sky is in its arc, rather
 * than six states that snap.
 *
 * The keyframes are laid out in the arc's own units, using the edge fraction
 * the solar maths hands back — so the warm band lasts forty real minutes
 * whether that is a twentieth of a June day or a tenth of a December one. Both
 * arcs start and end on the sunrise/sunset keyframes, which is what makes the
 * seam at the horizon invisible: sunset is the last colour of the day and the
 * first colour of the night.
 */
function paintFor(sky: SkyState): Paint {
  const e = sky.edge;
  const keys: [number, Phase][] = sky.daylight
    ? [[0, "sunrise"], [e, "day"], [1 - e, "day"], [1, "sunset"]]
    : [
        [0, "sunset"], [e / 2, "dusk"], [e, "night"],
        [1 - e, "night"], [1 - e / 2, "dawn"], [1, "sunrise"],
      ];

  const p = Math.min(1, Math.max(0, sky.progress));
  let i = keys.length - 2;
  while (i > 0 && p < keys[i][0]) i--;

  const [from, a] = keys[i];
  const [to, b] = keys[i + 1];
  const raw = to === from ? 0 : (p - from) / (to - from);
  // Smoothstep: the colour should settle into each keyframe rather than
  // arriving at full speed and turning a corner.
  const t = raw * raw * (3 - 2 * Math.min(1, Math.max(0, raw)));
  return blend(PALETTE[a], PALETTE[b], Math.min(1, Math.max(0, t)));
}

function Sun({
  cx,
  cy,
  rays,
  stroke,
  fill,
}: {
  cx: number;
  cy: number;
  rays: number;
  stroke: string;
  fill: string;
}) {
  return (
    <g stroke={stroke} strokeWidth={4.5} strokeLinecap="round" fill="none">
      <circle cx={cx} cy={cy} r={17} fill={fill} />
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

function Moon({ cx, cy, fill, stroke }: { cx: number; cy: number; fill: string; stroke: string }) {
  // A crescent drawn as one closed path — two arcs, the way you'd draw it.
  const r = 17;
  return (
    <path
      d={`M ${cx + r * 0.35} ${cy - r * 0.94}
          A ${r} ${r} 0 1 0 ${cx + r * 0.35} ${cy + r * 0.94}
          A ${r * 0.78} ${r * 0.78} 0 1 1 ${cx + r * 0.35} ${cy - r * 0.94} Z`}
      fill={fill}
      stroke={stroke}
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
    // Once a minute. Five was plenty while the sky was only moving a body
    // across it, but the colour now ramps over the forty minutes either side
    // of the horizon — at five-minute ticks that ramp arrives in eight visible
    // steps. A minute is a fortieth, which reads as a fade.
    const id = window.setInterval(() => setSky(skyState()), 60_000);
    return () => window.clearInterval(id);
  }, [at]);

  const { cx, cy } = position(sky?.progress ?? 0.5);
  // Rays shorten as the sun nears the horizon — but never below 0.45, or a low
  // sun renders as a bare circle and reads as the moon.
  const rays = sky
    ? Math.min(1, Math.max(0.45, Math.sin(Math.min(1, Math.max(0, sky.progress)) * Math.PI) * 1.6))
    : 1;
  const pal = sky ? paintFor(sky) : PALETTE.day;
  // SVG defs are document-global: two windows on one page (the design review
  // grid) would otherwise both paint with whichever gradient rendered first.
  const uid = useId().replace(/:/g, "");
  const glassId = `glass-${uid}`;
  const fillId = `sky-${uid}`;
  const glowId = `glow-${uid}`;
  /** The arc's horizon, as a stop offset down the glass. */
  const horizon = (ARC.yHorizon - GLASS.top) / (GLASS.bottom - GLASS.top);

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
      {/*
        The coloured sky, behind the glass — and deliberately OUTSIDE the .art
        layer. Dark mode inverts and hue-rotates .art, which is right for black
        ink and wrong for a sunset; these colours are chosen for both themes and
        only dimmed a little at night by .window-sky.
      */}
      <svg
        viewBox="0 0 520 520"
        aria-hidden
        className="window-sky absolute inset-0 h-full w-full"
      >
        <defs>
          <clipPath id={glassId}>
            <path d={GLASS.path} />
          </clipPath>
          <linearGradient id={fillId} x1="0" y1={GLASS.top} x2="0" y2={GLASS.bottom} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={pal.sky[0]} />
            <stop offset={horizon * 0.6} stopColor={pal.sky[1]} />
            <stop offset={horizon} stopColor={pal.sky[2]} />
            <stop offset="1" stopColor={pal.sky[3]} />
          </linearGradient>
          {/* The light the body throws onto the sky around it. */}
          <radialGradient id={glowId} cx={cx} cy={cy} r={72} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={pal.glow} stopOpacity={0.75} />
            <stop offset="1" stopColor={pal.glow} stopOpacity={0} />
          </radialGradient>
        </defs>
        {sky && (
          <g clipPath={`url(#${glassId})`} style={{ transition: "opacity 0.6s ease" }}>
            <path d={GLASS.path} fill={`url(#${fillId})`} />
            {/* Transparent in light mode; in dark it takes the sky down so the
                inverted white ink has something to read against. */}
            <path d={GLASS.path} fill="var(--sky-veil)" />
            {pal.stars > 0 &&
              STARS.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} fill={pal.star} opacity={pal.stars} />
              ))}
            <circle cx={cx} cy={cy} r={72} fill={`url(#${glowId})`} />
            {sky.daylight ? (
              <Sun cx={cx} cy={cy} rays={rays} stroke={pal.body} fill={pal.bodyFill} />
            ) : (
              <Moon cx={cx} cy={cy} fill={pal.bodyFill} stroke={pal.body} />
            )}
            {/* Her, in the surface's own colour, over the sky and under the
                ink — so she keeps the colours she always had. */}
            <path d={FIGURE} fill="var(--page)" />
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
