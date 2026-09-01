import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * A freetext address → a point on the map.
 *
 * Separate from the address LOOKUP in app/api/address, which is a different
 * job: lookup is a person typing and choosing from a dropdown, and it hands
 * back coordinates as a by-product. This is for the addresses we already
 * hold as plain strings — a lead's "12 Elm Gardens, Didsbury M20" that was
 * captured before lookup existed, or came in from REX, and has no
 * coordinates anywhere on it.
 *
 * Uses the Geocoding API on the server key. Measured working 1 Sep 2026,
 * unlike Routes — the two are enabled separately, so one can answer while the
 * other refuses. See lib/travel.ts.
 *
 * Cached hard and effectively forever: a house does not move. Everything that
 * wants a travel time starts here, so an uncached geocode would mean paying
 * Google twice for every glance at the same property.
 */

export type Geocoded = {
  lat: number;
  lng: number;
  postcode: string | null;
  tidied: string;
  /**
   * Whether this is the BUILDING or just the area it's in.
   *
   * Most landlord leads carry an area, not an address — REX fills `area` from
   * `adr_suburb_or_town` or the outward postcode, so the booker is routinely
   * handed "Salford M7". Google geocodes that perfectly happily and returns
   * the centroid of the district, which can be a couple of miles and ten
   * minutes from the actual doorstep.
   *
   * Nothing downstream can tell the difference by looking at the coordinates,
   * so it has to be carried. A travel time to the middle of M7 presented as a
   * travel time to the property is precisely the confidently-wrong number this
   * codebase keeps getting bitten by.
   */
  precise: boolean;
  /** What Google actually matched, for the caveat line: "the M7 area". */
  matched: string | null;
};

const key = () => (process.env.GOOGLE_MAPS_API_KEY ?? "").trim();

const CACHE_MS = 180 * 24 * 60 * 60 * 1000; // six months

/* v2: `precise` and `matched` were added to Geocoded. The version MUST be
   bumped whenever the cached shape gains a field, or every already-cached
   address keeps answering in the old shape and the change looks like it
   never landed. */
function cacheKey(address: string): string {
  return `geocode:v2:${address.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 180)}`;
}

async function cached(k: string): Promise<Geocoded | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { hit: Geocoded }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [k]
    );
    if (!rows[0]) return null;
    if (Date.now() - new Date(rows[0].computed_at).getTime() > CACHE_MS) return null;
    return rows[0].payload.hit;
  } catch {
    return null;
  }
}

async function keep(k: string, hit: Geocoded): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [k, JSON.stringify({ hit })]
    );
  } catch {
    /* slow, not broken */
  }
}

export type GeocodeAnswer =
  | { ok: true; at: Geocoded }
  | { ok: false; problem: { code: string; says: string } };

export async function geocode(address: string): Promise<GeocodeAnswer> {
  const clean = address.trim();
  if (clean.length < 4) {
    return { ok: false, problem: { code: "too_short", says: "That isn't enough of an address to place on a map." } };
  }
  const KEY = key();
  if (!KEY) {
    return {
      ok: false,
      problem: { code: "no_key", says: "GOOGLE_MAPS_API_KEY isn't set here, so addresses can't be placed on a map." },
    };
  }

  const k = cacheKey(clean);
  const hit = await cached(k);
  if (hit) return { ok: true, at: hit };

  let body: unknown;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(clean)}&region=gb&key=${KEY}`,
      { cache: "no-store" }
    );
    body = await res.json().catch(() => null);
  } catch (e) {
    return {
      ok: false,
      problem: {
        code: "unreachable",
        says: `Couldn't reach Google's geocoder: ${e instanceof Error ? e.message : "network error"}.`,
      },
    };
  }

  const j = body as {
    status?: string;
    error_message?: string;
    results?: {
      geometry?: { location?: { lat: number; lng: number }; location_type?: string };
      formatted_address?: string;
      types?: string[];
      address_components?: { types?: string[]; long_name?: string }[];
    }[];
  };

  /* ZERO_RESULTS is a real answer, not a fault — "Didsbury M20" on its own
     genuinely isn't a place. It gets its own words so nobody goes looking at
     the key when the problem is the address. */
  if (j?.status === "ZERO_RESULTS") {
    return {
      ok: false,
      problem: { code: "not_found", says: "Google couldn't find that address on the map." },
    };
  }
  if (j?.status === "REQUEST_DENIED") {
    return {
      ok: false,
      problem: {
        code: "denied",
        says:
          "Google refused the geocode: " +
          `${j.error_message ?? "permission denied"}. The Geocoding API may not be on this key.`,
      },
    };
  }
  if (j?.status === "OVER_QUERY_LIMIT") {
    return { ok: false, problem: { code: "quota", says: "Google's geocoding quota for this key is exhausted." } };
  }

  const first = j?.results?.[0];
  const loc = first?.geometry?.location;
  if (j?.status !== "OK" || !loc) {
    return { ok: false, problem: { code: "error", says: `Google's geocoder answered ${j?.status ?? "nothing"}.` } };
  }

  /* ROOFTOP is the building. RANGE_INTERPOLATED is guessed along a street and
     is close enough to drive to. GEOMETRIC_CENTER and APPROXIMATE are the
     middle of a road, a district or a town — good enough to draw a map, not
     good enough to promise a doorstep. `street_address` / `premise` in types
     is the second opinion, because location_type alone calls a whole postcode
     sector GEOMETRIC_CENTER on some UK results. */
  const locType = first?.geometry?.location_type ?? "";
  const types = first?.types ?? [];
  const precise =
    locType === "ROOFTOP" ||
    locType === "RANGE_INTERPOLATED" ||
    types.includes("street_address") ||
    types.includes("premise") ||
    types.includes("subpremise");

  const at: Geocoded = {
    lat: loc.lat,
    lng: loc.lng,
    postcode: (first?.address_components ?? []).find((c) => c.types?.includes("postal_code"))?.long_name ?? null,
    tidied: first?.formatted_address ?? clean,
    precise,
    matched: first?.formatted_address ?? null,
  };
  await keep(k, at);
  return { ok: true, at };
}
