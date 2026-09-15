"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlideBody } from "@/components/PresentDeck";
import { CREAM } from "@/components/present-kit";
import type { PresentDeck as Deck, SlideId } from "@/lib/present";

/**
 * THE DECK ON A PHONE: one slide a screen, swiped.
 *
 * The booklet is a landscape SPREAD - two 1440x900 pages side by side, 2880
 * wide. Fitted into a 375px phone that is a 160px postcard; scaled to single
 * pages it is still only 234px tall with four-point type. Most landlords open
 * their presentation on a phone, so that is what most of them were handed.
 *
 * ── The slides were always able to do this ────────────────────────────────
 *
 * Every slide in PresentDeck has two layouts: a staged one at 1440x900 for
 * the booklet, and a fluid one with real breakpoints for everywhere else. The
 * booklet forces the staged one through StageForceCtx. This renders them with
 * NO force, so each slide measures the phone it is on and lays itself out at
 * a size a person can read. Nothing here restyles a slide; it only stops the
 * booklet insisting.
 *
 * ── Why a scroll-snap strip and not the page turn ─────────────────────────
 *
 * The booklet's substance is the turn - a sheet that bends, a crease, a
 * shadow following the corner - and none of it survives being one page wide.
 * A phone already has the better gesture. The strip is native scrolling, so
 * it has momentum and rubber-banding for free and no animation code at all.
 */
export default function PresentPages({
  deck,
  pages,
  onPage,
  onApi,
}: {
  deck: Deck;
  pages: SlideId[];
  /** Which slide they are on, 0-based, and how many there are. */
  onPage?: (at: number, of: number) => void;
  onApi?: (api: { go: (dir: 1 | -1) => void }) => void;
}) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const measure = () => setW(strip.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      const el = strip.current;
      if (!el || !w) return;
      el.scrollTo({ left: Math.max(0, Math.min(pages.length - 1, at + dir)) * w, behavior: "smooth" });
    },
    [at, w, pages.length]
  );
  useEffect(() => {
    onApi?.({ go });
  }, [go, onApi]);

  /* Which slide is under the eye, taken from the scroll position rather than
     from the tap - so a swipe, a fling and a button press all agree. */
  const onScroll = () => {
    const el = strip.current;
    if (!el || !w) return;
    const now = Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollLeft / w)));
    if (now !== at) setAt(now);
  };
  useEffect(() => {
    onPage?.(at, pages.length);
  }, [at, pages.length, onPage]);

  return (
    <div
      ref={strip}
      onScroll={onScroll}
      className="w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
      style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
      aria-label="Your presentation, one page at a time"
    >
      <div className="flex" style={{ width: w ? w * pages.length : "100%" }}>
        {pages.map((id, i) => (
          <section
            key={`${id}-${i}`}
            className="shrink-0 overflow-y-auto pb-5"
            style={{
              width: w || "100%",
              /**
               * ALL THE HEIGHT THERE IS, less the foot.
               *
               * It was min(74vh, 620px), which on an 812px phone left 41px of
               * dead screen above the slide and 41px below it, and squeezed
               * the slide into three quarters of a screen it could have had.
               * dvh rather than vh so the browser's own chrome is counted -
               * vh on iOS is the height WITHOUT the address bar, which is the
               * one measurement that is never on screen.
               */
              height: "calc(100dvh - 140px)",
              scrollSnapAlign: "start",
              background: CREAM,
            }}
            aria-label={`Page ${i + 1} of ${pages.length}`}
          >
            {/* Only what is on screen and its neighbours: twenty-eight full
                slides at once is a lot of DOM for a phone, and the ones out of
                view are still measured for their own layout. */}
            {Math.abs(i - at) <= 1 ? <SlideBody id={id} deck={deck} show /> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
