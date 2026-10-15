"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * EACH SLIDE IS DRAWN IN ITS OWN FRAME (15 Oct 2026, Tiffany's 126%). While
 * printing, Chrome lays a page out at the PAPER's width divided by the scale
 * in the print window - not the 1280 the slide asks for. On A4 at 126% that
 * is under 640px, so the slides' own breakpoints dropped them to their
 * stacked phone layout, taller than the page, and a fixed 1280 x 800 box was
 * then cut off on the right and split across two sheets. Inside a 1280 x 800
 * frame the slide always lays out at 1280, whatever the paper or the scale,
 * and the print CSS scales the frame to fill the sheet. So the PDF is the
 * deck as it looks on a laptop, one slide a page, at 100% or anything else.
 *
 * The print dialog opens by itself once every photograph has loaded, or
 * after ten seconds whatever has - a PDF with a grey box where a photo
 * should be is still a PDF, and a page that waits for ever is not.
 */

const W = 1280;
const H = 800;

type Slide = Parameters<typeof PresentDeck>[0]["slides"][number];

/* What app/present/layout.tsx wraps every deck in - the frame sits outside it. */
const PRESENT_CLASS =
  "bg-white text-[#16181d] antialiased [&_h1]:font-[inherit] [&_h2]:font-[inherit] [&_h3]:font-[inherit]";

const FRAME_CSS = `
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-print-inner] { width: ${W}px; height: ${H}px; transform-origin: top center; }
  [data-index] { overflow: visible !important; }
`;

/** Copy the page's stylesheets (and the font variables on <html>) into a frame. */
function dressFrame(doc: Document) {
  doc.open();
  doc.write("<!doctype html><html><head></head><body></body></html>");
  doc.close();
  doc.documentElement.className = document.documentElement.className;
  doc.body.className = document.body.className;
  document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => doc.head.appendChild(n.cloneNode(true)));
  const own = doc.createElement("style");
  own.textContent = FRAME_CSS;
  doc.head.appendChild(own);
}

function SlideFrame({ children }: { children: React.ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    dressFrame(doc);
    setBody(doc.body);
    /* Stylesheets that arrive after the frame was dressed (a lazily loaded
       chunk, a dev reload) follow it in. */
    const mo = new MutationObserver((records) => {
      for (const r of records)
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLStyleElement || (n instanceof HTMLLinkElement && n.rel === "stylesheet")) doc.head.appendChild(n.cloneNode(true));
        });
    });
    mo.observe(document.head, { childList: true });
    return () => mo.disconnect();
  }, []);

  return (
    <iframe ref={frame} title="Slide" tabIndex={-1} aria-hidden data-print-frame style={{ width: W, height: H, border: 0, display: "block" }}>
      {body && createPortal(children, body)}
    </iframe>
  );
}

export default function PrintDeck({ deck, slides, name }: { deck: Deck; slides: Slide[]; name: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    document.title = name;
  }, [name]);

  /* Fit, then wait for the photographs and the type, then print. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let gone = false;
    const docs = () =>
      [...el.querySelectorAll<HTMLIFrameElement>("[data-print-frame]")]
        .map((f) => f.contentDocument)
        .filter((d): d is Document => !!d);
    const fit = () => {
      docs().forEach((doc) => {
        const cell = doc.querySelector<HTMLElement>("[data-index]");
        const inner = doc.querySelector<HTMLElement>("[data-print-inner]");
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
      /* Every frame has its slide in it before anything is measured. */
      for (let i = 0; i < 25 && docs().some((d) => !d.querySelector("[data-index]")); i++) {
        await new Promise((r) => setTimeout(r, 200));
      }
      const loaded = Promise.all(
        docs().map(async (doc) => {
          await Promise.all(
            [...doc.querySelectorAll("img")].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))),
          );
          await doc.fonts?.ready;
        }),
      );
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 10_000))]);
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
        @media print {
          html, body { background: #fff; margin: 0; overflow: hidden; }
          .print-bar { display: none; }
          [data-print-page] { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
          [data-print-page]:last-child { break-after: auto; page-break-after: auto; }
          /* The sheet the print window lays out is the paper over the scale,
             not 1280 x 800. In print 100vw x 100vh is that sheet, so the
             frame is scaled to fill it and centred. Browsers that cannot
             divide one length by another keep the fixed page. */
          @supports (scale: min(100vw / 1px, 100vh / 1px)) {
            [data-print-page] { width: 100vw; height: 100vh; --fit: min(100vw / ${W}px, 100vh / ${H}px); }
            [data-print-fit] { position: absolute; left: calc((100vw - ${W}px * var(--fit)) / 2); top: calc((100vh - ${H}px * var(--fit)) / 2); width: ${W}px; height: ${H}px; scale: var(--fit); transform-origin: 0 0; }
          }
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
          <div data-print-fit>
            <SlideFrame>
              <div className={PRESENT_CLASS} style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}>
                <div data-print-inner>
                  <PresentDeck token="print" deck={deck} slides={[s]} embedded />
                </div>
              </div>
            </SlideFrame>
          </div>
        </div>
      ))}
    </div>
  );
}
