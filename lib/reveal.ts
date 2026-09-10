"use client";

import { createContext, useContext, useEffect, useRef } from "react";

/**
 * "Not yet" — how a tile knows to wait for its own figures.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 *
 * The dashboard's rows are meant to rise into the screen one after another.
 * Every tile fetches its own numbers, and they land at different times, so a
 * plain stagger animates in four skeletons reading "asking REX" and then pops
 * them full a second later. The movement lands before the content it was
 * announcing, which is worse than no movement at all (James, 10 Sep 2026).
 *
 * ── How it works ──────────────────────────────────────────────────────────
 *
 * A tile provides this context. Anything inside it that is waiting on data
 * calls `useReportReady(false)` and the tile holds; when the same call goes
 * true the hold is released, and once every hold is released the tile rises.
 *
 * A tile whose contents never report holds nothing and rises straight away,
 * which is the right answer for anything static. Nothing has to opt in.
 *
 * The reporting lives in the shared fetch hooks rather than in each widget,
 * so a widget gets this by using the data hook it was already using.
 */
export interface RevealHold {
  add: () => void;
  done: () => void;
}

export const RevealCtx = createContext<RevealHold | null>(null);

/**
 * Hold the surrounding tile while `ready` is false.
 *
 * Safe outside a tile: with no provider it does nothing at all, so a hook
 * that calls it works the same on a page that never reveals anything.
 */
export function useReportReady(ready: boolean): void {
  const ctx = useContext(RevealCtx);
  const holding = useRef(false);

  useEffect(() => {
    if (!ctx) return;
    if (!ready && !holding.current) {
      holding.current = true;
      ctx.add();
    } else if (ready && holding.current) {
      holding.current = false;
      ctx.done();
    }
  }, [ctx, ready]);

  /* Released on unmount too. A widget that is dragged away mid-fetch would
     otherwise hold its tile shut for ever. */
  useEffect(
    () => () => {
      if (holding.current) {
        holding.current = false;
        ctx?.done();
      }
    },
    [ctx]
  );
}
