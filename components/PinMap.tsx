"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogle } from "@/components/MarketMap";

/** One pin on a small map: where the property is. */
export default function PinMap({ lat, lng, className = "" }: { lat: number; lng: number; className?: string }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGoogle()
      .then(async () => {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (!live || !holder.current) return;
        const g = (window as unknown as { google?: typeof google }).google;
        if (!g) return;
        const map = new g.maps.Map(holder.current, { center: { lat, lng }, zoom: 15, disableDefaultUI: true, gestureHandling: "none" });
        new g.maps.Marker({ position: { lat, lng }, map });
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [lat, lng]);
  if (failed) return <div className={`flex items-center justify-center rounded-2xl bg-panel text-[11px] text-muted ${className}`}>Map unavailable here</div>;
  return <div ref={holder} className={`overflow-hidden rounded-2xl ${className}`} />;
}
