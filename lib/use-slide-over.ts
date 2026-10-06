"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A drawer that leaves the way it came.
 *
 * Every record drawer (leads, listings, viewings, applications) slid in from
 * the right and then simply vanished: closing cleared the parent's state, the
 * drawer returned null, and the panel was gone in one frame. James, 2 Oct
 * 2026: they "should pull out like a drawer would, from the right-hand side
 * ... nicely animated, not jump in", and everything should feel seamless.
 *
 * `shown` drives the panel's data-shown (see .so-scrim / .so-panel in
 * globals.css). `close()` plays the panel out first and only then calls the
 * parent's onClose, so the record stays on screen while it slides away.
 * Opening flips `shown` two frames after mount - one frame can land in the
 * same paint as the mount, and then the sheet pops instead of sliding.
 *
 * `open` is whether there is a record to show. Stepping from one record to
 * the next keeps it true, so the panel stays put and only its contents change.
 * `which` is the record's id: a different record picked while the panel is
 * still sliding out (the board is clickable again by then) cancels the close
 * and brings the panel back with the new one, rather than closing it too.
 */
const OUT_MS = 300;

/**
 * The page behind stays still (James, 6 Oct 2026: "the background of the
 * listings page is still moving. If we scroll up and down, that shouldn't
 * happen when we have the listing page open").
 *
 * The document is locked for as long as any drawer is open - counted, so a
 * drawer opened from inside another does not unlock the page when it closes.
 * The scrollbar's width is put back as padding so the board behind does not
 * jump sideways the moment its scrollbar disappears.
 */
let locks = 0;
let saved: { overflow: string; padding: string } | null = null;
function lockPage() {
  if (typeof document === "undefined") return;
  if (locks++ > 0) return;
  const root = document.documentElement;
  const gap = window.innerWidth - root.clientWidth;
  saved = { overflow: root.style.overflow, padding: document.body.style.paddingRight };
  root.style.overflow = "hidden";
  if (gap > 0) document.body.style.paddingRight = `${gap}px`;
}
function unlockPage() {
  if (typeof document === "undefined" || locks === 0) return;
  if (--locks > 0) return;
  document.documentElement.style.overflow = saved?.overflow ?? "";
  document.body.style.paddingRight = saved?.padding ?? "";
  saved = null;
}

export function useSlideOver(open: boolean, onClose: () => void, which?: string | number | null) {
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const whichRef = useRef(which);
  whichRef.current = which;

  /* Another record arrived mid-exit: stay open, slide back in. */
  useEffect(() => {
    if (!leaving.current || !open) return;
    leaving.current = false;
    setShown(true);
  }, [which, open]);

  /* Locked from the moment there is a record until it is gone, the slide out included. */
  useEffect(() => {
    if (!open) return;
    lockPage();
    return unlockPage;
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    leaving.current = false;
    let id2 = 0;
    const id = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(id);
      cancelAnimationFrame(id2);
    };
  }, [open]);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    const leavingWith = whichRef.current;
    setShown(false);
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      /* Picked something else on the way out: that one stays open. */
      if (!leaving.current || whichRef.current !== leavingWith) return;
      closeRef.current();
      /* A parent that declined to close (a guard, an unsaved change) leaves
         the record open: bring the panel back rather than leave an invisible
         sheet over the screen swallowing every click. */
      window.setTimeout(() => {
        if (openRef.current) {
          leaving.current = false;
          setShown(true);
        }
      }, 60);
    }, still ? 0 : OUT_MS);
  }, []);

  return { shown, close };
}
