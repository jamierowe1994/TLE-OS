"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogle } from "@/components/MarketMap";

/**
 * The property's front door, from the street.
 *
 * James, 11 Sep 2026: "the coordinates: it'll have a drop pin. We're
 * literally looking at the property door on Google Maps... they can swipe
 * around and see the street." So: Street View, opened on the nearest outdoor
 * panorama within 60m, turned to face the property's own coordinates rather
 * than whichever way the car was driving. It is the real thing, so the agent
 * can drag round and walk the street.
 *
 * Three honest fallbacks, in order: no key on this environment, no panorama
 * near enough (a new estate, a private road), or the script failing to load.
 * Each falls back to the static map tile the caller passes in, so the box is
 * never empty and never a grey Google error.
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/* Compass bearing from the camera to the house. Worked out here rather than
   with Google's geometry library, which the shared loader does not fetch -
   and this is one formula, not a reason to load another. */
function headingTo(from: google.maps.LatLng, to: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const φ1 = from.lat() * rad, φ2 = to.lat * rad, Δλ = (to.lon - from.lng()) * rad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

export default function StreetView({
  point,
  fallback,
  caption,
}: {
  point: { lat: number; lon: number };
  /** What to show when Street View cannot: the static tile, as before. */
  fallback: React.ReactNode;
  caption?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">(KEY ? "loading" : "none");

  useEffect(() => {
    if (!KEY) return;
    let gone = false;
    loadGoogle()
      .then(() => {
        if (gone || !holder.current) return;
        const svc = new google.maps.StreetViewService();
        const here = new google.maps.LatLng(point.lat, point.lon);
        svc.getPanorama(
          { location: here, radius: 60, source: google.maps.StreetViewSource.OUTDOOR },
          (data, status) => {
            if (gone || !holder.current) return;
            if (status !== google.maps.StreetViewStatus.OK || !data?.location?.latLng || !data.location.pano) {
              setState("none");
              return;
            }
            /* Face the house, not the road ahead: heading from where the
               camera stood to where the property is. */
            const heading = headingTo(data.location.latLng, point);
            new google.maps.StreetViewPanorama(holder.current, {
              pano: data.location.pano,
              pov: { heading, pitch: 0 },
              zoom: 0.6,
              addressControl: false,
              fullscreenControl: false,
              motionTracking: false,
              motionTrackingControl: false,
              showRoadLabels: false,
              linksControl: true,
              panControl: false,
              zoomControl: false,
              enableCloseButton: false,
            });
            setState("ready");
          }
        );
      })
      .catch(() => !gone && setState("none"));
    return () => {
      gone = true;
    };
  }, [point.lat, point.lon]);

  if (state === "none") return <>{fallback}</>;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/70 bg-box">
      <div ref={holder} className="aspect-[16/9] w-full" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted">Finding the street&hellip;</div>
      )}
      {caption && state === "ready" && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-page/95 px-2.5 py-1 text-[11px] shadow-sm">{caption}</span>
      )}
    </div>
  );
}
