"use client";

import { useEffect, useRef } from "react";
import type { MarketListing } from "@/lib/ma-research";

/**
 * The market, on a map.
 *
 * ── Why Leaflet and OpenStreetMap rather than Google ──────────────────────
 *
 * No API key, no billing account, no per-load cost, and nothing to leak. The
 * OS already holds enough credentials; a map that shows twelve rent pins does
 * not need to add one. Google's tiles are prettier and would need a key on
 * every environment including a colleague's laptop.
 *
 * ── Why the marker is a PRICE, not a pin ──────────────────────────────────
 *
 * A field of identical teardrops tells an agent where properties are, which
 * they already know — they are near the appraisal. What they cannot see from a
 * list is the SHAPE of the local market: that the £1,650s are all on one side
 * of the estate and the £800s back onto the main road. Rent-on-the-map answers
 * that in one look, which is the whole reason for plotting it.
 *
 * ── Loaded on the client only ─────────────────────────────────────────────
 *
 * Leaflet reaches for `window` at import time, so it is imported dynamically
 * inside an effect. Importing it at the top of the module breaks the build with
 * "window is not defined" during prerender — quietly, on a page that is fine in
 * dev.
 */

export default function MarketMap({
  listings,
  centre,
  selected,
  onSelect,
}: {
  listings: MarketListing[];
  centre: { lat: number; lon: number } | null;
  /** Keys of the ticked comparables, so the map agrees with the grid. */
  selected: string[];
  onSelect?: (key: string) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);

  const points = listings.filter((l) => l.lat != null && l.lon != null);
  const keyOf = (l: MarketListing) => `${l.address}|${l.rent}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current) return;

      if (!map.current) {
        map.current = L.map(holder.current, {
          zoomControl: true,
          // A map that grabs the wheel makes a long page impossible to scroll
          // past on a laptop. Ctrl-scroll still zooms; that is Leaflet's own
          // affordance and it prints a hint when somebody tries.
          scrollWheelZoom: false,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 18,
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }

      layer.current?.clearLayers();

      const bounds: Array<[number, number]> = [];

      if (centre) {
        bounds.push([centre.lat, centre.lon]);
        L.marker([centre.lat, centre.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:#1c1917;color:#fff;border-radius:999px;padding:3px 9px;font:600 11px/1.4 system-ui;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)">This one</div>`,
            iconSize: [0, 0],
            iconAnchor: [30, 12],
          }),
          // Above the rent pins — the subject must never be hidden behind a
          // neighbour's price.
          zIndexOffset: 1000,
        }).addTo(layer.current!);
      }

      for (const l of points) {
        const k = keyOf(l);
        const on = selected.includes(k);
        bounds.push([l.lat!, l.lon!]);
        const label = l.rent ? `£${Math.round(l.rent).toLocaleString("en-GB")}` : "—";
        const m = L.marker([l.lat!, l.lon!], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:${on ? "#7f1d1d" : "#fff"};color:${on ? "#fff" : "#1c1917"};border:1px solid ${on ? "#7f1d1d" : "#cdc9c0"};border-radius:999px;padding:2px 8px;font:600 11px/1.4 system-ui;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.18);cursor:pointer">${label}</div>`,
            iconSize: [0, 0],
            iconAnchor: [24, 11],
          }),
        }).addTo(layer.current!);
        m.bindTooltip(
          `${l.address}<br>${[l.beds ? `${l.beds} bed` : null, l.type, l.agent].filter(Boolean).join(" · ")}`,
          { direction: "top", offset: [0, -14] }
        );
        if (onSelect) m.on("click", () => onSelect(k));
      }

      if (bounds.length) {
        map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } else if (centre) {
        map.current.setView([centre.lat, centre.lon], 14);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, centre, selected, onSelect]);

  if (!centre && points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">
        Nothing to plot — none of these carried a location.
      </p>
    );
  }

  return (
    <>
      <div
        ref={holder}
        className="h-[420px] w-full overflow-hidden rounded-xl border border-line/70"
      />
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Rents rather than pins, so the shape of the local market reads in one look. Click a
        price to tick it. {listings.length - points.length > 0
          ? `${listings.length - points.length} without a location aren't plotted — they're still in the list below.`
          : ""}
      </p>
    </>
  );
}
