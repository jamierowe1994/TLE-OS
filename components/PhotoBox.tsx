"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The place a property photo goes.
 *
 * A thin outlined box with a drawing in it, so an empty record still looks
 * composed rather than broken. Click it, or drop a file on it, or use the
 * upload button that appears on hover.
 *
 * IMPORTANT: nothing is stored. The preview is an object URL living in this
 * browser tab, and it is gone on refresh — photos need a bucket before this
 * means anything, and the box says so rather than implying an upload happened.
 */

export default function PhotoBox({
  className = "",
  label = "Add a photo",
}: {
  className?: string;
  label?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Object URLs are a leak if you drop them on the floor.
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  function take(files: FileList | null) {
    const f = files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    setSrc((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  return (
    <div className={className}>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={`group relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-colors ${
          over ? "border-accent-dark bg-accent-soft/40" : "border-dashed border-line hover:border-ink/40"
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/notioly/moving.svg"
              alt=""
              aria-hidden
              className="art h-14 w-14 opacity-45"
            />
            <span className="text-[10.5px] text-muted">{over ? "Drop it" : label}</span>
          </div>
        )}

        {/* The upload affordance, only while pointing at it. */}
        <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line/80 bg-page text-muted opacity-0 transition-opacity group-hover:opacity-100">
          <DoodleIcon name="upload" size={13} />
        </span>

        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => take(e.target.files)}
        />
      </div>
      {src && (
        <p className="mt-1.5 text-[10px] leading-tight text-muted">
          Preview only — held in this tab. Photos need the R2 bucket before they can reach REX.
        </p>
      )}
    </div>
  );
}
