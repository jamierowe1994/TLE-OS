"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlideBody } from "@/components/PresentDeck";
import { BookAgenda, BookAgent, BookApproach, BookComparables, BookCompliance, BookLegal, BookListings, BookMarket, BookMarketing, BookMaterial, BookMaxPrice, BookOffer, BookPortals, BookProperty, BookSocial, BookWelcome } from "@/components/PresentBookPages";
import { CREAM, HAND, INK, StageForceCtx } from "@/components/present-kit";
import type { PresentDeck as Deck, SlideId } from "@/lib/present";

/**
 * THE BOOKLET. The post-appraisal deck as a landscape booklet - a closed
 * cover on the table, turned open, then page by page.
 *
 * James, 13 Sep 2026: "we want it to actually feel like a proper booklet
 * ... things like the crease in the book, the line, and the shadow will
 * all play a factor in how the page turns over. All of this kind of stuff
 * needs to be bang on." And, on the first attempt: "the turning page feels
 * like a flat rectangle simply rotating upward. The shadow looks detached
 * from the page, the centre seam is poor, and the animation does not feel
 * like paper."
 *
 * ── A page is a slide ──────────────────────────────────────────────────────
 *
 * Every page is a slide drawn whole at its stage size (1440x900), or one of
 * the booklet's own pages (PresentBookPages). Which face goes where, the
 * cover, the order and the navigation are unchanged by the physics below.
 *
 * ── Why the first version looked flat ──────────────────────────────────────
 *
 * 1. The turning page was ONE rigid rectangle on a hinge - a card flip.
 *    Paper bends: the outer corner lifts first, the sheet bows, and it
 *    floats down outer-edge last.
 * 2. Its shadow was a gradient painted ON the page, so it never moved with
 *    the sheet or fell on the page underneath.
 * 3. The gutter was a 1px grey line: a border, not two sheets curving
 *    down into a binding.
 * 4. The pages were flat white with no thickness under them.
 *
 * ── The turn now ───────────────────────────────────────────────────────────
 *
 * The turning sheet is a chain of vertical STRIPS, each hinged on the
 * previous, from the spine outward. The chain as a whole swings on the
 * spine (the hinge angle) while each strip adds a small angle of its own
 * (the bend), so the sheet BOWS: the outer edge runs ahead early - the
 * corner lifting first - is convex through the middle, and lags behind at
 * the end - the sheet floating down onto the stack. Every frame is driven
 * by requestAnimationFrame writing transforms straight to the DOM; React
 * renders the sheet once at the start and once at the end.
 *
 * With it, per frame: a shadow that FALLS on the page beneath (on the
 * right at first, then on the left as the sheet crosses), soft when the
 * sheet is high and tighter as it lands; the sheet's own face darkening
 * toward its fold and its underside a shade darker; a highlight along the
 * lifted outer edge; the gutter deepening a touch as the sheet passes
 * over it; and a tiny settle as it lands.
 *
 * ── The book at rest ───────────────────────────────────────────────────────
 *
 * Warm paper, not white, with a grain you only feel. A gutter with a narrow
 * contact shadow exactly at the seam, a wide soft fall-off either side, a
 * hairline of light beside the shadow on the right (the light is from the
 * upper left) and no hard line. A few fine sheets under the outer edges
 * for thickness. A soft ambient shadow under the whole block and a firmer
 * one under its bottom edges.
 *
 * Reduced motion: no physics - the spread crossfades.
 */

export const PAGE_W = 1440;
export const PAGE_H = 900;
const TURN_MS = 1000;
const STAGED = { staged: true, scale: 1 };
/** Warm paper, and the warm neutral every shadow here is made from. */
const PAPER = "#fbfaf7";
const BLOCK_SHADOW = "0 60px 100px -30px rgba(55,45,40,0.32), 0 22px 40px -18px rgba(55,45,40,0.22), 0 6px 10px -4px rgba(55,45,40,0.16)";
const SHADE = "55, 45, 40";
/** A restrained grain: SVG turbulence, drawn once, tiled. */
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.2 0 0 0 0.5 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>\")";

/** One slide, on one page, at the stage's size. */
function PageFace({ deck, id }: { deck: Deck; id: SlideId }) {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: CREAM }}>
      <StageForceCtx.Provider value={STAGED}>
        <SlideBody id={id} deck={deck} show />
      </StageForceCtx.Provider>
    </div>
  );
}

/** The last page when the count is odd: cream, the mark, the line. */
function BlankFace() {
  return (
    <div className="relative flex items-end justify-center overflow-hidden pb-16" style={{ width: PAGE_W, height: PAGE_H, background: CREAM, color: INK }}>
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className="mx-auto h-[56px] w-auto" />
        <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-black/45">People &middot; Homes &middot; Relationships</p>
      </div>
    </div>
  );
}

/**
 * THE FRONT COVER, from James's mock-up: the mark and the line top-left,
 * "Your Letting Plan." with the second line in the accent and a rule
 * under it, the strapline, the address at the foot; the terrace on the
 * right on a pink shape, and a handwritten line in the corner. Composed
 * rather than a flat picture so the address is the landlord's.
 */
function CoverFace({ deck }: { deck: Deck }) {
  const HEAD = { fontFamily: HAND, fontWeight: 800, letterSpacing: "-0.02em" } as const;
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: PAGE_H, background: "#fbf8f4", color: INK }}>
      {/* THE PINK: in the top-right corner, three-quarters of it off the
          page - "a nice little shadow of pink just above one or two of the
          houses" (James, 13 Sep 2026). */}
      <div className="pointer-events-none absolute -right-[300px] -top-[330px] h-[640px] w-[640px] rounded-full" style={{ background: "var(--p-tint)", opacity: 0.9 }} />
      {/* THE STREET: James's terrace cut-out (Presentation folder, 13 Sep
          2026 - "literally the same as the example image"), on a transparent
          ground so it sits IN the cover; the road fades out on its own. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photo/cover-terrace.webp" alt="" aria-hidden className="pointer-events-none absolute max-w-none" style={{ height: 790, right: -150, bottom: 30 }} />
      <div className="absolute left-[96px] top-[84px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className="h-[64px] w-auto" />
        <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-black/50">People &middot; Homes &middot; Relationships</p>
        <h1 className="mt-[100px] text-[92px] leading-[1.0]" style={HEAD}>
          Your
          <br />
          <span style={{ color: "#cfa096" }}>Letting Plan.</span>
        </h1>
        {/* The stroke under it: hand-drawn, with a bow, set under the middle
            of the title rather than flush left. */}
        <svg viewBox="0 0 400 14" aria-hidden className="ml-[36px] mt-3" style={{ width: 340, height: 14 }}>
          <path d="M4 11C90 3 220 2 396 8" fill="none" stroke="#cfa096" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        </svg>
        <p className="mt-6 text-[12px] uppercase tracking-[0.3em] text-black/55">A smarter letting experience</p>
      </div>
      {(deck.property.address || deck.property.postcode) && (
        <p className="absolute bottom-[80px] left-[96px] max-w-[400px] text-[12px] uppercase leading-[1.6] tracking-[0.22em] text-black/55">
          {[deck.property.address, deck.property.postcode].filter(Boolean).join(", ")}
        </p>
      )}
      {/* In the script face, not the marker: "some nice handwritten text". */}
      <p className="absolute bottom-[56px] right-[110px] w-[340px] text-right text-[34px] leading-[1.1] text-black/70" style={{ fontFamily: "var(--font-script), 'Snell Roundhand', cursive", transform: "rotate(-5deg)" }}>
        More than
        <br />
        just a letting agent.
      </p>
      {/* THE SPINE. A hardback's ridge down the left edge - the board turns
          in and the cloth rounds over it: a dark line where it folds, a
          highlight where the light catches, and a soft band of shadow
          across the first 40px of the cover. James, 13 Sep 2026: "I think
          the ridge is where it sells it." */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[44px]" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.05) 8px, rgba(255,255,255,0.35) 12px, rgba(0,0,0,0.06) 18px, rgba(0,0,0,0.10) 24px, rgba(0,0,0,0) 44px)" }} />
      <div className="pointer-events-none absolute inset-y-0 left-[16px] w-px" style={{ background: "rgba(0,0,0,0.18)" }} />
      {/* The board's edge: a whisper of a bevel round the cover. */}
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)" }} />
    </div>
  );
}

/** Which face goes where: page index -1 is the cover, N is the blank end.
 *  A slide with a page of its own in PresentBookPages gets that; the rest
 *  are drawn as the slide. */
function Face({ deck, pages, n }: { deck: Deck; pages: SlideId[]; n: number }) {
  if (n < 0) return <CoverFace deck={deck} />;
  if (n >= pages.length) return <BlankFace />;
  const id = pages[n];
  if (id === "welcome") return <BookWelcome deck={deck} />;
  if (id === "agenda") return <BookAgenda />;
  if (id === "agent") return <BookAgent deck={deck} />;
  if (id === "approach") return <BookApproach />;
  if (id === "property") return <BookProperty deck={deck} />;
  if (id === "material") return <BookMaterial deck={deck} />;
  if (id === "listings") return <BookListings deck={deck} />;
  if (id === "comparables") return <BookComparables deck={deck} />;
  if (id === "market") return <BookMarket deck={deck} />;
  if (id === "marketing") return <BookMarketing />;
  if (id === "offer") return <BookOffer />;
  if (id === "maxprice") return <BookMaxPrice />;
  if (id === "portals") return <BookPortals />;
  if (id === "social") return <BookSocial />;
  if (id === "compliance") return <BookCompliance deck={deck} />;
  if (id === "legal") return <BookLegal />;
  return <PageFace deck={deck} id={id} />;
}


/* ───────────────────────── the book ───────────────────────── */

/** The thickness under a page: a few fine sheets, unevenly spaced. */
function Stack({ side, sheets }: { side: "left" | "right"; sheets: number }) {
  const n = Math.max(0, Math.min(6, sheets));
  const offsets = [1, 2.5, 4, 5, 6.5, 8];
  return (
    <>
      {offsets.slice(0, n).map((o, i) => (
        <div
          key={i}
          className="pointer-events-none absolute top-0"
          style={{
            width: PAGE_W,
            height: PAGE_H,
            left: side === "left" ? -o : o,
            top: o * 0.8,
            background: i % 2 ? "#f6f3ee" : "#f2efe9",
            boxShadow: `0 0 0 1px rgba(${SHADE},0.05), 0 1px 1px rgba(${SHADE},0.04)`,
            zIndex: -1 - i,
          }}
        />
      ))}
    </>
  );
}

/** The grain and the paper-edge light, over every page. */
function PaperFinish() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.045, mixBlendMode: "multiply" }} />
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5)" }} />
    </>
  );
}

/**
 * The gutter, painted on the inner edge of each page: a narrow contact
 * shadow at the seam, a wide soft fall-off, and on the right a hairline
 * of light beside the shadow. Slightly deeper on the left, which faces
 * away from a light in the upper left. `deep` is added while a sheet
 * passes over.
 */
function Gutter({ side, deepRef }: { side: "left" | "right"; deepRef?: (el: HTMLDivElement | null) => void }) {
  const base =
    side === "left"
      ? `linear-gradient(to left, rgba(${SHADE},0.26) 0px, rgba(${SHADE},0.13) 5px, rgba(${SHADE},0.06) 22px, rgba(${SHADE},0.025) 70px, rgba(${SHADE},0) 150px)`
      : `linear-gradient(to right, rgba(${SHADE},0.22) 0px, rgba(${SHADE},0.10) 4px, rgba(255,255,255,0.28) 7px, rgba(${SHADE},0.05) 16px, rgba(${SHADE},0.02) 60px, rgba(${SHADE},0) 130px)`;
  return (
    <>
      <div className="pointer-events-none absolute inset-y-0" style={{ [side === "left" ? "right" : "left"]: 0, width: 160, background: base }} />
      {/* deepens while a sheet crosses */}
      <div ref={deepRef} className="pointer-events-none absolute inset-y-0" style={{ [side === "left" ? "right" : "left"]: 0, width: 90, opacity: 0, background: side === "left" ? `linear-gradient(to left, rgba(${SHADE},0.22), rgba(${SHADE},0))` : `linear-gradient(to right, rgba(${SHADE},0.22), rgba(${SHADE},0))` }} />
    </>
  );
}

/** A cubic bezier, sampled - the easing the turn runs on. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const B = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const C = (a1: number) => 3 * a1;
  const calc = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t: number, a1: number, a2: number) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}
/* Quick off the table, smooth through the middle, gentle to land. */
const EASE = bezier(0.22, 0.61, 0.36, 1);

/**
 * THE SHEET: the page that turns, as strips hinged one on the next.
 *
 * Forward (dir 1): it is the right-hand page; its hinge is the spine at
 * its left edge; it swings to the left, and its back is the next spread's
 * left page. Backward (dir -1) is the mirror. Each strip carries its slice
 * of the front page and, rotated half a turn about its own axis, its slice
 * of the back page - laid in so it reads correctly, not mirrored, when the
 * sheet has landed. The strips overlap by a pixel so no seam shows.
 */
function Sheet({
  deck,
  pages,
  dir,
  frontN,
  backN,
  strips,
  nodes,
}: {
  deck: Deck;
  pages: SlideId[];
  dir: 1 | -1;
  frontN: number;
  backN: number;
  strips: number;
  nodes: React.MutableRefObject<SheetNodes>;
}) {
  const w = PAGE_W / strips;
  /* From the spine outward. Forward, strip 0 is at the left of the right
     page and the chain grows to the right; backward, strip 0 is at the
     right of the left page and the chain grows to the left. */
  const grow = dir === 1 ? "left" : "right";
  const origin = dir === 1 ? "0% 50%" : "100% 50%";
  const stripStyle = (i: number): React.CSSProperties => ({
    position: "absolute",
    top: 0,
    [grow]: i === 0 ? 0 : w - 1,
    width: w + 1,
    height: PAGE_H,
    transformStyle: "preserve-3d",
    transformOrigin: origin,
    willChange: "transform",
  });
  /* Where this strip's slice sits on the page: forward, strip i is the
     i-th from the left; backward, the i-th from the right. */
  const sliceX = (i: number, mirrored: boolean) => {
    const fromLeft = dir === 1 ? i : strips - 1 - i;
    const x = mirrored ? strips - 1 - fromLeft : fromLeft;
    return -x * w;
  };
  const render = (i: number): React.ReactNode => (
    <div
      key={i}
      ref={(el) => {
        nodes.current.strips[i] = el;
      }}
      style={stripStyle(i)}
    >
      {/* FRONT */}
      <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", background: PAPER }}>
        <div className="absolute top-0" style={{ left: sliceX(i, false), width: PAGE_W, height: PAGE_H }}>
          <Face deck={deck} pages={pages} n={frontN} />
        </div>
        {/* fold shading, deepest toward the spine */}
        <div
          ref={(el) => {
            nodes.current.frontShade[i] = el;
          }}
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0,
            /* ONE gradient the width of the sheet, each strip showing its
               own slice of it - shading per strip showed as bands where
               the strips met. */
            backgroundImage: `linear-gradient(to ${dir === 1 ? "right" : "left"}, rgba(${SHADE},0.24) 0%, rgba(${SHADE},0.10) 30%, rgba(${SHADE},0.03) 70%, rgba(${SHADE},0) 100%)`,
            backgroundSize: `${PAGE_W}px 100%`,
            backgroundPosition: `${sliceX(i, false)}px 0`,
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
      {/* BACK, turned about its own axis so it faces the other way */}
      <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: PAPER }}>
        <div className="absolute top-0" style={{ left: sliceX(i, true), width: PAGE_W, height: PAGE_H }}>
          <Face deck={deck} pages={pages} n={backN} />
        </div>
        {/* the underside, a shade darker, deepest at the spine */}
        <div
          ref={(el) => {
            nodes.current.backShade[i] = el;
          }}
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0,
            backgroundImage: `linear-gradient(to ${dir === 1 ? "left" : "right"}, rgba(${SHADE},0.16) 0%, rgba(${SHADE},0.08) 40%, rgba(${SHADE},0.05) 100%)`,
            backgroundSize: `${PAGE_W}px 100%`,
            backgroundPosition: `${sliceX(i, true)}px 0`,
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
      {/* the highlight along the lifted outer edge, on the last strip only */}
      {i === strips - 1 && (
        <div
          ref={(el) => {
            nodes.current.edge = el;
          }}
          className="pointer-events-none absolute inset-y-0"
          style={{ [dir === 1 ? "right" : "left"]: 0, width: 3, opacity: 0, background: "linear-gradient(to bottom, rgba(255,255,255,0.0), rgba(255,255,255,0.85) 30%, rgba(255,255,255,0.85) 70%, rgba(255,255,255,0))", transform: "translateZ(1px)" }}
        />
      )}
      {i + 1 < strips && render(i + 1)}
    </div>
  );
  return (
    <div
      ref={(el) => {
        nodes.current.hinge = el;
      }}
      className="absolute top-0"
      style={{
        left: dir === 1 ? PAGE_W : 0,
        width: PAGE_W,
        height: PAGE_H,
        transformStyle: "preserve-3d",
        transformOrigin: origin,
        zIndex: 5,
        willChange: "transform",
      }}
    >
      {render(0)}
    </div>
  );
}

type SheetNodes = {
  hinge: HTMLDivElement | null;
  strips: (HTMLDivElement | null)[];
  frontShade: (HTMLDivElement | null)[];
  backShade: (HTMLDivElement | null)[];
  edge: HTMLDivElement | null;
  /* on the table */
  shadowRight: HTMLDivElement | null;
  shadowLeft: HTMLDivElement | null;
  gutterLeft: HTMLDivElement | null;
  gutterRight: HTMLDivElement | null;
  contact: HTMLDivElement | null;
};
const emptyNodes = (): SheetNodes => ({ hinge: null, strips: [], frontShade: [], backShade: [], edge: null, shadowRight: null, shadowLeft: null, gutterLeft: null, gutterRight: null, contact: null });

/**
 * One frame of the turn, at progress p in [0,1]. Writes transforms and
 * opacities straight to the nodes - nothing here touches React.
 *
 * bend(p): how far the outer edge runs ahead of (+) or behind (-) the
 * hinge. Positive early - the corner lifts first - through a convex middle
 * - the sheet bowed toward the reader at the top of its arc - to negative
 * late, the outer edge floating down last.
 */
function applyFrame(n: SheetNodes, dir: 1 | -1, p: number, strips: number) {
  const e = EASE(p);
  const hinge = -dir * 180 * e;
  const lift = Math.sin(Math.PI * p);
  const bend = 0.62 * Math.sin(2 * Math.PI * p) + 0.38 * lift;
  /* 14 degrees across the sheet at most, shared out from the spine. */
  const perStrip = (14 / strips) * bend * -dir;
  if (n.hinge) n.hinge.style.transform = `rotateY(${hinge}deg)`;
  n.strips.forEach((el, i) => {
    if (!el) return;
    /* The spine-side strip barely bends; the outer ones bend most. */
    const k = i === 0 ? 0.35 : 1;
    el.style.transform = `rotateY(${perStrip * k}deg)`;
  });
  n.frontShade.forEach((el) => el && (el.style.opacity = String(0.85 * lift)));
  n.backShade.forEach((el) => el && (el.style.opacity = String(0.2 + 0.8 * lift)));
  if (n.edge) n.edge.style.opacity = String(0.7 * Math.pow(lift, 1.5));
  /* The shadow it casts: on the page it is leaving while it is over that
     side, on the page it lands on as it comes down - softer when high,
     tighter near the surface. */
  const leaving = dir === 1 ? n.shadowRight : n.shadowLeft;
  const landing = dir === 1 ? n.shadowLeft : n.shadowRight;
  if (leaving) {
    const a = 0.2 * lift * Math.pow(1 - p, 0.6);
    const reach = 35 + 45 * lift;
    leaving.style.opacity = String(a);
    leaving.style.backgroundImage = `linear-gradient(to ${dir === 1 ? "right" : "left"}, rgba(${SHADE},1) 0%, rgba(${SHADE},0.5) ${reach * 0.35}%, rgba(${SHADE},0) ${reach}%)`;
  }
  if (landing) {
    const a = 0.22 * Math.pow(p, 1.2) * Math.pow(lift, 0.5);
    const reach = 20 + 55 * lift;
    landing.style.opacity = String(a);
    landing.style.backgroundImage = `linear-gradient(to ${dir === 1 ? "left" : "right"}, rgba(${SHADE},1) 0%, rgba(${SHADE},0.5) ${reach * 0.35}%, rgba(${SHADE},0) ${reach}%)`;
  }
  const g = 0.9 * lift;
  if (n.gutterLeft) n.gutterLeft.style.opacity = String(g);
  if (n.gutterRight) n.gutterRight.style.opacity = String(g);
  if (n.contact) n.contact.style.opacity = String(0.7 * lift);
}

export default function PresentBook({
  deck,
  pages,
  fit,
  onSpread,
  onApi,
}: {
  deck: Deck;
  pages: SlideId[];
  /** How much of a 2880x900 spread fits: the zoom. */
  fit: number;
  /** -1 while closed, then the spread; and how many spreads there are. */
  onSpread?: (at: number, of: number) => void;
  /** The turn, for the arrows in the pop-out's foot. */
  onApi?: (api: { go: (dir: 1 | -1) => void }) => void;
}) {
  const spreads = Math.ceil(pages.length / 2);
  /* -1 is closed on the cover. */
  const [at, setAt] = useState(-1);
  const [turn, setTurn] = useState<{ dir: 1 | -1; from: number } | null>(null);
  const [settle, setSettle] = useState<"left" | "right" | null>(null);
  const still = useRef(false);
  const nodes = useRef<SheetNodes>(emptyNodes());
  const raf = useRef(0);
  /* Six is enough for the bow to read as a curve; every strip is a whole
     copy of the page, so the first frame of a turn - when all of them are
     built - is the cost to keep down. Four where there is less to spend. */
  const strips = fit < 0.42 ? 4 : 6;

  useEffect(() => {
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useEffect(() => {
    onSpread?.(at, spreads);
  }, [at, spreads, onSpread]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (turn) return;
      const to = at + dir;
      if (to < -1 || to >= spreads) return;
      if (still.current) {
        setAt(to);
        return;
      }
      nodes.current = emptyNodes();
      setTurn({ dir, from: at });
    },
    [at, turn, spreads],
  );

  /* The turn runs on the clock, not on React: one frame at a time into
     the nodes the sheet registered, then the spread changes and the sheet
     is gone. */
  useEffect(() => {
    if (!turn) return;
    let start = 0;
    const n = nodes.current;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / TURN_MS);
      applyFrame(n, turn.dir, p, strips);
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        setAt(turn.from + turn.dir);
        setTurn(null);
        /* The landing: a breath of compression on the page it lands on. */
        setSettle(turn.dir === 1 ? "left" : "right");
        window.setTimeout(() => setSettle(null), 180);
      }
    };
    raf.current = requestAnimationFrame((t0) => {
      applyFrame(n, turn.dir, 0, strips);
      raf.current = requestAnimationFrame(step);
      void t0;
    });
    return () => cancelAnimationFrame(raf.current);
  }, [turn, strips]);

  useEffect(() => {
    onApi?.({ go });
  }, [go, onApi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  /* Page numbers on the table. Spread k shows pages 2k (left) and 2k+1
     (right); closed shows the cover (-1) on the right and nothing on the
     left. During a forward turn the right sheet already shows the next
     spread's right page; during a backward one the left shows the previous
     spread's left. */
  const here = turn ? turn.from : at;
  const forward = turn?.dir === 1;
  const leftOf = (k: number) => (k < 0 ? null : 2 * k);
  const rightOf = (k: number) => (k < 0 ? -1 : 2 * k + 1);
  const leftN = turn && !forward ? leftOf(here - 1) : leftOf(here);
  const rightN = turn && forward ? rightOf(here + 1) : rightOf(here);
  const closedNow = turn ? (forward ? false : here - 1 < 0) : at < 0;
  const shiftX = closedNow ? -PAGE_W / 2 : 0;
  const canBack = at > -1 && !turn;
  const canNext = at < spreads - 1 && !turn;
  const leftSheets = at < 0 ? 0 : Math.min(6, 2 + Math.floor(Math.max(at, 0) / 2));
  const rightSheets = at < 0 ? 6 : Math.min(6, 2 + Math.floor((spreads - 1 - Math.max(at, 0)) / 2));
  const open = leftN != null;
  /* Opening the cover: there is no left page yet, but the sheet needs
     something to land on from the first frame - a blank sheet with its
     shadow - or the shadow of the whole left side appears at the end of
     the turn in one go (James, 13 Sep 2026: "all of a sudden just loads
     in"). The welcome replaces it, in the same place, when the turn ends. */
  const landingBlank = !!turn && forward && here < 0;
  const settleStyle = (side: "left" | "right"): React.CSSProperties =>
    settle === side ? { transform: "scale(0.997)", transition: "transform 90ms ease-out" } : { transform: "none", transition: "transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1)" };

  return (
    <div className="relative" style={{ width: PAGE_W * 2 * fit, height: PAGE_H * fit }}>
      <div
        className="absolute left-0 top-0"
        style={{
          zoom: fit,
          width: PAGE_W * 2,
          height: PAGE_H,
          /* Shallow: a sheet turning in front of us, not an object in
             deep space. */
          perspective: 2600,
          perspectiveOrigin: "50% 42%",
          color: INK,
          transform: `translateX(${shiftX}px)`,
          transition: `transform ${TURN_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
        }}
      >
        {/* THE BLOCK on the table: an ambient shadow under the whole of it,
            a firmer one under its bottom edge. */}
        <div className="absolute left-0 top-0 flex" style={{ borderRadius: 4 }}>
          {/* Left page. Each page carries its own shadow: on the block, the
              shadow spanned the empty left slot while the book was closed
              and drew a line across the table beside the cover. */}
          <div className="relative" style={{ width: PAGE_W, height: PAGE_H }}>
            {(open || landingBlank) && (
              <>
                <Stack side="left" sheets={open ? leftSheets : 1} />
                <div key={open ? `L${leftN}` : "L-blank"} className="relative overflow-hidden" style={{ borderRadius: "4px 0 0 4px", background: PAPER, boxShadow: BLOCK_SHADOW, ...settleStyle("left") }}>
                  {open ? <Face deck={deck} pages={pages} n={leftN as number} /> : <div style={{ width: PAGE_W, height: PAGE_H, background: PAPER }} />}
                  <PaperFinish />
                  <Gutter side="left" deepRef={(el) => (nodes.current.gutterLeft = el)} />
                  {/* the shadow a turning sheet throws on this page */}
                  <div ref={(el) => {
                    nodes.current.shadowLeft = el;
                  }} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }} />
                </div>
              </>
            )}
          </div>
          {/* Right page. */}
          <div className="relative" style={{ width: PAGE_W, height: PAGE_H }}>
            <Stack side="right" sheets={rightSheets} />
            <div key={`R${rightN}`} className="relative overflow-hidden" style={{ borderRadius: open || landingBlank ? "0 4px 4px 0" : 4, background: PAPER, boxShadow: BLOCK_SHADOW, ...settleStyle("right") }}>
              <Face deck={deck} pages={pages} n={rightN} />
              <PaperFinish />
              {(open || landingBlank) && <Gutter side="right" deepRef={(el) => (nodes.current.gutterRight = el)} />}
              <div ref={(el) => {
                    nodes.current.shadowRight = el;
                  }} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }} />
            </div>
          </div>
        </div>

        {/* THE SEAM: the contact shadow exactly where the two sheets meet,
            over both pages - and the narrow shadow a passing sheet adds. */}
        {(open || landingBlank) && (
          <>
            <div className="pointer-events-none absolute top-0 z-[6]" style={{ left: PAGE_W - 3, width: 6, height: PAGE_H, background: `linear-gradient(to right, rgba(${SHADE},0) 0%, rgba(${SHADE},0.30) 50%, rgba(${SHADE},0) 100%)` }} />
            <div ref={(el) => {
                    nodes.current.contact = el;
                  }} className="pointer-events-none absolute top-0 z-[6]" style={{ left: PAGE_W - 8, width: 16, height: PAGE_H, opacity: 0, background: `linear-gradient(to right, rgba(${SHADE},0) 0%, rgba(${SHADE},0.28) 50%, rgba(${SHADE},0) 100%)` }} />
          </>
        )}

        {/* THE SHEET, only while a turn is on. */}
        {turn && (
          <Sheet
            deck={deck}
            pages={pages}
            dir={turn.dir}
            frontN={forward ? rightOf(here) : (leftOf(here) as number)}
            backN={forward ? (leftOf(here + 1) as number) : rightOf(here - 1)}
            strips={strips}
            nodes={nodes}
          />
        )}

        {/* Tap a page to turn it; the cover to open it. */}
        <button type="button" aria-label="Previous page" disabled={!canBack} onClick={() => go(-1)} className="absolute left-0 top-0 z-[7] h-full w-[50%] cursor-w-resize disabled:cursor-default" style={{ background: "transparent" }} />
        <button type="button" aria-label="Next page" disabled={!canNext} onClick={() => go(1)} className="absolute right-0 top-0 z-[7] h-full w-[50%] cursor-e-resize disabled:cursor-default" style={{ background: "transparent" }} />
      </div>
    </div>
  );
}
