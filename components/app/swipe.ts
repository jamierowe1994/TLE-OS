"use client";

import { useEffect } from "react";

/**
 * Swipe a sheet down to close it (James, 3 Oct 2026: "if I do a long swipe
 * down, it should pull down the tab ... the same for any pull-up tab").
 *
 * The sheet follows the finger from the moment it is pulled down while its
 * own content is at the top (so a list inside still scrolls normally), the
 * dim lightens with it, and on release it closes if it went past a quarter
 * of its height or was flicked; otherwise it springs back. Transform only.
 */
export function useSwipeToClose(panel: React.RefObject<HTMLElement | null>, dim: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    let armed = false;

    /* The dim is the sheet's parent, so it is its colour that lightens, never
       its opacity - that would fade the sheet too. */
    const shade = (y: number) => `rgba(40, 28, 25, ${(0.4 * Math.max(0, 1 - y / (el.offsetHeight || 600))).toFixed(3)})`;
    const set = (y: number, animate: boolean) => {
      el.style.transition = animate ? "transform 320ms cubic-bezier(0.32, 1.32, 0.52, 1)" : "none";
      el.style.transform = y ? `translateY(${y}px)` : "";
      if (dim.current) {
        dim.current.style.transition = animate ? "background-color 320ms ease-out" : "none";
        dim.current.style.backgroundColor = y ? shade(y) : "";
      }
    };

    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]!.clientY;
      startT = Date.now();
      dy = 0;
      dragging = false;
      /* Only a sheet already scrolled to its top may be pulled away. */
      armed = el.scrollTop <= 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const d = e.touches[0]!.clientY - startY;
      if (!dragging && d < 6) {
        if (d < -4) armed = false;
        return;
      }
      if (!dragging) {
        /* The opening animation holds the transform; let go of it first. */
        el.style.animation = "none";
        if (dim.current) dim.current.style.animation = "none";
      }
      dragging = true;
      dy = Math.max(0, d);
      e.preventDefault();
      set(dy, false);
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      const ms = Math.max(1, Date.now() - startT);
      const flick = dy / ms > 0.6 && dy > 40;
      if (dy > el.offsetHeight * 0.25 || flick) {
        el.style.transition = "transform 220ms cubic-bezier(0.4, 0, 1, 1)";
        el.style.transform = "translateY(105%)";
        if (dim.current) {
          dim.current.style.transition = "background-color 220ms ease-in";
          dim.current.style.backgroundColor = "rgba(40, 28, 25, 0)";
        }
        window.setTimeout(onClose, 200);
      } else {
        set(0, true);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [panel, dim, onClose]);
}
