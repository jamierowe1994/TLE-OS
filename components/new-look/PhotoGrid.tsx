"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ico } from "@/components/new-look/Parts";

/**
 * The photos in the new look (Claude Design, 23 Oct 2026). Pressing the hero
 * blurs the page, the front photo lifts into the top corner of a grid and the
 * rest fan out from under it. Press any one to swipe through them with the
 * arrows, the keys or the thumbnails; "All photos" goes back to the grid.
 *
 * James: "That's the whole point of the tiles: to share the rest of the tiles."
 *
 * `origin` is the hero's box on screen when it was pressed, so the first tile
 * grows out of exactly where the photo was. Downloads go through the same
 * /api/photo/download as the old lightbox, under the property's name.
 */

const reduce = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const downloadHref = (src: string, name: string, i: number) => `/api/photo/download?u=${encodeURIComponent(src)}&name=${encodeURIComponent(`${name} ${i + 1}`)}`;

export default function PhotoGrid({
  photos,
  name,
  origin,
  start = -1,
  onClose,
}: {
  photos: string[];
  name: string;
  origin: DOMRect | null;
  /** Open straight on one photo rather than the grid. */
  start?: number;
  onClose: () => void;
}) {
  const [at, setAt] = useState(start);
  const [closing, setClosing] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const n = photos.length;

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, reduce() ? 0 : 340);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  /* The fan: every tile starts where the hero was - the first at the hero's
     size, the rest small and hidden under it - then flies to its place. */
  useLayoutEffect(() => {
    const g = grid.current;
    if (!origin || !g || reduce() || start >= 0) return;
    const tiles = Array.from(g.querySelectorAll<HTMLElement>(".nl-lb-tile"));
    const ox = origin.left + origin.width / 2;
    const oy = origin.top + origin.height / 2;
    tiles.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.style.transition = "none";
      el.style.transform = `translate(${ox - r.left - r.width / 2}px, ${oy - r.top - r.height / 2}px) scale(${i === 0 ? origin.width / r.width : 0.38})`;
      el.style.opacity = i === 0 ? "1" : "0";
      el.style.zIndex = i === 0 ? "3" : "1";
    });
    void g.offsetHeight;
    let done: number | undefined;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        tiles.forEach((el, i) => {
          const d = i === 0 ? 0 : 200 + Math.min(i, 24) * 38;
          el.style.transition = `transform .8s cubic-bezier(.2,.8,.2,1) ${d}ms, opacity .5s ease ${d}ms`;
          el.style.transform = "";
          el.style.opacity = "";
        });
        done = window.setTimeout(() => tiles.forEach((el) => { el.style.transition = ""; el.style.zIndex = ""; }), 1800);
      })
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (atRef.current >= 0) setAt(-1);
      else closeRef.current();
    };
    document.addEventListener("keydown", key);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = was;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-look="new" className={`nl-lb${closing ? " is-closing" : ""}${at >= 0 ? " is-viewing" : ""}`} role="dialog" aria-modal="true" aria-label={`${name} photos`}>
      <div className="nl-lb-scrim" onClick={close} />
      <div className="nl-lb-top">
        <div className="min-w-0">
          <b>{name}</b>
          <span>{n} {n === 1 ? "photo" : "photos"}</span>
        </div>
        <div className="flex items-center gap-2">
          {n > 1 && (
            <button
              type="button"
              className="nl-lb-pill"
              onClick={() =>
                photos.forEach((p, i) =>
                  window.setTimeout(() => {
                    const a = document.createElement("a");
                    a.href = downloadHref(p, name, i);
                    a.download = "";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }, i * 350)
                )
              }
            >
              Download all {n}
            </button>
          )}
          <button type="button" className="nl-lb-x" aria-label="Close photos" onClick={close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>
      <div className="nl-lb-body" onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="nl-lb-grid" ref={grid}>
          {photos.map((src, i) => (
            <button key={src + i} type="button" className="nl-lb-tile" onClick={() => setAt(i)} aria-label={`Open photo ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading={i < 8 ? "eager" : "lazy"} decoding="async" />
              <span className="nl-lb-cap">Photo {i + 1}</span>
            </button>
          ))}
        </div>
      </div>
      {at >= 0 && <Viewer photos={photos} name={name} start={at} onBack={() => (start >= 0 ? close() : setAt(-1))} />}
    </div>,
    document.body
  );
}

function Viewer({ photos, name, start, onBack }: { photos: string[]; name: string; start: number; onBack: () => void }) {
  const [i, setI] = useState(start);
  const track = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const n = photos.length;

  useLayoutEffect(() => {
    const t = track.current;
    if (t) t.scrollLeft = start * t.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const b = thumbs.current?.children[i] as HTMLElement | undefined;
    b?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: reduce() ? "auto" : "smooth" });
  }, [i]);
  const go = (k: number) => {
    const to = Math.max(0, Math.min(n - 1, k));
    const t = track.current;
    t?.scrollTo({ left: to * t.clientWidth, behavior: reduce() ? "auto" : "smooth" });
    setI(to);
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goRef.current(i + 1);
      else if (e.key === "ArrowLeft") goRef.current(i - 1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [i]);

  return (
    <div className="nl-lb-viewer">
      <div
        className="nl-lb-track"
        ref={track}
        onScroll={(e) => {
          const t = e.currentTarget;
          const k = Math.round(t.scrollLeft / t.clientWidth);
          if (k !== i) setI(k);
        }}
      >
        {photos.map((src, k) => (
          <div key={src + k} className="nl-lb-slide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Photo ${k + 1} of ${n}`} loading={Math.abs(k - start) < 3 ? "eager" : "lazy"} decoding="async" />
          </div>
        ))}
      </div>
      <button type="button" className="nl-lb-nav prev" disabled={i === 0} aria-label="Previous photo" onClick={() => go(i - 1)}>
        <Ico name="back" size={20} />
      </button>
      <button type="button" className="nl-lb-nav next" disabled={i === n - 1} aria-label="Next photo" onClick={() => go(i + 1)}>
        <Ico name="arrow" size={20} />
      </button>
      <div className="nl-lb-foot">
        <button type="button" className="nl-lb-pill" onClick={onBack}>
          <Ico name="grid" size={14} /> All photos
        </button>
        <span className="nl-lb-count">
          {i + 1} of {n}
        </span>
        <a className="nl-lb-pill" href={downloadHref(photos[i], name, i)} aria-label="Download this photo">
          <Ico name="download" size={14} /> Download
        </a>
        <div className="nl-lb-thumbs" ref={thumbs}>
          {photos.map((src, k) => (
            <button key={src + k} type="button" className={`nl-lb-thumb${k === i ? " is-on" : ""}`} aria-label={`Photo ${k + 1}`} onClick={() => go(k)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
