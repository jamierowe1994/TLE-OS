"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketListing } from "@/lib/ma-research";

/**
 * The market, on a map.
 *
 * ── Why Google now, having argued for keyless tiles ───────────────────────
 *
 * Because every keyless option failed, and all three failed the same way: by
 * DRAWING A PICTURE rather than returning an error.
 *
 *   CARTO   HTTP 200, correct colours, "API KEY REQUIRED" watermarked across
 *           every tile. A status check passes. A colour histogram passes.
 *           Only looking at the image fails — which is how this shipped.
 *   OSM     HTTP 200 carrying a 403 "Access blocked" graphic; their volunteer
 *           servers refuse application traffic by policy.
 *   Esri    Works, unwatermarked, and grey — the one thing James ruled out.
 *
 * Google is also what the reference screenshots actually show, so this stops
 * being a compromise. STANDARD COLOURS, with no style array: the greens and
 * blues are the point, and a custom style is how you end up grey by accident.
 *
 * ── Pins are React, not Google markers ────────────────────────────────────
 *
 * One OverlayView exists solely to expose the projection; every price pill,
 * the subject dot and the card are ordinary React nodes positioned from it.
 * That avoids AdvancedMarkerElement, which needs a Map ID created in the
 * console — one more thing to set up and forget — and it means the pills are
 * styled with Tailwind like everything else rather than with inline CSS
 * strings inside a template literal.
 *
 * ── The wheel is off again, and that is not a flip-flop ───────────────────
 *
 * It went ON when the map became fixed and the list scrolled separately,
 * because that removed the reason it was off. It comes back OFF because James
 * then used it: a trackpad makes Google's zoom far too sensitive and the map
 * runs away from you. Dragging still works and the buttons zoom deliberately.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Loaded once per page, not once per mount. */
let googleReady: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  if (!KEY) return Promise.reject(new Error("no key"));
  if (googleReady) return googleReady;
  googleReady = new Promise<void>((resolve, reject) => {
    if (typeof window !== "undefined" && (window as unknown as { google?: unknown }).google) {
      return resolve();
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return googleReady;
}

type Pt = { key: string; x: number; y: number; l: MarketListing };

export default function MarketMap({
  listings,
  centre,
  selected,
  onSelect,
  onOpen,
  radiusMiles = 0,
}: {
  listings: MarketListing[];
  centre: { lat: number; lon: number } | null;
  /** Keys of the ticked comparables, so the map agrees with the grid. */
  selected: string[];
  onSelect?: (key: string) => void;
  /** Called when a pill is clicked, so the grid can bring that card to the top. */
  onOpen?: (key: string) => void;
  /** Miles, or 0 for "the postcode sector". Drawn as a ring around the subject. */
  radiusMiles?: number;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const circle = useRef<google.maps.Circle | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pts, setPts] = useState<Pt[]>([]);
  const [subject, setSubject] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState<MarketListing | null>(null);

  const points = listings.filter((l) => l.lat != null && l.lon != null);
  const keyOf = (l: MarketListing) => `${l.address}|${l.rent}`;

  /** Recompute every pixel position from the current projection. */
  const project = useCallback(() => {
    const p = overlay.current?.getProjection?.();
    if (!p) return;
    setPts(
      listings
        .filter((l) => l.lat != null && l.lon != null)
        .map((l) => {
          const q = p.fromLatLngToContainerPixel(new google.maps.LatLng(l.lat!, l.lon!));
          return { key: `${l.address}|${l.rent}`, x: q?.x ?? -9999, y: q?.y ?? -9999, l };
        })
    );
    if (centre) {
      const q = p.fromLatLngToContainerPixel(new google.maps.LatLng(centre.lat, centre.lon));
      setSubject(q ? { x: q.x, y: q.y } : null);
    } else {
      setSubject(null);
    }
  }, [listings, centre]);

  useEffect(() => {
    let dead = false;
    loadGoogle()
      .then(() => {
        if (dead || !holder.current) return;
        if (!map.current) {
          map.current = new google.maps.Map(holder.current, {
            center: centre ? { lat: centre.lat, lng: centre.lon } : { lat: 53.4, lng: -2.9 },
            zoom: 13,
            disableDefaultUI: true,
            /* Drag yes, wheel no — see the note at the top. */
            scrollwheel: false,
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: false,
          });

          const ov = new google.maps.OverlayView();
          ov.onAdd = () => {};
          ov.onRemove = () => {};
          /* draw() runs on every pan, zoom and resize — exactly when a pixel
             position stops being true. */
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

  /* Fit to whatever is being shown, whenever that changes. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const b = new google.maps.LatLngBounds();
    points.forEach((l) => b.extend({ lat: l.lat!, lng: l.lon! }));
    if (centre) b.extend({ lat: centre.lat, lng: centre.lon });
    if (!b.isEmpty()) {
      map.current.fitBounds(b, 70);
      /* fitBounds dives too close when everything sits on one street. */
      const z = map.current.getZoom();
      if (z != null && z > 15) map.current.setZoom(15);
    }
    project();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, listings, centre]);

  /* The radius ring, drawn by Google so it stays true at every zoom — a ring
     in pixels would lie the moment somebody zoomed out. */
  useEffect(() => {
    if (!ready || !map.current) return;
    circle.current?.setMap(null);
    circle.current = null;
    if (!centre || radiusMiles <= 0) return;
    circle.current = new google.maps.Circle({
      map: map.current,
      center: { lat: centre.lat, lng: centre.lon },
      radius: radiusMiles * 1609.34,
      strokeColor: "#7f1d1d",
      strokeOpacity: 0.55,
      strokeWeight: 1.5,
      fillColor: "#7f1d1d",
      fillOpacity: 0.06,
      clickable: false,
    });
  }, [ready, centre, radiusMiles]);

  const money = (n: number | null) =>
    n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`;

  if (!KEY || failed) {
    return (
      <div className="flex h-[calc(100vh-260px)] w-full items-center justify-center rounded-2xl border border-dashed border-line/70 p-6 text-center">
        <p className="text-[12.5px] leading-relaxed text-muted">
          The map needs <span className="font-semibold">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> on
          this environment.
          <br />
          Everything else here works without it — the properties are listed on the left.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <div
          ref={holder}
          className="h-[calc(100vh-260px)] w-full overflow-hidden rounded-2xl border border-line/70 bg-line/10"
        />

        {/* Three dots while Google is still arriving. An empty grey rectangle
            reads as broken; this reads as loading. */}
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

        {/* Our own zoom buttons, rounded. Google's default controls are square
            and cannot be restyled, so the default UI is off and these sit over
            the map instead. */}
        {ready && (
          <div className="absolute right-3 top-3 z-[5] flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-page shadow-md">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => map.current?.setZoom((map.current.getZoom() ?? 13) + 1)}
              className="h-9 w-9 border-b border-line/60 text-[15px] leading-none text-ink transition-colors hover:bg-line/20"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => map.current?.setZoom((map.current.getZoom() ?? 13) - 1)}
              className="h-9 w-9 text-[15px] leading-none text-ink transition-colors hover:bg-line/20"
            >
              &minus;
            </button>
          </div>
        )}

        {/* The subject: a dot, not a label. It is the one property on this map
            nobody needs telling about. */}
        {ready && subject && (
          <span
            className="pointer-events-none absolute z-[2] h-3.5 w-3.5 rounded-full border-[2.5px] border-white bg-[#2563eb] shadow"
            style={{ left: subject.x, top: subject.y, transform: "translate(-50%,-50%)" }}
          />
        )}

        {/* Price pills. Three states, because open and ticked are different
            things: dark is the card you are reading, red is going in the deck. */}
        {ready &&
          pts.map(({ key, x, y, l }) => {
            const isOpen = open != null && keyOf(open) === key;
            const on = selected.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setOpen(l);
                  onOpen?.(key);
                }}
                className={`absolute whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm transition-transform hover:scale-110 ${
                  isOpen
                    ? "z-[3] border-ink bg-ink text-page"
                    : on
                      ? "z-[2] border-accent-dark bg-accent-dark text-white"
                      : "z-[1] border-line/70 bg-page text-ink"
                }`}
                style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
              >
                {money(l.rent)}
              </button>
            );
          })}

        {/* The card, anchored to its house so it follows every pan and zoom. */}
        {ready &&
          open &&
          (() => {
            const p = pts.find((q) => q.key === keyOf(open));
            if (!p) return null;
            return (
              <div
                className="fade-up pointer-events-none absolute z-[4]"
                style={{ left: p.x, top: p.y, transform: "translate(-50%, calc(-100% - 20px))" }}
              >
                <div className="pointer-events-auto w-[248px] overflow-hidden rounded-2xl border border-line/70 bg-page shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]">
                  <div className="relative">
                    {open.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={open.image} alt="" className="h-[140px] w-full object-cover" />
                    ) : (
                      <div className="flex h-[140px] w-full items-center justify-center bg-line/20 text-[11px] text-muted">
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
                    {onSelect && (
                      <button
                        type="button"
                        aria-label={
                          selected.includes(keyOf(open))
                            ? "Remove from the deck"
                            : "Add to the deck"
                        }
                        onClick={() => onSelect(keyOf(open))}
                        className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[12px] shadow-sm transition-transform hover:scale-105 ${
                          selected.includes(keyOf(open))
                            ? "bg-accent-dark text-white"
                            : "bg-page/90 text-muted"
                        }`}
                      >
                        &#10003;
                      </button>
                    )}
                    {open.status === "let agreed" && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-page/95 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-accent-dark">
                        Let agreed
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="figures text-[14px]">
                        {money(open.rent)}
                        <span className="text-[10.5px] text-muted"> pcm</span>
                      </span>
                      {open.daysListed != null && (
                        <span className="text-[10.5px] text-muted">{open.daysListed}d listed</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[12px]">{open.address}</p>
                    <p className="truncate text-[10.5px] text-muted">
                      {[open.beds ? `${open.beds} bed` : null, open.type, open.postcode]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {open.link && (
                      <a
                        href={open.link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-[10.5px] text-muted underline hover:text-ink"
                      >
                        See the full advert
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Rents rather than pins, so the shape of the local market reads in one look. Drag to move
        it, and use the buttons to zoom.{" "}
        {listings.length - points.length > 0
          ? `${listings.length - points.length} without a location aren't plotted — they're still in the list.`
          : ""}
      </p>
    </>
  );
}
