"use client";

import { useEffect, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";

/**
 * The property's photographs, full size, over the page.
 *
 * James, 7 Sep 2026: click a photo and it pops out; click through the set
 * from there. Arrow keys step, Escape closes, the strip at the bottom jumps.
 * Sits above the drawers (z-150) and closes on the backdrop.
 */
export default function PhotoLightbox({
  photos, start = 0, onClose, name = "photo",
}: {
  photos: string[];
  start?: number;
  onClose: () => void;
  /** The property, for the downloaded file's name: "5b Newton Road 3.jpg". */
  name?: string;
}) {
  const [at, setAt] = useState(start);
  const [shown, setShown] = useState(false);
  const count = photos.length;
  const step = (n: number) => setAt((i) => (i + n + count) % count);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, onClose]);

  if (!count) return null;

  return (
    <div className={`fixed inset-0 z-[150] flex flex-col bg-black/90 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="relative z-10 flex shrink-0 items-center justify-between px-5 py-4 text-white">
        <span className="text-[12.5px] font-medium">{at + 1} of {count}</span>
        <div className="flex items-center gap-2">
          {/* Download this photograph (James, 7 Sep): the OS fetches it from
              REX's CDN and hands it down under the property's name. */}
          <a
            href={`/api/photo/download?u=${encodeURIComponent(photos[at])}&name=${encodeURIComponent(`${name} ${at + 1}`)}`}
            aria-label="Download this photo"
            title="Download"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" />
            </svg>
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-[13px] transition-colors hover:bg-white/30">✕</button>
        </div>
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[at]} alt={`Photo ${at + 1}`} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => step(-1)} className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-[18px] text-white transition-colors hover:bg-white/30">‹</button>
            <button type="button" aria-label="Next photo" onClick={() => step(1)} className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-[18px] text-white transition-colors hover:bg-white/30">›</button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="relative z-10 flex shrink-0 justify-center gap-1.5 overflow-x-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
          {photos.map((p, i) => (
            <button
              key={p + i}
              type="button"
              onClick={() => setAt(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === at}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-opacity ${i === at ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              <PropertyPhoto src={p} className="h-full w-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
