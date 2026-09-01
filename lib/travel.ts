import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * How long it actually takes to drive there.
 *
 * A diary planned on gaps books a 10:00 in Luton and an 11:00 in Salford and
 * looks fine. The question an agent is really asking a calendar is not "am I
 * free" but "can I get there", and until this file existed the OS could not
 * answer it — the booker drew a straight-line mileage on each block, which is
 * a number no car has ever driven.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────
 *
 * If Google will not answer, this returns a PROBLEM. It never estimates, and
 * it must never grow a "roughly 2 minutes per mile" fallback, however
 * tempting that looks on a screen with a blank in it. A made-up travel time
 * is worse than no travel time: nobody double-checks a number the software
 * stated, and the failure mode is an agent standing on the wrong doorstep
 * apologising. Same reason no tile in this product carries a snapshot.
 *
 * ── Which Google API, and why ─────────────────────────────────────────────
 *
 * Routes API (`computeRoutes`), not the legacy Distance Matrix, which is
 * deprecated for new projects. It needs BOTH of:
 *
 *   1. Routes API enabled on Google Cloud project 568433104017
 *   2. Routes API added to GOOGLE_MAPS_API_KEY's API restrictions
 *
 * Measured 1 Sep 2026: neither was true, so every call came back
 * `403 API_KEY_SERVICE_BLOCKED`. Geocoding on the same key worked, which is
 * exactly the sort of half-working that reads as "the code is broken".
 *
 * Use GOOGLE_MAPS_API_KEY (server, API-locked). NOT the NEXT_PUBLIC_ one —
 * that is referrer-locked for the browser map and answers 403 from a server.
 * See app/api/address/route.ts for the full history of that trap.
 */

export type Point = { lat: number; lng: number };

export type TravelLeg = {
  minutes: number;
  miles: number;
  /** Traffic was modelled for the departure time we asked about. */
  withTraffic: boolean;
};

export type TravelProblem = { code: string; says: string };

export type TravelAnswer =
  | { ok: true; leg: TravelLeg; cached: boolean }
  | { ok: false; problem: TravelProblem };

const key = () => (process.env.GOOGLE_MAPS_API_KEY ?? "").trim();

/** What went wrong, in words that name the screen to go and fix it on. */
function problemFor(status: number, body: unknown): TravelProblem {
  const err = (body as { error?: { message?: string; details?: { reason?: string }[] } })?.error;
  const reason = err?.details?.find((d) => d?.reason)?.reason ?? "";

  if (reason === "API_KEY_SERVICE_BLOCKED" || /has not been used|is disabled/i.test(err?.message ?? "")) {
    return {
      code: "routes_not_enabled",
      says:
        "Travel times need the Routes API, which is not switched on for this key. In the Google " +
        "Cloud console: enable Routes API on the project, then add it to GOOGLE_MAPS_API_KEY's " +
        "API restrictions.",
    };
  }
  if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
    return {
      code: "key_is_a_browser_key",
      says:
        "GOOGLE_MAPS_API_KEY is a referrer-restricted browser key, so a call from the server is " +
        "refused. It needs the API-restricted key instead.",
    };
  }
  if (status === 403 || status === 401) {
    return { code: "denied", says: `Google refused the route: ${err?.message ?? "permission denied"}.` };
  }
  if (status === 429) {
    return { code: "quota", says: "Google's routing quota for this key is exhausted." };
  }
  return { code: "error", says: `Google's routing answered ${status}.` };
}

/**
 * Cache key. Coordinates round to ~110m and the time to the hour of the week,
 * because the useful question is "what is this drive like on a Tuesday
 * teatime", not "what is it like at 16:47 on the 4th". Two agents booking
 * near the same street on the same afternoon share one answer.
 */
function cacheKey(from: Point, to: Point, when: Date | null): string {
  const r = (n: number) => n.toFixed(3);
  const slot = when ? `${when.getDay()}-${when.getHours()}` : "now";
  return `travel:v1:${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}@${slot}`;
}

const CACHE_MS = 6 * 60 * 60 * 1000;

async function cached(k: string): Promise<TravelLeg | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { leg: TravelLeg }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [k]
    );
    if (!rows[0]) return null;
    if (Date.now() - new Date(rows[0].computed_at).getTime() > CACHE_MS) return null;
    return rows[0].payload.leg;
  } catch {
    return null;
  }
}

async function keep(k: string, leg: TravelLeg): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [k, JSON.stringify({ leg })]
    );
  } catch {
    /* a cache that won't write is slow, not broken */
  }
}

/**
 * Drive time between two points.
 *
 * `arriveBy` is the appointment's own start time, and it is passed to Google
 * as the DEPARTURE time rather than an arrival one. That is deliberate and
 * slightly wrong on purpose: asking "leave at 08:00" and "arrive by 08:00"
 * differ by the length of the journey itself, which is the thing we are
 * trying to find out, and one call at the appointment's hour lands in the
 * right traffic band. Rush hour is an hour wide; the circularity is minutes.
 */
export async function driveTime(
  from: Point,
  to: Point,
  arriveBy: Date | null = null
): Promise<TravelAnswer> {
  const KEY = key();
  if (!KEY) {
    return {
      ok: false,
      problem: {
        code: "no_key",
        says: "GOOGLE_MAPS_API_KEY isn't set on this environment, so travel times can't be worked out.",
      },
    };
  }
  if (![from.lat, from.lng, to.lat, to.lng].every((n) => Number.isFinite(n))) {
    return { ok: false, problem: { code: "no_coords", says: "One of those places has no coordinates." } };
  }

  const k = cacheKey(from, to, arriveBy);
  const hit = await cached(k);
  if (hit) return { ok: true, leg: hit, cached: true };

  /* TRAFFIC_AWARE needs a departure time in the FUTURE. A slot booked for
     later today qualifies; anything already past falls back to "now", which
     is the honest reading of a journey you'd be making immediately. */
  const soon = Date.now() + 60_000;
  const departure = arriveBy && arriveBy.getTime() > soon ? arriveBy : null;

  let res: Response;
  try {
    res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        ...(departure ? { departureTime: departure.toISOString() } : {}),
        regionCode: "GB",
        units: "IMPERIAL",
      }),
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      problem: {
        code: "unreachable",
        says: `Couldn't reach Google's routing: ${e instanceof Error ? e.message : "network error"}.`,
      },
    };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, problem: problemFor(res.status, body) };

  const route = (body as { routes?: { duration?: string; distanceMeters?: number }[] })?.routes?.[0];
  if (!route?.duration) {
    /* No route at all — an island, a typo'd geocode, or a sea in the way.
       Saying so beats drawing a zero. */
    return {
      ok: false,
      problem: { code: "no_route", says: "Google couldn't find a driving route between those two places." },
    };
  }

  // Durations come back as protobuf seconds: "1284s".
  const seconds = Number(String(route.duration).replace(/s$/, ""));
  if (!Number.isFinite(seconds)) {
    return { ok: false, problem: { code: "error", says: "Google's routing sent a duration we couldn't read." } };
  }

  const leg: TravelLeg = {
    minutes: Math.max(1, Math.round(seconds / 60)),
    miles: Math.round(((route.distanceMeters ?? 0) / 1609.344) * 10) / 10,
    withTraffic: Boolean(departure),
  };
  await keep(k, leg);
  return { ok: true, leg, cached: false };
}

/**
 * Round a journey up to something a person would actually set aside.
 *
 * Nobody blocks out 23 minutes. Rounding to the next five, with a small
 * allowance for parking and finding the door, turns a routing answer into a
 * buffer somebody will keep rather than quietly delete.
 */
export function bufferMinutes(minutes: number): number {
  const withParking = minutes + 5;
  return Math.min(180, Math.ceil(withParking / 5) * 5);
}
