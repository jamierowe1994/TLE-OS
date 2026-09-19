"use client";

import { useEffect, useRef, useState } from "react";
import PresentDeck from "@/components/PresentDeck";
import type { PresentDeck as Deck } from "@/lib/present";

/**
 * Every slide of a deck as one printed page (app/present/[token]/print).
 *
 * Each slide is its own one-slide deck, embedded, in a 1280 x 800 page - the
 * size the deck is designed at, so type and spacing are the landlord's. A
 * slide taller than that (the service table, the fees) is shrunk to fit its
 * page rather than cut off or split across two. Each page is strictly
 * contained, which keeps the deck's fixed logo and chapter bar on their own
 * page, and clips the decorative shapes that run off a slide's edge - left
 * loose, Chrome counted them and shrank every page to fit them.
 *
 * The print dialog opens by itself once every photograph has loaded, or
 * after ten seconds whatever has - a PDF with a grey box where a photo
 * should be is still a PDF, and a page that waits for ever is not.
 */

const W = 1280;
const H = 800;

type Slide = Parameters<typeof PresentDeck>[0]["slides"][number];

export default function PrintDeck({ deck, slides, name }: { deck: Deck; slides: Slide[]; name: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    document.title = name;
  }, [name]);

  /* Fit, then wait for the photographs, then print. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let gone = false;
    const fit = () => {
      el.querySelectorAll<HTMLElement>("[data-print-page]").forEach((page) => {
        const cell = page.querySelector<HTMLElement>("[data-index]");
        const inner = page.querySelector<HTMLElement>("[data-print-inner]");
        if (!cell || !inner) return;
        inner.style.height = `${H}px`;
        inner.style.transform = "";
        const tall = cell.scrollHeight;
        if (tall > H + 2) {
          const k = H / tall;
          inner.style.height = `${tall}px`;
          inner.style.transform = `scale(${k})`;
        }
      });
    };
    const settle = async () => {
      await new Promise((r) => setTimeout(r, 600));
      const imgs = [...el.querySelectorAll("img")];
      await Promise.race([
        Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))),
        new Promise((r) => setTimeout(r, 10_000)),
      ]);
      if (gone) return;
      fit();
      setReady(true);
    };
    void settle();
    return () => {
      gone = true;
    };
  }, [deck]);

  useEffect(() => {
    if (!ready || asked.current) return;
    asked.current = true;
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, [ready]);

  return (
    <div ref={root} className="print-deck">
      <style>{`
        @page { size: ${W}px ${H}px; margin: 0; }
        html, body { background: #e9e4e1; }
        .print-deck { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-bar { position: sticky; top: 0; z-index: 50; }
        [data-print-page] { width: ${W}px; height: ${H}px; margin: 24px auto; overflow: hidden; position: relative; background: #fff; transform: translateZ(0); contain: strict; clip-path: inset(0); box-shadow: 0 10px 30px -18px rgba(40,25,20,.5); }
        [data-print-inner] { width: ${W}px; height: ${H}px; transform-origin: top center; }
        [data-print-page] [data-index] { overflow: visible !important; }
        @media print {
          html, body { background: #fff; margin: 0; overflow: hidden; }
          .print-bar { display: none; }
          [data-print-page] { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
          [data-print-page]:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="print-bar flex flex-wrap items-center justify-between gap-3 border-b border-line/60 bg-white px-6 py-3">
        <p className="text-[13px]">
          <span className="font-semibold">{name}</span>
          <span className="ml-2 text-muted">
            {ready ? `${slides.length} pages - choose Save as PDF in the print window.` : "Laying out the pages and loading the photographs…"}
          </span>
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          Save as PDF
        </button>
      </div>
      {slides.map((s) => (
        <div key={s.id} data-print-page>
          <div data-print-inner>
            <PresentDeck token="print" deck={deck} slides={[s]} embedded />
          </div>
        </div>
      ))}
    </div>
  );
}
