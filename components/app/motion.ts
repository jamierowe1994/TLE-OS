"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The app's movement helpers (James, 3 Oct 2026: "everything feels like
 * real-world physics ... nothing should ever jerk into the next page"). The
 * keyframes live in app/agent/m.css.
 */

/** A sheet that drops away before it is gone: `close` plays m-sheet-out, then calls onClose. */
export function useSheetExit(onClose: () => void, ms = 290) {
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const close = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    window.setTimeout(onClose, ms);
  }, [onClose, ms]);
  return { closing, close };
}

/** A press that bounces: shrink, overshoot, settle - then `after`. */
export function bounce(el: Element | null, after?: () => void, ms = 340) {
  if (!el || typeof (el as HTMLElement).animate !== "function") {
    after?.();
    return;
  }
  (el as HTMLElement).animate(
    [{ transform: "scale(1)" }, { transform: "scale(0.9)", offset: 0.3 }, { transform: "scale(1.06)", offset: 0.68 }, { transform: "scale(1)" }],
    { duration: ms, easing: "cubic-bezier(0.3, 0.9, 0.3, 1)" }
  );
  if (after) window.setTimeout(after, ms * 0.8);
}

/** Reduced motion asked for on this phone. */
export const calm = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * THE EXPAND (James: "when we click them, it should feel like it's expanding
 * out and then loads in the next page"). A link marked `data-morph` grows,
 * in its own colour and corners, from where it sits to the whole screen; the
 * next page is asked for as it lands, and the colour melts away once the page
 * has changed. Mounted once, in the app frame.
 */
export function useMorph(path: string, go: (href: string) => void) {
  const layer = useRef<HTMLDivElement | null>(null);

  /* The page has changed: let the colour go. */
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    layer.current = null;
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 340, easing: "ease-out", fill: "forwards" }).onfinish = () => el.remove();
  }, [path]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[data-morph]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      e.preventDefault();
      if (calm()) return go(href);

      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const bg = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "var(--m-card)";
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed",
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        borderRadius: cs.borderRadius || "22px",
        background: bg,
        zIndex: "65",
        pointerEvents: "none",
        boxShadow: "0 30px 60px -20px rgba(60,30,20,0.35)",
      });
      document.querySelector(".m-app")?.appendChild(el);
      layer.current?.remove();
      layer.current = el;

      /* A small press first, then out to the edges with a little overshoot. */
      a.animate([{ transform: "scale(1)" }, { transform: "scale(0.95)" }, { transform: "scale(1)" }], { duration: 200, easing: "ease-out" });
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const grow = el.animate(
        [
          { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius || "22px", transform: "scale(0.96)" },
          { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius || "22px", transform: "scale(0.96)", offset: 0.15 },
          { left: "-6px", top: "-6px", width: `${vw + 12}px`, height: `${vh + 12}px`, borderRadius: "34px", transform: "scale(1)", offset: 0.82 },
          { left: "0px", top: "0px", width: `${vw}px`, height: `${vh}px`, borderRadius: "0px", transform: "scale(1)" },
        ],
        { duration: 520, easing: "cubic-bezier(0.65, 0, 0.3, 1)", fill: "forwards" }
      );
      window.setTimeout(() => go(href), 380);
      grow.onfinish = () => {
        /* Belt and braces: never leave a colour over the screen. */
        window.setTimeout(() => {
          if (layer.current === el) {
            layer.current = null;
            el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = () => el.remove();
          }
        }, 1800);
      };
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [go]);
}
