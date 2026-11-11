"use client";

import { useEffect, useState } from "react";

/**
 * The bar over the brochure on screen, never on paper (Erleta Vathej, ticket
 * 47b2389c; James, 10 Nov 2026). It opens the print dialog by itself once
 * every photo has loaded, or after eight seconds whatever has, so a slow
 * photo never prints as a blank square and a broken one never holds it up.
 */
export default function PrintBar({ count, auto, left }: { count: number; auto: boolean; left: { id: number; why: string }[] }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setReady(true);
      if (auto) window.setTimeout(() => window.print(), 150);
    };
    const imgs = [...document.querySelectorAll<HTMLImageElement>("img[data-br-photo]")];
    const waiting = imgs.filter((i) => !i.complete);
    if (!waiting.length) go();
    let n = waiting.length;
    const one = () => {
      n -= 1;
      if (n <= 0) go();
    };
    waiting.forEach((i) => {
      i.addEventListener("load", one, { once: true });
      i.addEventListener("error", one, { once: true });
    });
    const t = window.setTimeout(go, 8000);
    return () => window.clearTimeout(t);
  }, [auto]);

  return (
    <div className="br-bar" role="region" aria-label="Brochure">
      <div className="br-bar-text">
        <p className="br-bar-title">{count === 1 ? "Brochure" : `${count} Brochures`}</p>
        <p className="br-bar-sub">
          {ready ? "A4, one sheet each. No landlord details are on it." : "Loading the photos…"}
        </p>
        {left.length > 0 && (
          <p className="br-bar-left">
            {left.length === 1 ? "One home was left off" : `${left.length} homes were left off`}: {left.map((l) => l.why).filter((w, i, a) => a.indexOf(w) === i).join(" ")}
          </p>
        )}
      </div>
      <button type="button" className="br-btn br-btn--quiet" onClick={() => {
          /* Opened in its own tab from the listing or the Diary: close it, or
             go back where it came from if the browser won't. */
          window.close();
          window.setTimeout(() => (window.history.length > 1 ? window.history.back() : window.location.assign("/viewings")), 250);
        }}>
        Close
      </button>
      <button type="button" className="br-btn" disabled={!ready} onClick={() => window.print()}>
        {ready ? "Print" : <span className="br-spin" aria-label="Loading" />}
      </button>
    </div>
  );
}
