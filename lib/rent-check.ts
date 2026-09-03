import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The rent check: what similar homes nearby have been advertised at.
 *
 * Built from our own sweep, nothing bought in. Twelve months of lettings
 * adverts in the same district, the same kind of home (house or flat) and
 * the same number of bedrooms, the nearest sector first. The figure is the
 * median asking rent and the range is the middle half; the page says
 * "advertised" every time because that is what it is, not what was paid.
 *
 * Below eight matches it widens to a bedroom either side, and says so.
 * Below four it gives no figure at all: a rent check built on two adverts
 * is a guess with a number on it.
 */

export interface Comparable {
  street: string;
  area: string;
  beds: number | null;
  type: string | null;
  rent: number;
  when: string;
  status: string;
}

export interface RentCheck {
  estimate: { median: number; low: number; high: number; count: number } | null;
  basis: string;
  comparables: Comparable[];
}

const isFlat = (t: string | null | undefined) => /flat|apartment|maisonette|studio/i.test(t ?? "");

interface Row extends Record<string, unknown> {
  address: string;
  street: string | null;
  postcode: string;
  sector: string;
  beds: number | null;
  property_type: string | null;
  rent: number;
  status: string;
  listed_on: string | null;
  let_agreed_at: string | null;
}

const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
};

export async function rentCheck(p: { district: string | null; sector: string | null; beds: number | null; property_type: string | null; address?: string }): Promise<RentCheck> {
  const none: RentCheck = { estimate: null, basis: "Not enough similar homes have been advertised nearby in the last year to give a figure.", comparables: [] };
  if (!hasDb() || !p.district) return none;
  const rows = await q<Row>(
    `SELECT address, street, postcode, sector, beds, property_type, rent, status, listed_on::text AS listed_on, let_agreed_at::date::text AS let_agreed_at
       FROM os_listing_capture
      WHERE market = 'let' AND rent IS NOT NULL AND rent > 0 AND district = $1
        AND coalesce(listed_on, first_seen::date) > CURRENT_DATE - INTERVAL '12 months'
      ORDER BY (sector = $2) DESC, coalesce(let_agreed_at::date, listed_on, first_seen::date) DESC`,
    [p.district.toUpperCase(), (p.sector ?? "").toUpperCase()]
  );
  const flat = isFlat(p.property_type);
  const kind = rows.filter((r) => isFlat(r.property_type) === flat);
  let pool = p.beds != null ? kind.filter((r) => r.beds === p.beds) : kind;
  let widened = false;
  if (pool.length < 8 && p.beds != null) {
    pool = kind.filter((r) => r.beds != null && Math.abs(r.beds - p.beds!) <= 1);
    widened = true;
  }
  /* The property itself is not its own comparable. */
  if (p.address) {
    const own = p.address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    pool = pool.filter((r) => r.address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() !== own);
  }
  if (pool.length < 4) return none;
  const rents = pool.map((r) => Number(r.rent)).sort((a, b) => a - b);
  const what = `${p.beds != null ? `${widened ? `${Math.max(1, p.beds - 1)} to ${p.beds + 1}` : p.beds}-bed ` : ""}${flat ? "flats" : "houses"}`;
  const seen = new Set<string>();
  const comparables: Comparable[] = [];
  for (const r of pool) {
    const key = r.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    comparables.push({
      street: (r.street ?? r.address.split(",")[0]).replace(/^\d+[a-z]?\s+/i, "").trim() || "Nearby",
      area: r.postcode.split(" ")[0],
      beds: r.beds,
      type: r.property_type,
      rent: Number(r.rent),
      when: (r.let_agreed_at ?? r.listed_on ?? "").slice(0, 7),
      status: r.status === "let agreed" ? "let agreed" : "advertised",
    });
    if (comparables.length === 5) break;
  }
  return {
    estimate: { median: percentile(rents, 0.5), low: percentile(rents, 0.25), high: percentile(rents, 0.75), count: pool.length },
    basis: `${pool.length} ${what} advertised to let in ${p.district.toUpperCase()} in the last twelve months`,
    comparables,
  };
}
