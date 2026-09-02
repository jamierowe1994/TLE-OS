"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogle } from "@/components/MarketMap";

/**
 * The property on a map - greyscale, quiet, one pin - with the address card
 * laid over the bottom-left corner the way the reference does it.
 *
 * Without a key, or without a location, the same panel draws a light wash
 * with the address card on it, so the layout holds and nothing looks broken.
 */
export default function PropertyMap({
  lat,
  lng,
  address,
  postcode,
  line,
}: {
  lat: number | null;
  lng: number | null;
  address: string;
  postcode: string;
  /** The small line under the address on the card: "Valued 31 August". */
  line?: string;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const canMap = lat != null && lng != null && Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    if (!canMap) return;
    let dead = false;
    loadGoogle()
      .then(() => {
        if (dead || !holder.current) return;
        const map = new google.maps.Map(holder.current, {
          center: { lat: lat as number, lng: lng as number },
          zoom: 15,
          disableDefaultUI: true,
          scrollwheel: false,
          gestureHandling: "cooperative",
          clickableIcons: false,
          keyboardShortcuts: false,
          styles: [
            { elementType: "geometry", stylers: [{ saturation: -100 }, { lightness: 35 }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
            { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
            { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f4f4f2" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#e6e6e4" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#dadad6" }, { weight: 0.6 }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#eeeeeb" }] },
          ],
        });
        new google.maps.Marker({
          map,
          position: { lat: lat as number, lng: lng as number },
          icon: {
            url:
              "data:image/svg+xml;utf8," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#101014"/><circle cx="17" cy="17" r="5.5" fill="#ffffff"/></svg>'
              ),
            scaledSize: new google.maps.Size(34, 34),
            anchor: new google.maps.Point(17, 17),
          },
        });
        setReady(true);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMap, lat, lng]);

  const showMap = canMap && !failed;

  return (
    <div className="relative h-full min-h-[280px] overflow-hidden rounded-2xl bg-[#f4f4f2]">
      {showMap ? (
        <div ref={holder} className={`absolute inset-0 transition-opacity ${ready ? "opacity-100" : "opacity-0"}`} />
      ) : (
        /* A quiet wash with a faint grid: the shape of a map, honestly not one. */
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(#e9e9e6 1px, transparent 1px), linear-gradient(90deg, #e9e9e6 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          <span className="absolute left-1/2 top-[38%] flex h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink">
            <span className="h-[11px] w-[11px] rounded-full bg-white" />
          </span>
        </div>
      )}
      <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-ink p-4 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)]">
        <p className="text-[14px] font-semibold leading-tight">{address}</p>
        <p className="mt-0.5 text-[12px] text-white/60">{postcode}</p>
        {line && <p className="mt-2 border-t border-white/10 pt-2 text-[11.5px] text-white/70">{line}</p>}
      </div>
    </div>
  );
}
