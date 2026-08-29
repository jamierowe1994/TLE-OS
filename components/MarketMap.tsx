"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const resizeObs = useRef<ResizeObserver | null>(null);

  /**
   * The card that pops out of the map, and where on the map to draw it.
   *
   * Rendered in REACT over the map rather than as a Leaflet popup. A Leaflet
   * popup takes an HTML string, which means building the markup by hand and
   * wiring the tick with a DOM listener — in a codebase where every other card
   * is a component with Tailwind on it. This way the popup is the same card as
   * the grid, styled the same way, and the tick is an ordinary onClick.
   *
   * The position is recomputed on every map move, because the anchor is a
   * LAT/LNG and the card is in screen pixels: pan the map and a card that does
   * not follow is pointing at the wrong house.
   */
  const [open, setOpen] = useState<MarketListing | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const place = useCallback((l: MarketListing | null) => {
    if (!l || l.lat == null || l.lon == null || !map.current) return setAt(null);
    const p = map.current.latLngToContainerPoint([l.lat, l.lon]);
    setAt({ x: p.x, y: p.y });
  }, []);

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
          /* The wheel zooms, and it only became safe once the layout changed.
           *
           * It was off, for a good reason at the time: the map used to sit
           * beside a column that scrolled THE PAGE, so a map that swallowed
           * the wheel made the list impossible to get past — put the pointer
           * in the wrong half and everything stopped moving.
           *
           * That is no longer true. The map is fixed full height and the list
           * scrolls inside itself, so the two halves no longer compete for the
           * wheel: over the cards it scrolls the cards, over the map it zooms
           * the map. Which is what the reference does, and what James asked
           * for once the map stopped moving.
           *
           * If this map is ever dropped back into a page that scrolls behind
           * it, turn this off again — the trap returns with the layout. */
          scrollWheelZoom: true,
        });
        /* A QUIET BASEMAP, which is most of the difference.
         *
         * Raw OpenStreetMap draws every shop, bus stop and footpath in full
         * colour. Against a page of price pills that reads as noise, and the
         * pills — the only thing anybody is here to look at — have to fight
         * the map to be seen. James, 29 Aug, pointing at Airbnb: "I quite
         * like their map is fairly neutral."
         *
         * CARTO Positron is that map: greys, muted greens, roads and names and
         * little else. No API key, no billing account, no per-load cost, and
         * it is a one-line swap because it is still Leaflet underneath — which
         * is why it is here rather than Google Maps JS. If we ever want
         * Google's own tiles the key exists, but this gets the look for
         * nothing. */
        /* ── TILES, AND WHY THIS ONE ─────────────────────────────────────
         *
         * Three keyless map services were tried and all three FAILED BY
         * DRAWING A PICTURE rather than returning an error, which is the trap
         * worth recording here:
         *
         *   CARTO    HTTP 200, correct colours, and "API KEY REQUIRED"
         *            watermarked across every tile. Their free basemaps now
         *            need an account. A status check passes; a histogram of
         *            the colours passes; only looking at the image fails.
         *   OSM      HTTP 200 carrying a 403 "Access blocked" graphic. Their
         *            volunteer servers refuse application traffic by policy.
         *   Google   HTTP 200 carrying an apology when billing or the API is
         *            not enabled, which is how the Static Maps thumbnail put
         *            an error message on screen earlier.
         *
         * Esri's Light Gray Canvas is keyless, unwatermarked and permitted.
         * It is also GREY, which is the one thing James said he did not want —
         * so this is a stopgap that keeps the screen usable, not the answer.
         *
         * The answer is Google, whose tiles are what the reference screenshots
         * actually show. That needs the key exposed as
         * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, because the Maps JavaScript API
         * runs in the browser and cannot read a server secret — which is
         * exactly what HTTP referrer restrictions exist to make safe. */
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "&copy; Esri",
            maxZoom: 16,
          }
        ).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }

      layer.current?.clearLayers();

      const bounds: Array<[number, number]> = [];

      /* THE RADIUS, DRAWN.
       *
       * A number on a slider is an abstraction; a ring on the map is the
       * answer to "how far is that, really" — and it is the thing that makes
       * widening a search a considered act rather than a nudge. Faint, under
       * the pins, because it is context and not content.
       *
       * Only when a radius is actually set: with the sector default there is
       * no circle to draw, and inventing one would draw a boundary that is not
       * the boundary being searched. */
      if (centre && radiusMiles > 0) {
        L.circle([centre.lat, centre.lon], {
          radius: radiusMiles * 1609.34,
          color: "#7f1d1d",
          weight: 1,
          opacity: 0.5,
          fillColor: "#7f1d1d",
          fillOpacity: 0.05,
          interactive: false,
        }).addTo(layer.current!);
      }

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
        /* Clicking a price OPENS it rather than ticking it.
         *
         * It used to do both at once. With a card on the map that is the wrong
         * trade: the tick is now a button you can see, on a card showing the
         * photo and the rent, so ticking becomes a decision made while looking
         * at the property rather than a side effect of pointing at it. The
         * "bring it to the top of the list" half is kept — that was the useful
         * part — and happens through onOpen. */
        m.on("click", () => {
          setOpen(l);
          place(l);
          onOpen?.(k);
        });
      }

      /* Leaflet measures its container once, at creation. This map is created
         inside a layout that CHANGES — the split view halves its width the
         moment the Map button is pressed — so without this it keeps the old
         width and renders tiles into a strip with grey either side. Observing
         the element covers the toggle, a window resize and the sidebar
         collapsing, none of which fire a Leaflet event. */
      /* The card is anchored to a house, not to the screen. Every pan, zoom
         and resize moves that house, so the card is repositioned with it —
         otherwise it drifts and ends up labelling a neighbour. */
      map.current.on("move zoom resize", () => setOpen((o) => (place(o), o)));

      const ro = new ResizeObserver(() => map.current?.invalidateSize());
      ro.observe(holder.current);
      resizeObs.current?.disconnect();
      resizeObs.current = ro;
      map.current.invalidateSize();

      if (bounds.length) {
        /* Start further out. Fitting tightly to the pins put the map right on
           top of the estate with no context around it — an agent could not see
           which way the main road ran, and the first thing everybody did was
           zoom out. More padding and a lower ceiling give the surroundings
           room, which is most of what makes a comparables map readable. */
        map.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 13 });
      } else if (centre) {
        map.current.setView([centre.lat, centre.lon], 13);
      }
    })();
    return () => {
      cancelled = true;
      resizeObs.current?.disconnect();
    };
  }, [points, centre, selected, onSelect, onOpen, place, radiusMiles]);

  if (!centre && points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">
        Nothing to plot — none of these carried a location.
      </p>
    );
  }

  const money = (n: number | null) =>
    n == null ? "\u2014" : `\u00a3${Math.round(n).toLocaleString("en-GB")}`;

  return (
    <>
      <div className="relative">
        <div
          ref={holder}
          /* Full height, and it does not move. The map runs to the bottom of
             the screen beside a list that scrolls on its own — measured from
             the viewport rather than set in pixels, so it fills a laptop and a
             large monitor equally rather than being right on neither. */
          className="h-[calc(100vh-260px)] w-full overflow-hidden rounded-2xl border border-line/70"
        />

        {/* The card, over the map, anchored to its house.
            Sits ABOVE Leaflet's own panes (which top out around z-index 700)
            and below the app's drawers, so it can never cover a dialog. */}
        {open && at && (
          <div
            className="fade-up pointer-events-none absolute z-[800]"
            style={{
              left: at.x,
              top: at.y,
              /* Centred on the pin and lifted clear of it, so the card never
                 sits on top of the price it came from. */
              transform: "translate(-50%, calc(-100% - 18px))",
            }}
          >
            <div className="pointer-events-auto w-[248px] overflow-hidden rounded-2xl border border-line/70 bg-page shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]">
              <div className="relative">
                {open.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={open.image}
                    alt=""
                    className="h-[140px] w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-[140px] w-full items-center justify-center bg-line/20 text-[11px] text-muted">
                    No photograph
                  </div>
                )}

                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(null)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-page/90 text-[12px] text-ink shadow-sm transition-transform hover:scale-105"
                >
                  ✕
                </button>

                {/* Ticking is now a decision made while looking at the
                    property, rather than a side effect of clicking its price. */}
                {onSelect && (
                  <button
                    type="button"
                    aria-label={
                      selected.includes(keyOf(open)) ? "Remove from the deck" : "Add to the deck"
                    }
                    onClick={() => onSelect(keyOf(open))}
                    className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[12px] shadow-sm transition-transform hover:scale-105 ${
                      selected.includes(keyOf(open))
                        ? "bg-accent-dark text-white"
                        : "bg-page/90 text-muted"
                    }`}
                  >
                    ✓
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
                    .join(" \u00b7 ")}
                </p>
                {open.agent && (
                  <p className="truncate text-[10.5px] text-muted">{open.agent}</p>
                )}

                {/* Homesearch gives ONE photo per listing, so there is no
                    gallery to page through. The advert is the honest way to
                    see the rest of them, and every row carries a link. */}
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
        )}
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Rents rather than pins, so the shape of the local market reads in one look. Click a
        price to open it.{" "}
        {listings.length - points.length > 0
          ? `${listings.length - points.length} without a location aren't plotted — they're still in the list below.`
          : ""}
      </p>
    </>
  );
}
