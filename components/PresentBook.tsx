"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlideBody } from "@/components/PresentDeck";
import { BookAgenda, BookAgent, BookApproach, BookWelcome } from "@/components/PresentBookPages";
import { CREAM, HAND, INK, StageForceCtx } from "@/components/present-kit";
import type { PresentDeck as Deck, SlideId } from "@/lib/present";

/**
 * THE BOOKLET. The post-appraisal deck as a landscape booklet - a closed
 * cover on the table, turned open, then page by page.
 *
 * James, 13 Sep 2026, fourth pass: "we want it to actually feel like a
 * proper booklet ... landscape ... Things like the crease in the book, the
 * line, and the shadow will all play a factor in how the page turns over.
 * All of this kind of stuff needs to be bang on ... I think we can drop the
 * entrance animation."
 *
 * ── A page is a slide ──────────────────────────────────────────────────────
 *
 * His mock-up's pages are the deck's slides, one to a page, in the deck's
 * order - the welcome on the left, the agenda on the right. So every page
 * here is a slide drawn whole at its stage size (1440x900) and the booklet
 * is scaled to fit the window. The front cover is the booklet's own,
 * composed here from the cover art, and its back is page one.
 *
 * ── Closed, then open ──────────────────────────────────────────────────────
 *
 * It arrives closed, the cover centred. Opening it is a turn like any
 * other - the cover is a leaf whose back is the first page - while the
 * whole book slides half a page left so the open spread is centred on the
 * spine. Closing it from the first spread is the same in reverse.
 *
 * ── What makes it real ─────────────────────────────────────────────────────
 *
 * The stack: the pages still to read are a few sheets thick under the
 * right-hand page, the pages read under the left. The crease: each page
 * darkens a little into the spine, and a hairline runs down it. The turn:
 * a leaf on a hinge with a shadow that deepens across it as it lifts, and a
 * shadow it casts on the page beneath as it comes down. Under prefers-
 * reduced-motion the spread simply changes.
 */

export const PAGE_W = 1440;
export const PAGE_H = 900;
const TURN_MS = 1000;
const TURN_EASE = "cubic-bezier(0.42, 0.05, 0.28, 1)";
const STAGED = { staged: true, scale: 1 };

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
  return <PageFace deck={deck} id={id} />;
}

/** A few sheets' worth of edge under a page, so the block has thickness. */
function Stack({ side, sheets }: { side: "left" | "right"; sheets: number }) {
  const n = Math.max(0, Math.min(5, sheets));
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute top-0"
          style={{
            width: PAGE_W,
            height: PAGE_H,
            left: side === "left" ? -(i + 1) * 3 : (i + 1) * 3,
            top: (i + 1) * 2,
            background: "#f4f1ec",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
            zIndex: -1 - i,
          }}
        />
      ))}
    </>
  );
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
  const [turn, setTurn] = useState<{ dir: 1 | -1; from: number; going: boolean } | null>(null);
  const still = useRef(false);
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
      setTurn({ dir, from: at, going: false });
      requestAnimationFrame(() => requestAnimationFrame(() => setTurn((t) => (t ? { ...t, going: true } : t))));
      window.setTimeout(() => {
        setAt(to);
        setTurn(null);
      }, TURN_MS + 30);
    },
    [at, turn, spreads],
  );

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
  /* Where the book sits: closed, the cover is centred; open, the spine is. */
  const closedNow = turn ? (forward ? false : here - 1 < 0) : at < 0;
  const shiftX = closedNow ? -PAGE_W / 2 : 0;
  const canBack = at > -1 && !turn;
  const canNext = at < spreads - 1 && !turn;
  const readSheets = Math.max(0, at) ;
  const leftSheets = at < 0 ? 0 : Math.min(5, 1 + Math.floor(readSheets / 2));
  const rightSheets = Math.min(5, 1 + Math.floor((spreads - 1 - Math.max(at, 0)) / 2));

  return (
    <div className="relative" style={{ width: PAGE_W * 2 * fit, height: PAGE_H * fit }}>
      <div
        className="absolute left-0 top-0"
        style={{
          zoom: fit,
          width: PAGE_W * 2,
          height: PAGE_H,
          perspective: 3200,
          color: INK,
          transform: `translateX(${shiftX}px)`,
          transition: `transform ${TURN_MS}ms ${TURN_EASE}`,
        }}
      >
        {/* THE BLOCK on the table. */}
        <div className="absolute left-0 top-0 flex" style={{ filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.35)) drop-shadow(0 6px 10px rgba(0,0,0,0.15))" }}>
          {/* Left page. */}
          <div className="relative" style={{ width: PAGE_W, height: PAGE_H }}>
            {leftN != null && (
              <>
                <Stack side="left" sheets={leftSheets} />
                <div key={`L${leftN}`} className="relative overflow-hidden rounded-l-[6px]">
                  <Face deck={deck} pages={pages} n={leftN} />
                  {/* THE CREASE: the page darkens into the spine. */}
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-[90px]" style={{ background: "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.14) 100%)" }} />
                </div>
              </>
            )}
          </div>
          {/* Right page. */}
          <div className="relative" style={{ width: PAGE_W, height: PAGE_H }}>
            <Stack side="right" sheets={rightSheets} />
            <div key={`R${rightN}`} className={`relative overflow-hidden rounded-r-[6px] ${leftN == null ? "rounded-l-[6px]" : ""}`}>
              <Face deck={deck} pages={pages} n={rightN} />
              {leftN != null && (
                <div className="pointer-events-none absolute inset-y-0 left-0 w-[90px]" style={{ background: "linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.14) 100%)" }} />
              )}
              {/* The shadow the turning leaf casts as it comes down. */}
              {turn && forward && (
                <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.35), rgba(0,0,0,0) 70%)", animation: `present-cast ${TURN_MS}ms ease-in-out both` }} />
              )}
            </div>
          </div>
        </div>

        {/* THE LEAF, only while a turn is on. Hinged on the spine. */}
        {turn && (
          <div
            className="absolute top-0"
            style={{
              left: forward ? PAGE_W : 0,
              width: PAGE_W,
              height: PAGE_H,
              transformStyle: "preserve-3d",
              transformOrigin: forward ? "0% 50%" : "100% 50%",
              transform: turn.going ? `rotateY(${forward ? -180 : 180}deg)` : "rotateY(0deg)",
              transition: `transform ${TURN_MS}ms ${TURN_EASE}`,
              zIndex: 5,
              /* NO filter here: a filter forces the leaf flat and the back
                 face never shows - the front came through mirrored (13 Sep
                 2026). The shadow is on each face instead. */
            }}
          >
            <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", borderRadius: forward ? "0 6px 6px 0" : "6px 0 0 6px", boxShadow: "0 30px 50px rgba(0,0,0,0.3)" }}>
              <Face deck={deck} pages={pages} n={forward ? rightOf(here) : (leftOf(here) as number)} />
              <div className="pointer-events-none absolute inset-0" style={{ background: forward ? "linear-gradient(to right, rgba(0,0,0,0.28), rgba(0,0,0,0.06) 35%, rgba(0,0,0,0) 60%)" : "linear-gradient(to left, rgba(0,0,0,0.28), rgba(0,0,0,0.06) 35%, rgba(0,0,0,0) 60%)", animation: `present-lift ${TURN_MS}ms ease-in-out both` }} />
            </div>
            <div className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: forward ? "6px 0 0 6px" : "0 6px 6px 0", boxShadow: "0 30px 50px rgba(0,0,0,0.3)" }}>
              <Face deck={deck} pages={pages} n={forward ? leftOf(here + 1) as number : rightOf(here - 1)} />
              <div className="pointer-events-none absolute inset-0" style={{ background: forward ? "linear-gradient(to left, rgba(0,0,0,0.26), rgba(0,0,0,0.06) 35%, rgba(0,0,0,0) 60%)" : "linear-gradient(to right, rgba(0,0,0,0.26), rgba(0,0,0,0.06) 35%, rgba(0,0,0,0) 60%)", animation: `present-settle ${TURN_MS}ms ease-in-out both` }} />
            </div>
          </div>
        )}

        {/* THE SPINE: the hairline, only when the book is open. */}
        {leftN != null && (
          <div className="pointer-events-none absolute top-0 z-[6]" style={{ left: PAGE_W - 0.5, width: 1, height: PAGE_H, background: "rgba(0,0,0,0.28)" }} />
        )}

        <style>{`
          @keyframes present-lift { 0% { opacity: 0 } 45% { opacity: 1 } 100% { opacity: 0.2 } }
          @keyframes present-settle { 0% { opacity: 1 } 55% { opacity: 0.8 } 100% { opacity: 0 } }
          @keyframes present-cast { 0% { opacity: 0 } 40% { opacity: 0.15 } 75% { opacity: 0.9 } 100% { opacity: 0 } }
        `}</style>

        {/* Tap a page to turn it; the cover to open it. */}
        <button type="button" aria-label="Previous page" disabled={!canBack} onClick={() => go(-1)} className="absolute left-0 top-0 z-[7] h-full w-[50%] cursor-w-resize disabled:cursor-default" style={{ background: "transparent" }} />
        <button type="button" aria-label="Next page" disabled={!canNext} onClick={() => go(1)} className="absolute right-0 top-0 z-[7] h-full w-[50%] cursor-e-resize disabled:cursor-default" style={{ background: "transparent" }} />
      </div>
    </div>
  );
}
