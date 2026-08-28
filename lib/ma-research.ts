import "server-only";
import { fetchListingBook } from "@/lib/rex-listings";

/**
 * The research behind a market appraisal — what the property is worth, and the
 * evidence for saying so.
 *
 * ── WHERE THE NUMBERS COME FROM, AND WHY ──────────────────────────────────
 *
 * **Comparables come from OUR OWN REX BOOK, not a data provider.** That was a
 * deliberate choice and it is the stronger one for lettings: we hold ~293
 * current rentals with real asking rents, real bed counts and real days on
 * market. A landlord asking "what will it let for" is best answered with
 * "here are four we are letting nearby, at these rents, and this one went in
 * nine days" — properties we can actually speak to. A third-party feed cannot
 * be spoken to.
 *
 * **Area averages come from Homesearch**, which is proven and live:
 * `area_statistics/lettings/avg_price_on_market` returns an average asking
 * rent for a postcode sector and bed count. That is the only lettings
 * statistic confirmed working on our token — several sibling endpoints that
 * looked obvious (avg_time_on_market, properties_on_market) all 404, so do not
 * assume a family of them exists.
 *
 * ── THE TRAP THAT WOULD EMBARRASS US IN FRONT OF A LANDLORD ───────────────
 *
 * **Homesearch's `match_address` silently returns a DIFFERENT PROPERTY.**
 * Measured 23 Aug 2026: asking for "18 Ashworth Rise, LU2 7QP" returned
 * "18 Knoll Rise, Luton, LU2 7JA" — different street, different postcode, and
 * a confident 200 with no warning. Presenting that property's valuation to a
 * landlord as theirs is the single worst thing this feature could do.
 *
 * So every match is CHECKED before it is used: the postcode must agree and the
 * address must share a building number. A match that fails is discarded and
 * the panel says the address could not be confirmed, which an agent can act on.
 * Never trust `hs_id` alone.
 */

import { shapeMaterialInfo, type MaterialInfo, type MatInfoRaw } from "@/lib/matinfo";

const HS = "https://data.homesearch.co.uk/avi/api/v1";

function hsAuth(): Record<string, string> | undefined {
  const t = process.env.HOMESEARCH_TOKEN;
  return t ? { Authorization: `Bearer ${t}` } : undefined;
}

async function hsJson<T>(path: string): Promise<T | null> {
  const headers = hsAuth();
  if (!headers) return null;
  try {
    const r = await fetch(`${HS}/${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/* ── address safety ───────────────────────────────────────────────────────── */

const normPc = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** Every building-ish number in an address, postcode digits removed. */
function numbersIn(address: string): Set<string> {
  const noPc = address.replace(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/gi, "");
  return new Set((noPc.match(/\b\d+[a-zA-Z]?\b/g) ?? []).map((n) => n.toLowerCase()));
}

/**
 * Is the thing Homesearch returned actually the property we asked about?
 *
 * Postcode must agree exactly, and the two addresses must share at least one
 * building number. Both are needed: postcode alone passes a neighbour, numbers
 * alone passed "18 Knoll Rise" for "18 Ashworth Rise".
 */
export function matchIsTrustworthy(asked: string, askedPc: string, got: string): boolean {
  if (!got) return false;
  const gotPc = got.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0];
  if (!gotPc || normPc(gotPc) !== normPc(askedPc)) return false;
  const a = numbersIn(asked);
  if (!a.size) return false;
  for (const n of numbersIn(got)) if (a.has(n)) return true;
  return false;
}

/** "LU2 7QP" → "LU2 7", the sector Homesearch's area stats are keyed on. */
export function sectorOf(postcode: string): string | null {
  const m = postcode.trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** "LU2 7QP" → "LU2". */
export function districtOf(postcode: string): string | null {
  return postcode.trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)/)?.[1] ?? null;
}

/** "LU2 7QP" → "LU". */
export function areaOf(postcode: string): string | null {
  return postcode.trim().toUpperCase().match(/^([A-Z]{1,2})/)?.[1] ?? null;
}

/**
 * THE AREA STATISTICS ARE ONLY THREE, and that is the API, not an oversight.
 *
 * Measured against the live token: `area_statistics/lettings/` exposes
 * `avg_price_on_market`, `on_market_count` and `off_market_count`. Nothing
 * else. `avg_time_on_market`, `properties_on_market`, price bands and trends
 * all 404 — they were guesses, and the sibling-endpoint assumption was wrong.
 *
 * **Time to let therefore has to be computed**, from `listed_on` on the
 * listings feed. There is no endpoint for it anywhere and Fine & Country
 * derive it the same way.
 *
 * Note the path says `lettings` while the listings routes say `let`. Getting
 * that backwards returns a 404 with no hint.
 */
const AREA_STATS = ["avg_price_on_market", "on_market_count", "off_market_count"] as const;

async function marketFor(sector: string, beds: number) {
  const q = `sectors%5B%5D=${encodeURIComponent(sector)}&beds%5B%5D=${beds}`;
  const [avg, on, off] = await Promise.all(
    AREA_STATS.map((m) => hsJson<{ avg_price?: number; count?: number }>(`area_statistics/lettings/${m}?${q}`))
  );
  const onMarket = typeof on?.count === "number" ? on.count : null;
  const offMarket = typeof off?.count === "number" ? off.count : null;
  const total = (onMarket ?? 0) + (offMarket ?? 0);
  return {
    avgRent: typeof avg?.avg_price === "number" && avg.avg_price > 0 ? avg.avg_price : null,
    market:
      onMarket == null && offMarket == null
        ? null
        : {
            onMarket,
            offMarket,
            // How much of the local stock is actually available. A low number
            // is the argument for pricing confidently.
            availabilityPct: total > 0 && onMarket != null ? Math.round((onMarket / total) * 1000) / 10 : null,
          },
  };
}

/**
 * Homesearch wraps rows differently per endpoint, and getting it wrong reads
 * as "no results" rather than as an error.
 *
 * MEASURED: `current_listings_crm/search/let/` returns
 * `{ data, total, limit, offset }`. An extractor that only knew `results`
 * returned an empty array against a 200 carrying five properties — a silent,
 * confident zero, which is the same class of bug as REX's rejected search.
 *
 * One tolerant reader, used everywhere, rather than a guess per call site.
 */
function hsRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const o = raw as { data?: unknown; results?: unknown; items?: unknown } | null;
  for (const v of [o?.data, o?.results, o?.items]) if (Array.isArray(v)) return v as T[];
  return [];
}

/**
 * Material information and the AVM, for a property we have already confirmed.
 *
 * Two calls in parallel because they are independent and both are cheap.
 * `quick_valuation` is allowed to fail on its own — it is a nice-to-have sale
 * estimate, and losing it must not cost us tenure and council tax band.
 *
 * NOT called here: `property/similar_on_market/{hs_id}`, which returns 403 on
 * our token. Recorded rather than silently omitted so nobody re-adds it.
 */
async function materialFor(hsId: number): Promise<MaterialInfo | null> {
  const [raw, val] = await Promise.all([
    hsJson<MatInfoRaw | { data?: MatInfoRaw }>(`matinfo/basic/${hsId}`),
    hsJson<{ price?: number; price_last_sold?: number; last_sold_date?: string }>(
      `property/quick_valuation/${hsId}`
    ),
  ]);
  if (!raw) return null;
  const m = ("data" in (raw as object) ? (raw as { data?: MatInfoRaw }).data : raw) as MatInfoRaw;
  if (!m || typeof m !== "object") return null;

  const valuation = val
    ? {
        estimate: val.price ?? null,
        lastSold: val.price_last_sold ?? null,
        lastSoldDate: val.last_sold_date ?? null,
      }
    : null;
  return shapeMaterialInfo(hsId, m, valuation);
}

interface HsListing {
  street?: string; postcode?: string; type?: string; beds?: number;
  agent?: string; price?: number; image?: string; listed_on?: string;
  full_address?: string; reduced_at?: string;
}

/**
 * What is on the market nearby, WITH PHOTOGRAPHS.
 *
 * `current_listings_crm/search/let/` — and the `let` flavour is fully
 * supported, which was the open question. Two encoding quirks that return a
 * bare 404 if you get them wrong: the trailing slash before the query string
 * is required, and `sectors[]` must be repeated rather than comma-joined.
 *
 * `date_listed_from` is always sent because omitting it silently narrows the
 * window rather than widening it.
 */
/**
 * Postcode → lat/lon, via postcodes.io.
 *
 * ONS open data, no key, no rate limit worth worrying about. Homesearch has no
 * geocoder of its own and — see below — no radius parameter either, so this is
 * the only way to ask "within N miles".
 *
 * A failure is not fatal: the caller falls back to the sector, which is what
 * the feed did before radius existed.
 */
const geoCache = new Map<string, { lat: number; lon: number } | null>();

async function geocode(postcode: string): Promise<{ lat: number; lon: number } | null> {
  const key = postcode.trim().toUpperCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { result?: { latitude?: number; longitude?: number } };
    const lat = j.result?.latitude;
    const lon = j.result?.longitude;
    const out = typeof lat === "number" && typeof lon === "number" ? { lat, lon } : null;
    geoCache.set(key, out);
    return out;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

/**
 * What a tenant is choosing between, filtered.
 *
 * ── HOMESEARCH HAS NO RADIUS PARAMETER ────────────────────────────────────
 *
 * It takes a BOUNDING BOX — north/south/east/west in decimal degrees. So a
 * radius in miles becomes a box: latitude is a constant 69 miles per degree,
 * longitude shrinks with the cosine of latitude, which at UK latitudes is
 * roughly 0.6. Omit the cosine and a "2 mile" box is nearly 3.5 miles wide and
 * 2 miles tall — an agent would be shown stock a third further away than they
 * asked for, in one direction only.
 *
 * Proven in the F&C pipeline before being written here.
 *
 * ── Why the default is the SECTOR, not two miles ──────────────────────────
 *
 * F&C default to a 2-mile radius because sales comparables are thin on the
 * ground. Lettings are not: the tight local set is usually the honest one, and
 * widening should be something an agent chooses, not something that happened
 * to them. So radius is opt-in and the sector remains the default.
 */
export interface MarketFilters {
  /** Miles. 0 or undefined means "stay in the sector". */
  radiusMiles?: number;
  beds?: number;
  minRent?: number;
  maxRent?: number;
  /** Homesearch's own type letter: H house, F flat. */
  type?: "H" | "F";
}

async function onMarketNearby(
  sector: string,
  beds?: number,
  postcode?: string,
  filters: MarketFilters = {}
): Promise<MarketListing[]> {
  const wantBeds = filters.beds ?? beds;
  const parts: string[] = [
    "date_listed_from=1900-01-01",
    "sort%5B%5D=-listed_on",
    "limit=48",
  ];

  /* Radius wins over sector when asked for and geocodable — the box IS the
     area, and sending both would intersect them and quietly return less than
     either. */
  let box: { n: number; s: number; e: number; w: number } | null = null;
  if (filters.radiusMiles && filters.radiusMiles > 0 && postcode) {
    const g = await geocode(postcode);
    if (g) {
      const dLat = filters.radiusMiles / 69;
      const dLon = filters.radiusMiles / (69 * Math.cos((g.lat * Math.PI) / 180));
      box = { n: g.lat + dLat, s: g.lat - dLat, e: g.lon + dLon, w: g.lon - dLon };
    }
  }
  if (box) {
    parts.push(`north=${box.n.toFixed(6)}`, `south=${box.s.toFixed(6)}`,
               `east=${box.e.toFixed(6)}`, `west=${box.w.toFixed(6)}`);
  } else {
    parts.push(`sectors%5B%5D=${encodeURIComponent(sector)}`);
  }

  if (wantBeds) parts.push(`beds%5B%5D=${wantBeds}`);
  if (filters.type) parts.push(`type=${filters.type}`);
  if (filters.minRent) parts.push(`price_from=${Math.round(filters.minRent)}`);
  if (filters.maxRent) parts.push(`price_to=${Math.round(filters.maxRent)}`);
  const raw = await hsJson<unknown>(`current_listings_crm/search/let/?${parts.join("&")}`);
  const rows = hsRows<HsListing>(raw);

  const today = Date.now();
  return rows
    .filter((r) => r.price && r.price > 0)
    .map((r) => {
      const listed = r.listed_on ? new Date(r.listed_on) : null;
      return {
        address: r.full_address ?? r.street ?? "Address not given",
        postcode: r.postcode ?? "",
        beds: typeof r.beds === "number" ? r.beds : null,
        type: r.type ?? null,
        rent: r.price ?? null,
        image: r.image ?? null,
        listedOn: r.listed_on ?? null,
        daysListed: listed ? Math.max(0, Math.round((today - listed.getTime()) / 86400000)) : null,
        agent: r.agent ?? null,
        reducedAt: r.reduced_at ?? null,
      };
    });
}

/* ── the research packet ──────────────────────────────────────────────────── */

export interface Comparable {
  id: string;
  name: string;
  locality: string;
  /** Monthly, normalised — a weekly rent sorted as monthly lands in the wrong
   *  band and makes the whole guide wrong. */
  rentMonthly: number;
  /** What to SHOW, which may be weekly. */
  rentDisplay: string;
  daysOnMarket: number | null;
  letAgreed: boolean;
  epcRating: string | null;
  /** How near: same sector (L34 5), same district (L34), or same area (L). */
  nearness: "sector" | "district" | "area";
}

/**
 * A property on the market near the subject, from Homesearch — with a photo.
 *
 * Distinct from `Comparable`, which comes from OUR book. This is the whole
 * local market including other agents' stock, and it is what a tenant is
 * actually choosing between. Both belong in an appraisal and they answer
 * different questions, so they are kept apart rather than merged.
 */
export interface MarketListing {
  address: string;
  postcode: string;
  beds: number | null;
  type: string | null;
  rent: number | null;
  /** The photograph. The reason this feed is worth calling at all. */
  image: string | null;
  listedOn: string | null;
  /** Derived — Homesearch has NO time-on-market endpoint, so it is computed
   *  from listed_on. Days a tenant has had the chance to take it. */
  daysListed: number | null;
  agent: string | null;
  reducedAt: string | null;
}

export interface MaResearch {
  address: string;
  postcode: string;
  sector: string | null;
  /** Null when Homesearch could not be trusted — see matchIsTrustworthy. */
  subject: { hsId: number; label: string } | null;
  addressWarning: string | null;
  /** Homesearch average asking rent for this sector and bed count. */
  areaAverage: { beds: number; avgRent: number } | null;
  /** The area picture. See MARKET_STATS below for why there are only three. */
  market: {
    onMarket: number | null;
    offMarket: number | null;
    /** On-market as a share of all known stock — how tight the sector is. */
    availabilityPct: number | null;
  } | null;
  /** What is on the market RIGHT NOW near this property, with photographs.
   *  A different question from our own comparables: this is what a tenant is
   *  choosing between, whoever is letting it. */
  onMarketNearby: MarketListing[];
  /**
   * Everything Homesearch knows about the building itself.
   *
   * Null whenever `subject` is null — and that coupling is the whole point.
   * Material information is the most quotable thing on the page: tenure,
   * council tax band, EPC. Showing a neighbour's tenure under this property's
   * address is a worse failure than showing nothing, because it is confident
   * and specific and an agent will read it out. If the address match did not
   * survive `matchIsTrustworthy`, there is no material information.
   */
  material: MaterialInfo | null;
  /** What the on-market feed was actually asked for — so the page can say so
   *  rather than leaving an agent to guess why a property is in the list. */
  marketFilters: MarketFilters & { appliedRadius: boolean };
  comparables: Comparable[];
  /** Our own book's picture, which is the honest sample size. */
  guide: {
    low: number;
    mid: number;
    high: number;
    basedOn: number;
    /** Which ring the sample came from — "area" means town-wide, not local. */
    ring: "sector" | "district" | "area";
    /** Say it plainly when the sample cannot mean much. */
    caveat: string | null;
  } | null;
  pulledAt: string;
}

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/**
 * The best-price guide.
 *
 * Quartiles, not mean ± a made-up percentage. A mean is dragged by one
 * penthouse; the middle 50% of real local asking rents is a range an agent can
 * defend line by line, because every number in it is a property we could name.
 *
 * Fewer than four comparables produces a guide with a caveat attached rather
 * than no guide at all — an agent standing in a kitchen would rather have
 * "only two nearby, treat as indicative" than a blank.
 */
function buildGuide(comps: Comparable[]): MaResearch["guide"] {
  if (!comps.length) return null;
  const rents = comps.map((c) => c.rentMonthly).sort((a, b) => a - b);
  const at = (q: number) => rents[Math.min(rents.length - 1, Math.floor(rents.length * q))];
  const ring: "sector" | "district" | "area" = comps.some((c) => c.nearness === "sector")
    ? "sector"
    : comps.some((c) => c.nearness === "district")
      ? "district"
      : "area";
  const low = at(0.25);
  const high = at(0.75);

  /* Two different ways a guide can be untrustworthy, and they need different
     words. Too FEW comparables is a small-sample problem. A whole-postcode-AREA
     sample is a distance problem: measured on B32, widening to the B area gave
     43 properties across all of Birmingham and a £775–£2,000 quartile spread,
     which is not a guide, it is a shrug with numbers on it. */
  const wideSpread = low > 0 && high / low > 1.8;
  const caveat =
    rents.length < 4
      ? `Only ${rents.length} comparable${rents.length === 1 ? "" : "s"} nearby — indicative, not evidence.`
      : ring === "area"
        ? `No comparables in the same postcode district — these are across the wider area${wideSpread ? ", and the spread is too wide to quote" : ""}. Treat as background, not evidence.`
        : wideSpread
          ? "The local spread is very wide — quote a figure from the named comparables, not this range."
          : null;

  return { low, mid: at(0.5), high, basedOn: rents.length, ring, caveat };
}

/**
 * Comparables from our own live book, nearest first.
 *
 * Matched on postcode SECTOR rather than district: a district can span a whole
 * town and produce "comparables" five miles away that a landlord will
 * immediately dismiss, taking the rest of the guide's credibility with them.
 */
export async function getResearch(
  address: string,
  postcode: string,
  beds = 2,
  filters: MarketFilters = {}
): Promise<MaResearch> {
  const sector = sectorOf(postcode);

  /* subject — trusted only if it survives the address check */
  let subject: MaResearch["subject"] = null;
  let addressWarning: string | null = null;
  const matched = await hsJson<{ hs_id?: number; address_label?: string }>(
    `match_address?address=${encodeURIComponent(`${address} ${postcode}`)}`
  );
  if (matched?.hs_id && matched.address_label) {
    if (matchIsTrustworthy(address, postcode, matched.address_label)) {
      subject = { hsId: matched.hs_id, label: matched.address_label };
    } else {
      addressWarning = `Homesearch matched this to "${matched.address_label}", which is a different property. Ignored — check the address before quoting anything from it.`;
    }
  } else {
    addressWarning = "Homesearch couldn't find this address.";
  }

  /* the area picture, what is on the market nearby with photographs, and the
     building's own material information — all independent, so all at once */
  let areaAverage: MaResearch["areaAverage"] = null;
  let market: MaResearch["market"] = null;
  let nearby: MarketListing[] = [];
  const [stats, listings, material] = await Promise.all([
    sector ? marketFor(sector, beds) : Promise.resolve(null),
    sector ? onMarketNearby(sector, beds, postcode, filters) : Promise.resolve([]),
    // Gated on the trusted match, not merely on having an hs_id — see the
    // `material` field comment on MaResearch.
    subject ? materialFor(subject.hsId) : Promise.resolve(null),
  ]);
  if (stats) {
    if (stats.avgRent) areaAverage = { beds, avgRent: stats.avgRent };
    market = stats.market;
  }
  nearby = listings;

  /* comparables — our own rentals, nearest ring first.

     MEASURED, and it corrected the first design: matching on postcode SECTOR
     alone returned ONE comparable in Liverpool and ZERO in Birmingham. The
     reasoning behind sector-only ("a district can span a whole town") assumes
     a dense local book, and TLE's 293 rentals are spread across the country.
     A guide built on one property is not a guide.

     So the rings widen until there is enough to say something: sector, then
     district, then postcode area — and every comparable carries how near it
     is, because "same street" and "same county" must never look alike on a
     page a landlord is reading. */
  const comparables: Comparable[] = [];
  try {
    const book = await fetchListingBook();
    const dist = districtOf(postcode);
    const area = areaOf(postcode);

    for (const l of book.listings) {
      if (!l.rentMonthly || l.rentMonthly <= 0) continue;
      const pc = normPc(l.locality.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}/i)?.[0] ?? "");
      if (!pc) continue;

      /* MEASURED BUG, and it reached the screen: a Liverpool appraisal was
         offering comparables in LUTON and LEICESTER.

         The rings used to match by string prefix. `areaOf("L34 5SN")` is "L",
         and "LU1 1QH" and "LE2 6EY" both START WITH "L" — so every postcode
         area beginning with L counted as the same area. The district ring had
         the same flaw one level down: "L34" starts with "L3".

         Postcode components are TOKENS, not prefixes. Parse the comparable
         with the same functions used on the subject and compare them whole.
         Nothing else is safe: an agent reading "same area" beside a property
         100 miles away loses the landlord's trust in the entire guide. */
      const cSec = sectorOf(pc);
      const cDist = districtOf(pc);
      const cArea = areaOf(pc);

      let nearness: Comparable["nearness"] | null = null;
      if (sector && cSec && normPc(cSec) === normPc(sector)) nearness = "sector";
      else if (dist && cDist && cDist === dist) nearness = "district";
      else if (area && cArea && cArea === area) nearness = "area";
      if (!nearness) continue;

      comparables.push({
        id: l.id,
        name: l.name,
        locality: l.locality,
        rentMonthly: Math.round(l.rentMonthly),
        rentDisplay:
          l.rentPeriod === "week" && l.rent
            ? `${money(l.rent)} pw`
            : `${money(l.rentMonthly)} pcm`,
        daysOnMarket: l.daysOnMarket,
        letAgreed: l.letAgreed,
        epcRating: l.epcRating,
        nearness,
      });
    }
  } catch {
    /* the guide degrades to the area average alone rather than failing */
  }

  /* Keep the tightest ring that gives a usable sample. Four is the point at
     which quartiles stop being theatre. */
  const RING: Comparable["nearness"][] = ["sector", "district", "area"];
  let kept = comparables;
  for (let i = 0; i < RING.length; i++) {
    const upto = RING.slice(0, i + 1);
    const inRing = comparables.filter((c) => upto.includes(c.nearness));
    if (inRing.length >= 4 || i === RING.length - 1) {
      kept = inRing;
      break;
    }
  }
  comparables.length = 0;
  comparables.push(...kept);

  comparables.sort((a, b) => a.rentMonthly - b.rentMonthly);
  const shown = comparables.slice(0, 12);

  return {
    address,
    postcode,
    sector,
    subject,
    addressWarning,
    areaAverage,
    market,
    onMarketNearby: nearby,
    marketFilters: {
      ...filters,
      appliedRadius: Boolean(filters.radiusMiles && filters.radiusMiles > 0 && (await geocode(postcode))),
    },
    material,
    // The guide and the list must describe the same sample. Reporting a range
    // "based on 43" beside twelve visible rows invites the obvious question and
    // has no good answer.
    comparables: shown,
    guide: buildGuide(shown),
    pulledAt: new Date().toISOString(),
  };
}
