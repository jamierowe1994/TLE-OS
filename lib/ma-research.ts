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

export interface MaResearch {
  address: string;
  postcode: string;
  sector: string | null;
  /** Null when Homesearch could not be trusted — see matchIsTrustworthy. */
  subject: { hsId: number; label: string } | null;
  addressWarning: string | null;
  /** Homesearch average asking rent for this sector and bed count. */
  areaAverage: { beds: number; avgRent: number } | null;
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
  beds = 2
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

  /* area average — the one lettings statistic confirmed live on our token */
  let areaAverage: MaResearch["areaAverage"] = null;
  if (sector) {
    const stat = await hsJson<{ avg_price?: number }>(
      `area_statistics/lettings/avg_price_on_market?sectors%5B%5D=${encodeURIComponent(sector)}&beds%5B%5D=${beds}`
    );
    if (typeof stat?.avg_price === "number" && stat.avg_price > 0) {
      areaAverage = { beds, avgRent: stat.avg_price };
    }
  }

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
    const sec = sector ? normPc(sector) : null;
    const dist = districtOf(postcode);
    const area = areaOf(postcode);

    for (const l of book.listings) {
      if (!l.rentMonthly || l.rentMonthly <= 0) continue;
      const pc = normPc(l.locality.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}/i)?.[0] ?? "");
      if (!pc) continue;

      let nearness: Comparable["nearness"] | null = null;
      if (sec && pc.startsWith(sec)) nearness = "sector";
      else if (dist && pc.startsWith(normPc(dist))) nearness = "district";
      else if (area && pc.startsWith(normPc(area))) nearness = "area";
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
    // The guide and the list must describe the same sample. Reporting a range
    // "based on 43" beside twelve visible rows invites the obvious question and
    // has no good answer.
    comparables: shown,
    guide: buildGuide(shown),
    pulledAt: new Date().toISOString(),
  };
}
