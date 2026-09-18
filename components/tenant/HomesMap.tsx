"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { loadGoogle } from "@/components/MarketMap";
import type { MarketHome } from "@/lib/market-homes";

/**
 * Find a home, on a map (James, 18 Sep 2026: "we should have a map and a
 * radius search"). Every home the search shows as a rent pin, their house as
 * the centre, and the radius drawn as a ring by Google so it stays true at
 * every zoom. Tap a pin for the home's card; pan somewhere else and "Search
 * this area" moves the search there.
 *
 * Built the way components/MarketMap is, and for the same reasons: the pins
 * are React positioned from an OverlayView's projection (no Map ID to set up),
 * the same quiet style, the wheel off so a trackpad does not run away with it.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dcecd2" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e4efdc" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f2f1ef" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c3ddf2" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f7e7c3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6560" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

const short = (h: MarketHome) =>
  h.rent >= 10000 ? `£${Math.round(h.rent / 1000)}k` : `£${Math.round(h.rent).toLocaleString("en-GB")}${h.rentPeriod === "week" ? "pw" : ""}`;

type Pin = { id: string; x: number; y: number };

export default function HomesMap({
  homes,
  centre,
  centreIsHome,
  radiusMiles,
  hovered,
  hrefFor,
  onSearchHere,
  onPick,
}: {
  homes: MarketHome[];
  centre: { lat: number; lng: number } | null;
  centreIsHome: boolean;
  radiusMiles: number | null;
  hovered: string | null;
  hrefFor: (id: string) => string;
  /** On a phone a pin raises the home in a bottom sheet rather than the card
   *  over the map: the tap is handed up, and a tap on the map clears it. */
  onPick?: (id: string | null) => void;
  /** Absent on a single home's page: there is nothing to search there. */
  onSearchHere?: (at: { lat: number; lng: number }) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const circle = useRef<google.maps.Circle | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [me, setMe] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  /* A pan we made ourselves (fitting the search) is not the tenant moving. */
  const fitting = useRef(false);

  const placed = homes.filter((h) => h.lat != null && h.lng != null);
  const homesRef = useRef(placed);
  homesRef.current = placed;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const centreRef = useRef(centre);
  centreRef.current = centre;

  const project = useCallback(() => {
    const proj = overlay.current?.getProjection();
    if (!proj) return;
    const at = (lat: number, lng: number) => proj.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lng));
    setPins(
      homesRef.current.flatMap((h) => {
        const p = at(h.lat!, h.lng!);
        return p ? [{ id: h.id, x: p.x, y: p.y }] : [];
      })
    );
    const c = centreRef.current;
    const p = c ? at(c.lat, c.lng) : null;
    setMe(p ? { x: p.x, y: p.y } : null);
  }, []);

  useEffect(() => {
    let dead = false;
    loadGoogle()
      .then(() => {
        if (dead || !holder.current || map.current) return;
        map.current = new google.maps.Map(holder.current, {
          center: centreRef.current ?? { lat: 52.6, lng: -1.4 },
          zoom: 11,
          styles: STYLE,
          disableDefaultUI: true,
          scrollwheel: false,
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
        map.current.addListener("dragend", () => {
          if (!fitting.current) setMoved(true);
        });
        map.current.addListener("click", () => {
          setOpen(null);
          pickRef.current?.(null);
        });
        setReady(true);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
  }, [project]);

  /* The ring, then fit the view to it - or to every home when the search is
     "any distance". */
  const key = placed.map((h) => h.id).join(",");
  useEffect(() => {
    if (!ready || !map.current) return;
    circle.current?.setMap(null);
    circle.current = null;
    fitting.current = true;
    if (centre && radiusMiles) {
      circle.current = new google.maps.Circle({
        map: map.current,
        center: centre,
        radius: radiusMiles * 1609.34,
        strokeColor: "#56423e",
        strokeOpacity: 0.55,
        strokeWeight: 1.5,
        fillColor: "#56423e",
        fillOpacity: 0.06,
        clickable: false,
      });
      const b = circle.current.getBounds();
      if (b) map.current.fitBounds(b, 24);
    } else {
      const b = new google.maps.LatLngBounds();
      placed.forEach((h) => b.extend({ lat: h.lat!, lng: h.lng! }));
      if (centre) b.extend(centre);
      if (!b.isEmpty()) map.current.fitBounds(b, 50);
      const z = map.current.getZoom();
      if (z != null && z > 14) map.current.setZoom(14);
    }
    setMoved(false);
    const t = window.setTimeout(() => {
      fitting.current = false;
    }, 400);
    project();
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, centre?.lat, centre?.lng, radiusMiles, key]);

  if (!KEY || failed) {
    return (
      <div className="flex h-full min-h-[320px] w-full items-center justify-center rounded-[22px] border border-dashed border-line/70 p-6 text-center">
        <p className="text-[13px] text-muted">The map could not load just now. Every home is still in the list.</p>
      </div>
    );
  }

  const byId = new Map(placed.map((h) => [h.id, h]));

  /* Pins that would sit on top of each other become one bubble with a count;
     tapping it zooms in on them. Worked out in screen pixels, so it regroups
     at every zoom - a country-wide view is a dozen bubbles, a street is pins. */
  const groups: { x: number; y: number; ids: string[] }[] = [];
  for (const p of pins) {
    const g = groups.find((q) => Math.abs(q.x - p.x) < 72 && Math.abs(q.y - p.y) < 34);
    if (g) g.ids.push(p.id);
    else groups.push({ x: p.x, y: p.y, ids: [p.id] });
  }
  const zoomTo = (ids: string[]) => {
    if (!map.current) return;
    const b = new google.maps.LatLngBounds();
    ids.forEach((id) => {
      const h = byId.get(id);
      if (h) b.extend({ lat: h.lat!, lng: h.lng! });
    });
    fitting.current = true;
    const before = map.current.getZoom() ?? 6;
    map.current.fitBounds(b, 80);
    /* fitBounds can barely move for a bubble whose homes are a city apart,
       which reads as the tap doing nothing. Always at least two steps in. */
    google.maps.event.addListenerOnce(map.current, "idle", () => {
      const z = map.current?.getZoom() ?? before;
      if (z < before + 2) {
        map.current?.setCenter(b.getCenter());
        map.current?.setZoom(before + 2);
      } else if (z > 16) map.current?.setZoom(16);
    });
    window.setTimeout(() => {
      fitting.current = false;
    }, 400);
  };
  const card = open && hrefFor(open) !== "#" ? byId.get(open) : null;
  const cardPin = open ? pins.find((p) => p.id === open) : null;

  return (
    <div className="relative h-full overflow-hidden rounded-[22px] border border-line/60">
      <div ref={holder} className="h-full w-full bg-line/10" />

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="block h-6 w-6 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent-dark" />
        </div>
      )}

      {/* Their house, or wherever they are searching from. */}
      {ready && me && (
        <div className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2" style={{ left: me.x, top: me.y }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-accent-dark text-white shadow-md">
            <DoodleIcon name={centreIsHome ? "home" : "target"} size={15} className="invert" />
          </span>
        </div>
      )}

      {/* A rent pin per home. */}
      {ready &&
        groups
          .filter((g) => g.ids.length > 1 && !g.ids.includes(hovered ?? "") && !g.ids.includes(open ?? ""))
          .map((g) => (
            <button
              key={g.ids.join(",")}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                zoomTo(g.ids);
              }}
              className="absolute z-[2] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-accent-dark bg-accent-soft px-2.5 py-1 text-[12px] font-bold text-accent-dark shadow-sm transition-transform hover:scale-105"
              style={{ left: g.x, top: g.y }}
              aria-label={`${g.ids.length} homes here, zoom in`}
            >
              {g.ids.length} homes
            </button>
          ))}

      {ready &&
        pins.map((p) => {
          const grouped = groups.find((g) => g.ids.includes(p.id) && g.ids.length > 1);
          if (grouped && !grouped.ids.includes(hovered ?? "") && !grouped.ids.includes(open ?? "")) return null;
          const h = byId.get(p.id);
          if (!h) return null;
          const lit = hovered === p.id || open === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onPick) onPick(p.id);
                else setOpen(open === p.id ? null : p.id);
              }}
              className={`absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-bold shadow-sm transition-transform ${
                lit ? "z-[4] scale-110 border-accent-dark bg-accent-dark text-white" : "z-[2] border-line/80 bg-white text-ink hover:scale-105"
              }`}
              style={{ left: p.x, top: p.y }}
              aria-label={`${h.name}, ${short(h)}`}
            >
              {short(h)}
            </button>
          );
        })}

      {/* The home's card, above its pin. */}
      {ready && card && cardPin && (
        <Link
          href={hrefFor(card.id)}
          className="absolute z-[6] w-[230px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-line/60 bg-white shadow-xl"
          style={{ left: Math.min(Math.max(cardPin.x, 125), (holder.current?.clientWidth ?? 400) - 125), top: Math.max(cardPin.y - 42 - 210, 8) }}
          onClick={(e) => e.stopPropagation()}
        >
          <PropertyPhoto src={card.photo} alt="" className="h-[110px] w-full" />
          <div className="p-3">
            <p className="text-[15px] font-bold leading-tight">
              £{Math.round(card.rent).toLocaleString("en-GB")} <span className="text-[12px] font-normal text-muted">{card.rentPeriod === "week" ? "a week" : "a month"}</span>
            </p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold">{card.name}</p>
            <p className="mt-0.5 flex items-center justify-between text-[11.5px] text-muted">
              <span>{card.beds != null ? (card.beds === 0 ? "Studio" : `${card.beds} bed`) : card.locality}</span>
              <span className="font-semibold text-accent-dark">See the home</span>
            </p>
          </div>
        </Link>
      )}

      {ready && moved && onSearchHere && (
        <button
          type="button"
          onClick={() => {
            const c = map.current?.getCenter();
            if (c) onSearchHere?.({ lat: c.lat(), lng: c.lng() });
            setMoved(false);
          }}
          className="absolute left-1/2 top-3 z-[5] -translate-x-1/2 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white shadow-md"
        >
          Search this area
        </button>
      )}

      {ready && (
        <div className="absolute right-3 top-3 z-[5] flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-white shadow-md">
          <button type="button" aria-label="Zoom in" onClick={() => map.current?.setZoom((map.current.getZoom() ?? 11) + 1)} className="h-9 w-9 border-b border-line/60 text-[16px] leading-none hover:bg-panel">+</button>
          <button type="button" aria-label="Zoom out" onClick={() => map.current?.setZoom((map.current.getZoom() ?? 11) - 1)} className="h-9 w-9 text-[16px] leading-none hover:bg-panel">−</button>
        </div>
      )}
    </div>
  );
}
