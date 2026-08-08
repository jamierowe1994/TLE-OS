"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The filter row every people-picker shares: a name search, and a radius
 * search from a typed postcode. Built once because James asked for it in
 * three places at once — the viewing picker, the email-to-tenants list, and
 * anywhere else the book gets picked from.
 *
 * Recency is the DEFAULT order and is the caller's job (the book is already
 * newest-first); this component only narrows, never reorders.
 *
 * The radius centre resolves through /api/address — type a postcode, and the
 * same Google plumbing the rest of the app uses turns it into a point. No
 * centre, no radius filtering; typing garbage just leaves the list alone.
 */

export type GeoPoint = { lat: number; lng: number };

export type Filters = {
  query: string;
  centre: GeoPoint | null;
  centreLabel: string;
  miles: number;
};

export const NO_FILTERS: Filters = { query: "", centre: null, centreLabel: "", miles: 5 };

/** Great-circle distance in miles — plenty for "within 5 miles of LU1". */
export function milesBetween(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Does this person survive the filters? No coords = fails a radius filter,
 *  because "unknown address" and "nearby" are different claims. */
export function passesFilters(
  p: { name: string; lat?: number | null; lng?: number | null },
  f: Filters
): boolean {
  if (f.query && !p.name.toLowerCase().includes(f.query.toLowerCase())) return false;
  if (f.centre) {
    if (p.lat == null || p.lng == null) return false;
    if (milesBetween(f.centre, { lat: p.lat, lng: p.lng }) > f.miles) return false;
  }
  return true;
}

export default function PeopleFilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);

  /** Postcode → point, via the app's own resolver. */
  async function locate() {
    const q = place.trim();
    if (!q) {
      onChange({ ...filters, centre: null, centreLabel: "" });
      return;
    }
    setBusy(true);
    try {
      const sug = await fetch(`/api/address?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json());
      const first = sug?.suggestions?.[0];
      if (!first) return;
      const res = await fetch(`/api/address?resolve=${encodeURIComponent(first.id)}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (res?.lat != null && res?.lng != null) {
        onChange({
          ...filters,
          centre: { lat: res.lat, lng: res.lng },
          centreLabel: res.postcode ?? q.toUpperCase(),
        });
      }
    } catch {
      /* an unresolvable centre just means no radius filter */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="flex min-w-[160px] flex-1 items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
        <DoodleIcon name="search" size={13} className="shrink-0 text-muted" />
        <input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Search names…"
          className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
        />
      </label>

      <label className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
        <DoodleIcon name="target" size={13} className="shrink-0 text-muted" />
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          onBlur={() => void locate()}
          onKeyDown={(e) => e.key === "Enter" && void locate()}
          placeholder="Postcode…"
          className="w-24 bg-transparent text-[12px] outline-none placeholder:text-muted/70"
        />
      </label>

      <select
        value={filters.miles}
        onChange={(e) => onChange({ ...filters, miles: Number(e.target.value) })}
        className="rounded-full border border-line/80 bg-transparent px-3 py-2 text-[12px] outline-none"
      >
        {[1, 3, 5, 10, 20].map((m) => (
          <option key={m} value={m}>
            within {m} mi
          </option>
        ))}
      </select>

      {busy && (
        <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
      )}
      {filters.centre && (
        <button
          type="button"
          onClick={() => {
            setPlace("");
            onChange({ ...filters, centre: null, centreLabel: "" });
          }}
          className="rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-semibold text-accent-dark"
          title="Clear the radius"
        >
          near {filters.centreLabel} ✕
        </button>
      )}
    </div>
  );
}
