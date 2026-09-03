"use client";

import { useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";

/**
 * The picture of the property in the details panel.
 *
 * Before take-on we have no photograph of the house. Google's Street View
 * has one for most addresses, and a landlord recognises their own front
 * door instantly - so with coordinates and the key, that stands in, and the
 * real photograph replaces it the day take-on happens. No key, no coverage,
 * or the image failing to load, and it falls back to the drawing the OS
 * uses for a property with no picture, rather than a broken image.
 */
export default function PropertyHero({
  image,
  lat,
  lng,
  className = "",
}: {
  image: string | null;
  lat: number | null;
  lng: number | null;
  className?: string;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const street =
    !image && key && lat != null && lng != null
      ? `https://maps.googleapis.com/maps/api/streetview?size=900x560&location=${lat},${lng}&fov=80&pitch=5&key=${encodeURIComponent(key)}`
      : null;
  const [streetFailed, setStreetFailed] = useState(false);

  if (image) return <PropertyPhoto src={image} alt="" className={className} />;
  if (street && !streetFailed) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={street} alt="" className={className} onError={() => setStreetFailed(true)} />
        <span className="absolute bottom-2 right-3 rounded-full bg-white/85 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted">
          Street view
        </span>
      </div>
    );
  }
  return <PropertyPhoto src={null} alt="" className={className} />;
}
