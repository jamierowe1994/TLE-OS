/**
 * The homes on the market as the tenant portal shows them, and the sums a
 * search makes over them. Pure: the browser filters with the same functions
 * the server's alert matching uses, so a home that shows on the page is the
 * home an alert would send (lib/tenant-homes reads them).
 */

export type MarketHome = {
  id: string;
  name: string;
  locality: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  /** As advertised - never convert a weekly rent for display. */
  rent: number;
  rentPeriod: "month" | "week";
  /** Monthly, for filtering and sorting only. */
  rentPcm: number;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  photo: string | null;
  photoCount: number;
  availableFrom: string | null;
  publishedAt: string | null;
  heading: string | null;
};

export type MarketHomeDetail = MarketHome & { images: string[]; body: string | null };

export type HomesAnswer = { ok: true; homes: MarketHome[] } | { ok: false; error: string };

/** Miles between two points, as the crow flies. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ── What they are after ────────────────────────────────────────────────── */

export type HomeFilter = { lat: number | null; lng: number | null; radiusMiles: number | null; minBeds: number | null; maxRent: number | null; type: "house" | "flat" | null };

export const isFlat = (t: string | null) => /flat|apartment|maisonette|studio|room/i.test(t ?? "");

/** Whether a home fits. Anything we cannot answer (no beds, no point) passes. */
export function fits(h: MarketHome, f: HomeFilter): boolean {
  if (f.maxRent && h.rentPcm > f.maxRent) return false;
  if (f.minBeds && h.beds != null && h.beds < f.minBeds) return false;
  if (f.type && h.propertyType) {
    if (f.type === "flat" && !isFlat(h.propertyType)) return false;
    if (f.type === "house" && isFlat(h.propertyType)) return false;
  }
  if (f.radiusMiles && f.lat != null && f.lng != null && h.lat != null && h.lng != null) {
    if (milesBetween({ lat: f.lat, lng: f.lng }, { lat: h.lat, lng: h.lng }) > f.radiusMiles) return false;
  }
  return true;
}

/** A search in words, the same on the page and in the alert email:
 *  "2+ bed houses, within 5 miles of your home, up to £1,250 a month". */
export function describeSearch(f: { radiusMiles: number | null; minBeds: number | null; maxRent: number | null; type: "house" | "flat" | null }, place: string | null): string {
  const what = [f.minBeds ? `${f.minBeds}+ bed` : null, f.type === "house" ? "houses" : f.type === "flat" ? "flats" : "homes"].filter(Boolean).join(" ");
  return [
    what.charAt(0).toUpperCase() + what.slice(1),
    f.radiusMiles && place ? `within ${f.radiusMiles} ${f.radiusMiles === 1 ? "mile" : "miles"} of ${place}` : "anywhere we let",
    f.maxRent ? `up to £${f.maxRent.toLocaleString("en-GB")} a month` : null,
  ].filter(Boolean).join(", ");
}
