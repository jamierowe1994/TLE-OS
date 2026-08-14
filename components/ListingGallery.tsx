"use client";

import { useEffect, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";

/**
 * Every photo on a property, not just the first one.
 *
 * The OS looked for a long time like REX only gave us one image per listing.
 * It never did — we asked for the whole set, counted it for the "13 photos"
 * chip, and then kept the first and dropped the rest. Live listings carry
 * twenty and thirty of them.
 *
 * ── Why it is shaped like this ──────────────────────────────────────────────
 *
 * The big frame STRETCHES to whatever is beside it rather than owning a fixed
 * height. On a property card the photograph is the identity of the record, and
 * it was finishing less than half way down a block that ran past the landlord
 * details — which made the property the smallest thing on its own card.
 *
 * The strip underneath is a strip, not a grid: thirty thumbnails in a grid
 * would be the tallest thing in the drawer and would push the actual work off
 * the screen. One row that scrolls sideways keeps the whole set reachable and
 * costs one line of height.
 *
 * Arrow keys work while the frame has focus, because someone flicking through
 * a set of thirty should not have to aim at a 44px target thirty times.
 */
export default function ListingGallery({
  photos,
  className = "",
}: {
  photos: string[];
  className?: string;
}) {
  const [at, setAt] = useState(0);

  /* A different property in the same drawer is a different set — without this
     the third photo of the last house shows for a moment on the next one. */
  useEffect(() => {
    setAt(0);
  }, [photos]);

  const count = photos.length;
  const step = (n: number) => setAt((i) => (i + n + count) % count);

  if (count === 0) {
    return <PropertyPhoto src={null} className={`${className} min-h-[220px] rounded-2xl`} />;
  }

  return (
    <div className={`flex shrink-0 flex-col gap-2 ${className}`}>
      <div
        tabIndex={count > 1 ? 0 : -1}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        }}
        className="group relative min-h-[220px] flex-1 overflow-hidden rounded-2xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        <PropertyPhoto src={photos[at]} className="h-full w-full" />

        {count > 1 && (
          <>
            {/* Only on hover or focus. A property card at rest should be the
                photograph, not a set of controls sitting on top of it. */}
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => step(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2.5 py-1.5 text-[13px] leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => step(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2.5 py-1.5 text-[13px] leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              ›
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2.5 py-1 text-[10.5px] font-medium text-white">
              {at + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {photos.map((p, i) => (
            <button
              key={p + i}
              type="button"
              onClick={() => setAt(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === at}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                i === at ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <PropertyPhoto src={p} className="h-full w-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
