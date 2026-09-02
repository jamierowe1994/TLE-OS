"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogle } from "@/components/MarketMap";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * The managed book on a map.
 *
 * Same bones as MarketMap — Google's tiles with the clutter styled off, an
 * OverlayView so our own HTML pins follow every pan and zoom — but a
 * different job. That map answers "what does the street pay"; this one
 * answers "where is the business, and which of it needs a look". So the pins
 * are rent pills as before, and a property with an expired, overdue or
 * missing certificate is drawn in the accent so it stands out of 449 dots.
 *
 * REX carries coordinates on every property in the book (measured 2 Sep 2026,
 * 449 of 449), so nothing here is geocoded.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

type Pt = { id: string; x: number; y: number; p: ManagedProperty };

export default function PortfolioMap({
  properties,
  attention,
  onOpen,
}: {
  properties: ManagedProperty[];
  /** Listing ids needing a look — drawn in the accent. */
  attention: Set<string>;
  onOpen: (listingId: string) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pts, setPts] = useState<Pt[]>([]);
  const [open, setOpen] = useState<ManagedProperty | null>(null);

  const placed = properties.filter((p) => p.lat != null && p.lng != null);

  const project = useCallback(() => {
    const pr = overlay.current?.getProjection?.();
    if (!pr) return;
    setPts(
      placed.map((p) => {
        const q = pr.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat as number, p.lng as number));
        return { id: p.listingId, x: q?.x ?? -9999, y: q?.y ?? -9999, p };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties]);

  useEffect(() => {
    let dead = false;
    loadGoogle()
      .then(() => {
        if (dead || !holder.current) return;
        if (!map.current) {
          map.current = new google.maps.Map(holder.current, {
            center: { lat: 53.4, lng: -2.2 },
            zoom: 6,
            styles: [
              { featureType: "poi", stylers: [{ visibility: "off" }] },
              { featureType: "transit", stylers: [{ visibility: "off" }] },
              { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dcecd2" }] },
              { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e4efdc" }] },
              { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f2f1ef" }] },
              { featureType: "water", elementType: "geometry", stylers: [{ color: "#c3ddf2" }] },
              { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
              { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
              { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fdfcfa" }] },
              { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f7e7c3" }] },
              { elementType: "labels.text.fill", stylers: [{ color: "#6b6560" }] },
              { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
              { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
              { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
            ],
            disableDefaultUI: true,
            /* The wheel zooms here. This map fills its panel rather than
               sitting inside a scrolling page, so there is nothing for the
               wheel to fight with. */
            scrollwheel: true,
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: false,
          });
          const ov = new google.maps.OverlayView();
          ov.onAdd = () => {};
          ov.onRemove = () => {};
          ov.draw = () => project();
          ov.setMap(map.current);
          overlay.current = ov;
          map.current.addListener("bounds_changed", () => project());
        }
        setReady(true);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Fit to what is shown. A filter that leaves one town zooms to that town. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const b = new google.maps.LatLngBounds();
    placed.forEach((p) => b.extend({ lat: p.lat as number, lng: p.lng as number }));
    if (!b.isEmpty()) {
      map.current.fitBounds(b, 60);
      const z = map.current.getZoom();
      if (z != null && z > 15) map.current.setZoom(15);
    }
    project();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, properties]);

  /* An opened card for a property that has since been filtered out closes. */
  useEffect(() => {
    if (open && !properties.some((p) => p.listingId === open.listingId)) setOpen(null);
  }, [properties, open]);

  const money = (n: number | null) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);

  if (!KEY || failed) {
    return (
      <div className="flex h-full min-h-[360px] w-full items-center justify-center rounded-2xl border border-dashed border-line/70 p-6 text-center">
        <p className="text-[12.5px] leading-relaxed text-muted">
          The map needs <span className="font-semibold">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> on this
          environment.
          <br />
          The properties and landlords views work without it.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={holder} className="h-full w-full overflow-hidden rounded-2xl border border-line/70 bg-line/10" />

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-muted/70"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
        </div>
      )}

      {ready && (
        <div className="absolute right-3 top-3 z-[5] flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-page shadow-md">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => map.current?.setZoom((map.current.getZoom() ?? 6) + 1)}
            className="h-9 w-9 border-b border-line/60 text-[15px] leading-none text-ink transition-colors hover:bg-line/20"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => map.current?.setZoom((map.current.getZoom() ?? 6) - 1)}
            className="h-9 w-9 text-[15px] leading-none text-ink transition-colors hover:bg-line/20"
          >
            &minus;
          </button>
        </div>
      )}

      {ready && (
        <div className="pointer-events-none absolute left-3 top-3 z-[5] flex items-center gap-2 rounded-full border border-line/70 bg-page/95 px-3 py-1.5 text-[11px] text-muted shadow-sm">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-line/70 bg-page" /> fine
          <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-accent-dark" /> needs a look
          {placed.length < properties.length && (
            <span className="ml-1">· {properties.length - placed.length} without a location</span>
          )}
        </div>
      )}

      {ready &&
        pts.map(({ id, x, y, p }) => {
          const isOpen = open?.listingId === id;
          const flag = attention.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setOpen(p)}
              className={`absolute whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm transition-transform hover:scale-110 ${
                isOpen
                  ? "z-[3] border-ink bg-ink text-page"
                  : flag
                    ? "z-[2] border-accent-dark bg-accent-dark text-white"
                    : "z-[1] border-line/70 bg-page text-ink"
              }`}
              style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
            >
              {money(p.rentMonthly)}
            </button>
          );
        })}

      {ready &&
        open &&
        (() => {
          const at = pts.find((q) => q.id === open.listingId);
          if (!at) return null;
          return (
            <div
              className="fade-up pointer-events-none absolute z-[4]"
              style={{ left: at.x, top: at.y, transform: "translate(-50%, calc(-100% - 20px))" }}
            >
              <div className="pointer-events-auto w-[248px] overflow-hidden rounded-2xl border border-line/70 bg-page shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]">
                <div className="relative">
                  {open.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={open.image} alt="" className="h-[130px] w-full object-cover" />
                  ) : (
                    <div className="flex h-[130px] w-full items-center justify-center bg-line/20 text-[11px] text-muted">
                      No photograph
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setOpen(null)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-page/90 text-[12px] shadow-sm transition-transform hover:scale-105"
                  >
                    &#10005;
                  </button>
                  {attention.has(open.listingId) && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-page/95 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent-dark">
                      Certificates
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="figures text-[14px]">
                      {money(open.rentMonthly)}
                      <span className="text-[10.5px] text-muted"> pcm</span>
                    </span>
                    <span className="text-[10.5px] text-muted">{open.service ?? "Service not set"}</span>
                  </p>
                  <p className="mt-1 truncate text-[12px]">{open.name}</p>
                  <p className="truncate text-[11px] text-muted">
                    {open.locality}
                    {open.landlord ? ` · ${open.landlord.name}` : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpen(open.listingId)}
                    className="mt-2.5 w-full rounded-full border border-ink/80 py-1.5 text-[11.5px] font-semibold transition-colors hover:bg-ink hover:text-page"
                  >
                    Open the property
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
