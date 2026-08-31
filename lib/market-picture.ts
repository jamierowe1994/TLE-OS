import "server-only";
import { hsLetBook, districtOf, sectorOf } from "@/lib/ma-research";

/**
 * THE LOCAL LETTINGS MARKET, IN NUMBERS A LANDLORD CAN ARGUE WITH.
 *
 * The Market step used to be three rows of Homesearch area statistics — an
 * average, a stock count and a supply figure. That is the whole of what
 * `area_statistics/lettings/` exposes, and it is thin: it cannot say how long
 * things take, what a 3-bed asks as opposed to a 1-bed, how much of the
 * competition is flats, or how many landlords have already cut their price.
 *
 * ── WHERE THIS COMES FROM, AND WHY IT IS NOT AN AREA-STATISTICS CALL ───────
 *
 * Every figure here is computed from the LISTINGS themselves —
 * `current_listings_crm/search/let/` — not from a statistics endpoint. That is
 * not a workaround, it is the only way: measured 31 Aug 2026 against the live
 * token, `area_statistics/lettings/` has exactly three members and none of
 * them is a time, a distribution or a trend. Fine & Country derive their
 * equivalents the same way.
 *
 * The upside is that one district fetch answers everything at once, at both
 * scopes, with 100% field coverage. Measured on NN5's full book, 214 rows:
 * agent, beds, price, listed_on, status, type and postcode are populated on
 * every single row. Nothing here rests on a field that is usually absent.
 *
 * ── THE ENDPOINT THAT LOOKS PERFECT AND IS A TRAP ─────────────────────────
 *
 * `live_market_insight/new_to_market` and `live_market_insight/on_market_over_period`
 * read like exactly this feature, and they are NOT USED ON PURPOSE. They have
 * no let/sale channel filter. Measured on NN5: `new_to_market` returns 559,
 * and `price_from=100000` still returns 459 of them — so ~82% are house sales.
 * Quoting "559 new to market" to a landlord about the rental market would be
 * wrong by a factor of five. Do not re-add them looking for a shortcut.
 *
 * ── AVERAGE RENT INCREASE IS NOT HERE, AND CANNOT BE YET ──────────────────
 *
 * Homesearch holds no rent history of any kind — no trend endpoint, and
 * `price_history` on a lettings row is SALE history (measured: £199,950 in
 * 2006). The only route to "rents are up N% in NN5" is our own daily capture
 * in os_listing_capture, which began 30 Aug 2026. It will answer this in
 * months, not today. An invented trend line is the one thing that would
 * discredit the whole panel, so there isn't one.
 */

/** A row as the let feed actually returns it. `type` is "House" or "Flat". */
interface LetRow {
  postcode?: string | null;
  beds?: number | null;
  /** Full words on the way OUT ("House"), single letters on the way IN ("H"). */
  type?: string | null;
  price?: number | null;
  agent?: string | null;
  status?: string | null;
  listed_on?: string | null;
  reduced_at?: string | null;
}

/**
 * WITHDRAWN STOCK IS NOT THE MARKET, and on NN5 it is half the feed.
 *
 * Measured: 214 rows for the district, of which 105 are withdrawn and 4 have
 * fallen through. Counting those as competition would tell a landlord they are
 * up against 214 properties when the real number is 105 — and would drag every
 * days-advertised figure towards the ancient dead listings, which are exactly
 * the ones that sat longest.
 *
 * "let agreed" stays in. It is still advertised and somebody has accepted it,
 * which makes it the best evidence of what the market PAYS rather than asks.
 * It is counted separately as well, because the share that has been taken is
 * itself the argument for pricing confidently.
 */
const isAdvertised = (r: LetRow) => {
  const s = String(r.status ?? "").trim().toLowerCase();
  return s === "on market" || s === "let agreed";
};

const isLetAgreed = (r: LetRow) =>
  String(r.status ?? "").trim().toLowerCase() === "let agreed";

/**
 * MEDIAN, NEVER MEAN, for anything an agent will read out loud.
 *
 * Measured on NN5: the mean days advertised is 80 and the median is 27. The
 * mean is dragged by a short tail of listings that have sat for the better
 * part of a year. Telling a landlord "properties round here take 80 days" when
 * half of them go inside four weeks is not a rounding difference, it is the
 * wrong answer — and it is the answer that talks them out of instructing.
 */
function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Days since a listing went live, or null if the date is unusable.
 *
 * Anything negative is a feed error rather than a property listed tomorrow,
 * and it is dropped rather than clamped to zero — a fake zero would pull the
 * median down and make the market look faster than it is.
 */
function daysAdvertised(r: LetRow, now: number): number | null {
  if (!r.listed_on) return null;
  const t = Date.parse(r.listed_on);
  if (!Number.isFinite(t)) return null;
  const d = Math.round((now - t) / 86_400_000);
  return d >= 0 && d <= 3650 ? d : null;
}

/** A median plus the sample it rests on, so a thin one can be labelled. */
export interface Sampled {
  median: number;
  n: number;
  low: number;
  high: number;
}

/**
 * Four is where a median stops being theatre. Below it the figure is still
 * returned — an agent would rather see "two nearby, £1,150" than a blank — but
 * `n` travels with it so the panel can say so instead of quoting it flat.
 */
function sampled(ns: number[]): Sampled | null {
  const m = median(ns);
  if (m == null) return null;
  return { median: m, n: ns.length, low: Math.min(...ns), high: Math.max(...ns) };
}

export interface AgentShare {
  agent: string;
  n: number;
  /** True for the office's own stock — see OUR_AGENT_NAMES. */
  ours: boolean;
}

export interface BedBand {
  beds: number;
  n: number;
  rent: Sampled | null;
}

export interface MarketPictureScope {
  /** "NN5" or "NN5 4". */
  area: string;
  level: "district" | "sector";
  /** On market plus let agreed. The denominator for every share below. */
  advertised: number;
  /** Of those, how many have already been taken. */
  letAgreed: number;
  /** How long the CURRENTLY advertised stock has been advertised. NOT time to
   *  let — see MarketPicture.ourLetSpeed for the honest version of that. */
  daysAdvertised: Sampled | null;
  /**
   * Mutually exclusive age bands that sum to `advertised` minus the rows with
   * no usable listed_on. Deliberately exclusive: overlapping bands ("new in 14"
   * and "new in 28" both counting the same property) cannot be drawn as a bar
   * chart without double-counting, and a landlord reading two numbers that
   * overlap will add them.
   */
  bands: { newIn14: number; days15to28: number; days29to84: number; over84: number; undated: number };
  /** House vs Flat. The feed carries nothing finer — see the note on the type. */
  houses: number;
  flats: number;
  /** Asking rent by bed count, ascending. */
  beds: BedBand[];
  /** Asking rent across every size, for the headline. */
  rent: Sampled | null;
  /** How many have cut their asking rent since listing. */
  reduced: number;
  /** Who the competition is, biggest first. */
  agents: AgentShare[];
}

/**
 * How the office's own stock is spotted in somebody else's feed.
 *
 * Homesearch names agencies as the portals do, and TLE does not appear in NN5
 * at all — checked 31 Aug 2026 against the full district book. So this must
 * degrade gracefully: when nothing matches, the agent panel is simply "who you
 * are competing with", which is still worth showing. It must never render an
 * "us" row at zero, because a landlord reading TLE on 0 beside Your Move on 14
 * has been handed an argument against instructing.
 */
const OUR_AGENT_NAMES = [/lettings\s*experts/i, /\btle\b/i];

const isOurs = (agent: string) => OUR_AGENT_NAMES.some((re) => re.test(agent));

function scopeFrom(
  rows: LetRow[],
  area: string,
  level: MarketPictureScope["level"],
  now: number
): MarketPictureScope | null {
  const live = rows.filter(isAdvertised);
  /* An empty scope is dropped rather than drawn as a row of zeroes. Three
     zeroes on a tile read as "nothing lets round here", which is a claim; it
     is an absence, and the caller says so in words instead. */
  if (!live.length) return null;

  const ages = live.map((r) => daysAdvertised(r, now));
  const dated = ages.filter((d): d is number => d != null);

  const bedCounts = new Map<number, number[]>();
  for (const r of live) {
    if (typeof r.beds !== "number" || r.beds <= 0) continue;
    if (typeof r.price !== "number" || r.price <= 0) continue;
    /* Five-and-over share a band. Above that the samples are single figures —
       NN5 has one 5-bed in the whole district — and a median of one property
       drawn as a bar beside a median of forty reads as equally solid. */
    const key = Math.min(r.beds, 5);
    const bucket = bedCounts.get(key);
    if (bucket) bucket.push(r.price);
    else bedCounts.set(key, [r.price]);
  }

  const agentCounts = new Map<string, number>();
  for (const r of live) {
    const a = (r.agent ?? "").trim();
    if (a) agentCounts.set(a, (agentCounts.get(a) ?? 0) + 1);
  }

  const typeOf = (r: LetRow) => String(r.type ?? "").trim().toLowerCase();

  return {
    area,
    level,
    advertised: live.length,
    letAgreed: live.filter(isLetAgreed).length,
    daysAdvertised: sampled(dated),
    bands: {
      newIn14: dated.filter((d) => d <= 14).length,
      days15to28: dated.filter((d) => d > 14 && d <= 28).length,
      days29to84: dated.filter((d) => d > 28 && d <= 84).length,
      over84: dated.filter((d) => d > 84).length,
      undated: ages.length - dated.length,
    },
    houses: live.filter((r) => typeOf(r) === "house").length,
    flats: live.filter((r) => typeOf(r) === "flat").length,
    beds: [...bedCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([beds, prices]) => ({ beds, n: prices.length, rent: sampled(prices) })),
    rent: sampled(
      live
        .map((r) => r.price)
        .filter((p): p is number => typeof p === "number" && p > 0)
    ),
    reduced: live.filter((r) => Boolean(r.reduced_at)).length,
    agents: [...agentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([agent, n]) => ({ agent, n, ours: isOurs(agent) })),
  };
}

export interface MarketPicture {
  postcode: string;
  /** Widest first, so the LAST entry is the most local one we hold anything for. */
  scopes: MarketPictureScope[];
  /**
   * HOW FAST WE LET, from our own REX book — the honest answer to "time to let".
   *
   * The scopes above can only say how long stock has been ADVERTISED, because
   * a completed let leaves the Homesearch feed and there is no archive behind
   * it. That is a different question and the two must never be blurred: one is
   * how long the competition has been sitting, the other is how long we take.
   *
   * This is passed in by the caller from the same REX query that feeds the
   * Recently Let step, where daysToLet is measured publication → leased.
   */
  ourLetSpeed: { median: number; n: number } | null;
  pulledAt: string;
}

/**
 * One district fetch, both scopes.
 *
 * The sector is derived locally off each row's own postcode rather than
 * fetched again — a sector is a subset of its district, so a second call would
 * spend an extra page-set to re-download rows we already hold.
 */
export async function getMarketPicture(
  postcode: string,
  ourLetDays: number[] = []
): Promise<MarketPicture> {
  const district = districtOf(postcode);
  const sector = sectorOf(postcode);
  if (!district) {
    return { postcode, scopes: [], ourLetSpeed: null, pulledAt: new Date().toISOString() };
  }

  const rows = (await hsLetBook("districts", district)) as unknown as LetRow[];
  const now = Date.now();

  const scopes: MarketPictureScope[] = [];
  const d = scopeFrom(rows, district, "district", now);
  if (d) scopes.push(d);
  if (sector) {
    /* Compared as a parsed sector, never as a string prefix. "NN5 4".startsWith
       is fine here but the same shortcut one level up made "L34" match "L3" and
       put Luton comparables on a Liverpool appraisal — so the whole file uses
       the parser on both sides, consistently, and stays out of that trap. */
    const inSector = rows.filter((r) => sectorOf(r.postcode ?? "") === sector);
    const s = scopeFrom(inSector, sector, "sector", now);
    if (s) scopes.push(s);
  }

  const m = median(ourLetDays);

  return {
    postcode,
    scopes,
    ourLetSpeed: m != null ? { median: m, n: ourLetDays.length } : null,
    pulledAt: new Date().toISOString(),
  };
}
