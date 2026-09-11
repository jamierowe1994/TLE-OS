"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { loadGoogle } from "@/components/MarketMap";
import type { OsListing as Listing } from "@/lib/rex-listings";

/**
 * What this tenant could actually be shown, out of the live book.
 *
 * James, 9 Sep 2026: "we shouldn't have to shortlist properties to the tenant
 * because we don't know if they're going to be interested in them yet. We
 * should just be able to have a list, and then we should be able to filter
 * that list." So the shortlist stops being the thing you build up front and
 * becomes something you do at the end, if at all.
 *
 * ── Live, and it was not ──────────────────────────────────────────────────
 *
 * The lead drawer used to read `rex-sample.json` for this, so every property
 * an agent saw against a tenant was invented. It reads /api/listings now,
 * the same book Listings shows.
 *
 * ── The radius is real ────────────────────────────────────────────────────
 *
 * Latitude and longitude are populated on 266 of 266 current rentals and the
 * lead carries the tenant's own coordinates, so "within 3 miles of them" is
 * measured, not a town-name match. Where a lead has no coordinates the radius
 * control hides rather than quietly filtering on nothing.
 *
 * ── What is NOT here, and why ─────────────────────────────────────────────
 *
 * Bedrooms. REX has no bedroom field on a listing - not empty, absent from
 * the model - so a beds filter would have to invent the number. Type comes
 * from the property subcategory, which 168 of 266 carry; the rest are shown
 * under any type filter rather than hidden by a fact we do not have.
 */

const MILES = [1, 3, 5, 10, 25] as const;

/** Great-circle miles between two points. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const money = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

export default function TenantPropertySearch({
  origin,
  originLabel,
  originListingId,
  shortlisted,
  onShortlist,
  onBook,
  mapSide = false,
}: {
  /** The tenant's own coordinates, when the lead has them. */
  origin: { lat: number; lng: number } | null;
  originLabel?: string;
  /**
   * The property they enquired about, as a fallback centre.
   *
   * MEASURED 9 Sep 2026: a REX portal lead carries no address for the tenant
   * themselves - the contact has no address fields populated at all - so
   * "within 3 miles of them" has nothing to measure from on a fresh enquiry.
   * What we do know is the property that made them get in touch, and that
   * carries exact coordinates. Centring on it answers the question an agent
   * actually asks: what else is near the one they liked.
   */
  originListingId?: string | null;
  /** Listing ids already attached to this lead. */
  shortlisted: string[];
  onShortlist?: (l: Listing) => void;
  onBook?: (l: Listing) => void;
  /** The finder pop-out (11 Sep 2026): the map down one side, the list down the other. */
  mapSide?: boolean;
}) {
  const [book, setBook] = useState<Listing[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [town, setTown] = useState("");
  const [type, setType] = useState("");
  const [maxRent, setMaxRent] = useState<number | null>(null);
  const [within, setWithin] = useState<number | null>(5);
  const [showMap, setShowMap] = useState(mapSide);

  useEffect(() => {
    let live = true;
    fetch("/api/listings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok && Array.isArray(j.listings)) setBook(j.listings as Listing[]);
        else setFailed(j?.error ?? j?.reason ?? "REX did not answer, so there is nothing to search.");
      })
      .catch(() => { if (live) setFailed("REX did not answer, so there is nothing to search."); });
    return () => { live = false; };
  }, []);

  /* Only what a tenant could actually be offered: on the market, not let
     agreed. A draft has never been advertised and is nobody's to see. */
  const available = useMemo(
    () => (book ?? []).filter((l) => l.publicationStatus === "published" && !l.letAgreed),
    [book]
  );

  const towns = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of available) {
      const t = (l.locality ?? "").replace(/\s+[A-Z]{1,2}\d[A-Z\d]?.*$/i, "").trim();
      if (t) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-GB"));
  }, [available]);

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of available) if (l.propertyType) m.set(l.propertyType, (m.get(l.propertyType) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [available]);

  /* Their own coordinates if the lead has them, otherwise the property they
     enquired about. Null when neither is known, and then the radius hides. */
  const enquiredOn = useMemo(
    () => (originListingId ? (book ?? []).find((l) => l.id === String(originListingId)) ?? null : null),
    [book, originListingId]
  );
  const centre = useMemo(() => {
    if (origin) return { at: origin, label: originLabel || "the tenant", own: true };
    if (enquiredOn?.lat != null && enquiredOn.lng != null) {
      return { at: { lat: enquiredOn.lat, lng: enquiredOn.lng }, label: enquiredOn.name, own: false };
    }
    return null;
  }, [origin, originLabel, enquiredOn]);

  const withDistance = useMemo(
    () =>
      available.map((l) => ({
        l,
        miles: centre && l.lat != null && l.lng != null ? milesBetween(centre.at, { lat: l.lat, lng: l.lng }) : null,
      })),
    [available, centre]
  );

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = withDistance.filter(({ l, miles }) => {
      if (needle && !`${l.name} ${l.locality} ${l.postcode ?? ""}`.toLowerCase().includes(needle)) return false;
      if (town && !(l.locality ?? "").toLowerCase().includes(town.toLowerCase())) return false;
      if (type && l.propertyType !== type) return false;
      if (maxRent != null && (l.rentMonthly ?? l.rent ?? 0) > maxRent) return false;
      /* A property with no coordinates is never silently dropped by a radius
         it cannot be measured against. */
      if (within != null && miles != null && miles > within) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (a.miles != null && b.miles != null) return a.miles - b.miles;
      if (a.miles != null) return -1;
      if (b.miles != null) return 1;
      return (a.l.rentMonthly ?? 0) - (b.l.rentMonthly ?? 0);
    });
  }, [withDistance, q, town, type, maxRent, within]);

  const clear = () => { setQ(""); setTown(""); setType(""); setMaxRent(null); setWithin(5); };
  const filtered = Boolean(q || town || type || maxRent != null || (centre && within !== 5));

  const field =
    "rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink";

  const list = (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-line/80 px-3 py-2 focus-within:border-ink">
          <DoodleIcon name="search" size={13} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Address or postcode…"
            className="w-full min-w-0 bg-transparent text-[12.5px] outline-none placeholder:text-muted/70"
          />
        </label>
        <select value={town} onChange={(e) => setTown(e.target.value)} className={field}>
          <option value="">Anywhere</option>
          {towns.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
          <option value="">Any type</option>
          {types.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
        <select
          value={maxRent ?? ""}
          onChange={(e) => setMaxRent(e.target.value ? Number(e.target.value) : null)}
          className={field}
        >
          <option value="">Any rent</option>
          {[600, 800, 1000, 1250, 1500, 2000, 3000].map((n) => (
            <option key={n} value={n}>Up to {money(n)}</option>
          ))}
        </select>
        {!mapSide && (
        <button
          type="button"
          onClick={() => setShowMap((m) => !m)}
          className={`rounded-full border px-3.5 py-2 text-[11.5px] font-semibold transition-colors ${showMap ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink"}`}
        >
          {showMap ? "Hide map" : "Map"}
        </button>
        )}
      </div>

      {/* The radius only exists where there is a place to measure from. */}
      {centre ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          <span>Within</span>
          {MILES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setWithin(within === m ? null : m)}
              className={`rounded-full border px-3 py-1 font-semibold transition-colors ${within === m ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink"}`}
            >
              {m} mi
            </button>
          ))}
          <span className="min-w-0 truncate">
            of {centre.own ? centre.label : `${centre.label}, the property they enquired about`}
          </span>
        </div>
      ) : (
        <p className="mb-3 text-[11px] text-muted">
          No address on this lead and no property on the enquiry, so there is nothing to measure a
          radius from yet.
        </p>
      )}

      {showMap && !mapSide && (
        <SearchMap origin={centre?.at ?? null} within={within} results={results} className="mb-3" />
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <span>
          {book === null && !failed ? "Reading the book…" : `${results.length} of ${available.length} available`}
        </span>
        {filtered && (
          <button type="button" onClick={clear} className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-dark">
            Clear filters
          </button>
        )}
      </div>

      {failed ? (
        <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12px] text-accent-dark">{failed}</p>
      ) : book === null ? (
        <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12px] text-muted">Reading the book…</p>
      ) : results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12px] text-muted">
          Nothing matches. Widen the radius or clear a filter.
        </p>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 ${mapSide ? "" : "xl:grid-cols-3"}`}>
          {results.slice(0, 60).map(({ l, miles }) => {
            const on = shortlisted.includes(l.id);
            return (
              <div key={l.id} className="overflow-hidden rounded-2xl border border-line/60">
                <PropertyPhoto src={l.image} className="h-28 w-full" />
                <div className="p-3">
                  <p className="hand truncate text-[12.5px]">{l.name}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-muted">
                    {l.locality}
                    {miles != null && <span> · {miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi</span>}
                  </p>
                  <p className="figures mt-1.5 text-[14px]">
                    {money(l.rentMonthly ?? l.rent)}
                    <span className="text-[10px] text-muted"> pcm</span>
                    {l.propertyType && <span className="ml-1.5 text-[10px] text-muted">{l.propertyType}</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {onShortlist && (
                      <button
                        type="button"
                        disabled={on}
                        onClick={() => onShortlist(l)}
                        className="rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-45"
                      >
                        {on ? "On the list" : "Add to list"}
                      </button>
                    )}
                    {/* Open the property itself, like a comparable on a market appraisal. */}
                    <a
                      href={`/listings?open=${l.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold transition-colors hover:border-ink/40"
                    >
                      Open
                    </a>
                    {onBook && (
                      <button
                        type="button"
                        onClick={() => onBook(l)}
                        className="rounded-full bg-ink px-2.5 py-1 text-[10.5px] font-semibold text-page"
                      >
                        Book viewing
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {results.length > 60 && (
        <p className="mt-3 text-[11px] text-muted">Showing the nearest 60. Narrow the radius or the rent to see fewer.</p>
      )}
    </div>
  );
  if (!mapSide) return list;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-0 lg:self-start">
        <SearchMap origin={centre?.at ?? null} within={within} results={results} tall />
      </div>
      <div className="min-w-0">{list}</div>
    </div>
  );
}

/** The same properties, on a map, with the radius drawn round the tenant. */
function SearchMap({
  origin, within, results, className = "", tall = false,
}: {
  origin: { lat: number; lng: number } | null;
  within: number | null;
  results: { l: Listing; miles: number | null }[];
  className?: string;
  /** The finder's map, the height of the window rather than a strip. */
  tall?: boolean;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const drawn = useRef<google.maps.MVCObject[]>([]);
  const [failed, setFailed] = useState(false);

  const paint = useCallback(() => {
    const g = (window as unknown as { google?: typeof google }).google;
    if (!g || !map.current) return;
    for (const d of drawn.current) (d as unknown as { setMap: (m: null) => void }).setMap(null);
    drawn.current = [];

    const bounds = new g.maps.LatLngBounds();
    for (const { l } of results) {
      if (l.lat == null || l.lng == null) continue;
      const at = { lat: l.lat, lng: l.lng };
      const marker = new g.maps.Marker({
        position: at,
        map: map.current,
        title: `${l.name} — £${(l.rentMonthly ?? l.rent ?? 0).toLocaleString("en-GB")} pcm`,
      });
      drawn.current.push(marker);
      bounds.extend(at);
    }
    if (origin) {
      const here = new g.maps.Marker({
        position: origin,
        map: map.current,
        title: "The tenant",
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#a9463a", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
      drawn.current.push(here);
      bounds.extend(origin);
      if (within != null) {
        const circle = new g.maps.Circle({
          map: map.current,
          center: origin,
          radius: within * 1609.34,
          strokeColor: "#a9463a",
          strokeOpacity: 0.5,
          strokeWeight: 1,
          fillColor: "#a9463a",
          fillOpacity: 0.06,
        });
        drawn.current.push(circle);
        bounds.union(circle.getBounds() ?? bounds);
      }
    }
    if (!bounds.isEmpty()) map.current.fitBounds(bounds, 32);
  }, [results, origin, within]);

  useEffect(() => {
    let live = true;
    loadGoogle()
      .then(async () => {
        if (!live || !holder.current) return;
        const g = (window as unknown as { google?: typeof google }).google;
        if (!g) return;
        /* Wait for the panel to have a height before creating the map. Built
           into a box that is still zero-high, Google renders a grey pane and
           never recovers on its own. */
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (!live || !holder.current) return;
        map.current = new g.maps.Map(holder.current, {
          center: origin ?? { lat: 52.6, lng: -1.1 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        paint();
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { paint(); }, [paint]);
  /* A panel that appears after the map was built needs telling. */
  useEffect(() => {
    const t = setTimeout(() => {
      const g = (window as unknown as { google?: typeof google }).google;
      if (g && map.current) g.maps.event.trigger(map.current, "resize");
    }, 250);
    return () => clearTimeout(t);
  }, []);

  if (failed) {
    return (
      <p className={`rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[11.5px] text-muted ${className}`}>
        The map needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY on this environment. The list below is unaffected.
      </p>
    );
  }
  return <div ref={holder} className={`${tall ? "h-[64vh] min-h-[380px]" : "h-[320px]"} w-full overflow-hidden rounded-2xl border border-line/70 ${className}`} />;
}
