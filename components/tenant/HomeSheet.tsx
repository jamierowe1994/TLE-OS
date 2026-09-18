"use client";

import { useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import Sheet from "@/components/tenant/Sheet";

/**
 * "See home": the home they are after, or living in, in a bottom sheet -
 * every photo to swipe through and the facts - so the home page itself can
 * carry just a small round photo and the address (James, 18 Sep 2026: "strip
 * all of this down ... when they press See Home, it will use a bottom sheet
 * to pull up all of the details and all the photos").
 */
export default function HomeSheet({
  property,
  locality,
  photos,
  facts,
  href,
  className,
}: {
  property: string;
  locality: string;
  photos: string[];
  /** Label and value, in the order to read them. */
  facts: [string, string][];
  /** Its full page, when it has one. */
  href: string | null;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        See home
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label={property}
        footer={
          href ? (
            <Link href={href} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent-dark py-3.5 text-[14.5px] font-semibold text-white">
              The full listing <DoodleIcon name="trend-up" size={14} className="invert" />
            </Link>
          ) : undefined
        }
      >
        {/* The photos, a row to swipe. */}
        <div className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 [scrollbar-width:none]">
          {(photos.length ? photos : [""]).map((src, i) => (
            <PropertyPhoto key={src + i} src={src || null} alt="" className={`h-[210px] shrink-0 snap-start rounded-[16px] ${photos.length > 1 ? "w-[86%]" : "w-full"}`} />
          ))}
        </div>
        {photos.length > 1 && <p className="mt-2 text-[11.5px] text-muted">{photos.length} photos · swipe for more</p>}
        <h2 className="mt-4 text-[22px] font-bold leading-tight">{property}</h2>
        {locality && <p className="mt-0.5 text-[13px] text-muted">{locality}</p>}
        {facts.length > 0 && (
          <dl className="mt-4 divide-y divide-line/50 rounded-[16px] border border-line/60 px-4">
            {facts.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="text-right text-[14px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Sheet>
    </>
  );
}
