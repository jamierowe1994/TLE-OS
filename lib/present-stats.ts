/**
 * THE NATIONAL FIGURES, and the only place they are allowed to live.
 *
 * James, 7 Sep: "pull some nationalised stats... maybe we can give some actual
 * stats against that." The marketing slides were a headline and one paragraph
 * each - 31% of the screen on a laptop, measured - and an argument with no
 * evidence under it is exactly the slide a landlord skims.
 *
 * ── The rule these obey ────────────────────────────────────────────────────
 *
 * The deck's first rule is NO INVENTED FIGURES (see lib/present.ts). It is
 * stricter than it sounds: a number nobody can stand behind is worse than no
 * number, because the whole argument of the deck is that we price and advise
 * on evidence. So every entry below carries the figure, WHO measured it, over
 * WHAT period, and the page it came from - and the slides print the source
 * next to the number rather than hiding it in a file.
 *
 * Nothing here is a TLE figure. These are third-party market statistics, and
 * they are labelled as such on the page. The office's own numbers - our let
 * times, our tenancies - come off the market snapshot per appraisal and are
 * not mixed into this list, because a landlord who cannot tell which is which
 * is being misled even when both are true.
 *
 * ── They go stale ──────────────────────────────────────────────────────────
 *
 * `asAt` is on every one and it is printed. Zoopla publishes monthly; the
 * Rightmove claims page restates its audit periods when they change. Check
 * this file before launch and each quarter after it - a 2026 figure on a 2027
 * deck is the invented-figure rule broken slowly rather than all at once.
 *
 * ── Some of them cut against us, and they stay ─────────────────────────────
 *
 * Rental demand is at a six-year low and enquiries per property have fallen a
 * quarter in a year. That is not a comfortable number to show a landlord, and
 * it is the single most useful one on the marketing slides: it is the reason
 * the marketing matters now in a way it did not in 2022. Showing only the
 * flattering half of a market report is how a deck stops being evidence.
 */

export type NationalStat = {
  /** The number as it should read on a slide. Already formatted. */
  value: string;
  /** What it counts, in a landlord's words. */
  label: string;
  /** Who measured it, and over what. Printed. */
  source: string;
  /** When the figure was published or last restated. Printed. */
  asAt: string;
  /** Where it came from, for anybody checking us. */
  url: string;
};

/**
 * Where tenants actually look.
 *
 * Rightmove's claims page is the source rather than a traffic estimator on
 * purpose: Similarweb and Semrush disagree with each other by an order of
 * magnitude on Rightmove's monthly visits (14.5m, 60.8m, 125m and 192m all
 * appear in the first page of results), and none of them is audited. The
 * claims page names its measurer and its period for every line, which is the
 * standard a figure has to meet before it goes in front of a landlord.
 */
export const PORTAL_STATS: NationalStat[] = [
  {
    value: "3 in 4",
    label: "renters find their next home on Rightmove",
    source: "Street, via Rightmove's audited claims",
    asAt: "Jan 2024 - Apr 2025",
    url: "https://www.rightmove.co.uk/c/claims/",
  },
  {
    value: "4 in 5",
    label: "lets agreed came from Rightmove rather than Zoopla",
    source: "Street, via Rightmove's audited claims",
    asAt: "Jan - Nov 2025",
    url: "https://www.rightmove.co.uk/c/claims/",
  },
  {
    value: "80%+",
    label: "of all time spent on UK property portals is on Rightmove",
    source: "Comscore MMX, via Rightmove's audited claims",
    asAt: "June 2025",
    url: "https://www.rightmove.co.uk/c/claims/",
  },
];

/**
 * Why reaching past the search results matters now.
 *
 * All four from one report and one month, which is deliberate: mixing a demand
 * figure from March with a rent figure from June would let two different
 * markets be described as one. If any of these is updated, update all four.
 */
export const DEMAND_STATS: NationalStat[] = [
  {
    value: "4.8",
    label: "enquiries per rental property, down from 6.5 a year ago",
    source: "Zoopla Rental Market Report",
    asAt: "March 2026",
    url: "https://www.zoopla.co.uk/discover/property-news/rental-market-report-march-2026/",
  },
  {
    value: "14%",
    label: "fewer renters searching than a year ago - a six-year low",
    source: "Zoopla Rental Market Report",
    asAt: "March 2026",
    url: "https://www.zoopla.co.uk/discover/property-news/rental-market-report-march-2026/",
  },
  {
    value: "20 days",
    label: "the national average to find a tenant",
    source: "Zoopla Rental Market Report",
    asAt: "March 2026",
    url: "https://www.zoopla.co.uk/discover/property-news/rental-market-report-march-2026/",
  },
];

/** One line under a row of these, so the page says whose numbers they are
 *  without repeating a source three times. */
export function statFooter(stats: NationalStat[]): string {
  const sources = [...new Set(stats.map((s) => s.source))];
  const periods = [...new Set(stats.map((s) => s.asAt))];
  return `${sources.join("; ")} · ${periods.join(", ")}. National figures, not ours.`;
}
