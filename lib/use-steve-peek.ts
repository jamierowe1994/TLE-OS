"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether Steve, in his corner, is sitting on top of something that matters -
 * a button, a link, a field, a picture, or words - so he should roll off the
 * edge and just peek out (James, 25 Oct 2026: "When it's in the way, we should
 * almost have it be peeking out from the corner").
 *
 * Read from where he sits at home (offsetLeft/Top ignore the roll), at nine
 * points across him, every 700ms and on scroll. Once he's peeking he stays
 * out of the way until two looks in a row find the spot clear, so he doesn't
 * flicker on the edge of a card. Nothing he draws himself counts
 * ([data-steve-dock]).
 */

const IN_THE_WAY = "a,button,input,select,textarea,label,summary,img,video,canvas,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[contenteditable=true]";

function wordsAt(el: Element, x: number, y: number) {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    for (const b of Array.from(r.getClientRects())) {
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return true;
    }
  }
  return false;
}

function blocked(home: HTMLElement) {
  const w = home.offsetWidth;
  const h = home.offsetHeight;
  const left = home.offsetLeft;
  const top = home.offsetTop;
  for (const fx of [0.25, 0.5, 0.75]) {
    for (const fy of [0.25, 0.5, 0.75]) {
      const x = left + w * fx;
      const y = top + h * fy;
      const under = document.elementsFromPoint(x, y).find((e) => !e.closest("[data-steve-dock]"));
      if (!under) continue;
      if (under.closest(IN_THE_WAY)) return true;
      if (wordsAt(under, x, y)) return true;
    }
  }
  return false;
}

export function useStevePeek(home: RefObject<HTMLElement | null>, on: boolean): boolean {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!on) {
      setPeek(false);
      return;
    }
    let clear = 0;
    let queued = 0;
    const look = () => {
      queued = 0;
      const el = home.current;
      if (!el || document.hidden) return;
      if (blocked(el)) {
        clear = 0;
        setPeek(true);
      } else if (++clear >= 2) {
        setPeek(false);
      }
    };
    const soon = () => {
      if (!queued) queued = window.setTimeout(look, 160);
    };
    const t = window.setInterval(look, 700);
    window.addEventListener("scroll", soon, { capture: true, passive: true });
    window.addEventListener("resize", soon);
    look();
    return () => {
      window.clearInterval(t);
      window.clearTimeout(queued);
      window.removeEventListener("scroll", soon, { capture: true });
      window.removeEventListener("resize", soon);
    };
  }, [home, on]);
  return peek;
}
