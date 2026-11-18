import "server-only";
import { getMarketPicture, type MarketPicture, type MarketPictureScope, type Sampled } from "@/lib/market-picture";
import { districtOf, sectorOf } from "@/lib/ma-research";

/**
 * A FREE REPORT FOR A LANDLORD, BEFORE ANY APPRAISAL IS BOOKED
 * (Stuart Roper, 18 Nov 2026: "an ma / rental report for landlords even if ma
 * not booked just to get in the door"). Behind the "quickreport" switch.
 *
 * Two pages, made in the Write an Email window and attached as a PDF
 * (lib/quick-report-pdf). Two kinds:
 *
 *   rental  - about THEIR home: what homes its size are advertised for nearby,
 *             plus the agent's own early view if they give one.
 *   market  - about their AREA: typical asking rent, how much is advertised,
 *             how quickly it goes.
 *
 * Every figure is read live from the Homesearch lettings feed when it is made
 * (lib/market-picture, the same reader as the appraisal builder's Market
 * step). No snapshot, no fallback: if the feed cannot be read, it throws and
 * no report is made. Thin samples travel with their count so the page can say
 * so rather than quote a figure flat.
 */

export type QuickReportKind = "rental" | "market";

export interface QuickReportAsk {
  kind: QuickReportKind;
  address: string;
  postcode: string;
  beds: number | null;
  /** "house" | "flat" | null - only said back, the feed's sizes are by beds. */
  type: string | null;
  landlordName: string | null;
  /** The agent's own early view, before seeing inside. Optional. */
  view: { low: number; high: number } | null;
  note: string | null;
}

export interface QuickReportAgent {
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface QuickReport {
  ask: QuickReportAsk;
  agent: QuickReportAgent;
  /** The most local scope with anything advertised (sector, else district). */
  scope: MarketPictureScope;
  /** The scope the size figure came from, and the figure. Null on a market report or when none of that size is advertised. */
  sized: { scope: MarketPictureScope; beds: number; rent: Sampled } | null;
  ourLetSpeed: MarketPicture["ourLetSpeed"];
  madeAt: string;
}

/** A size figure needs at least this many homes to be quoted at all; below four the page says it is thin. */
const SIZED_FLOOR = 2;

export const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export function postcodeIn(text: string | null | undefined): string | null {
  const m = POSTCODE_RE.exec(String(text ?? ""));
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

export class QuickReportRefused extends Error {}

export async function buildQuickReport(ask: QuickReportAsk, agent: QuickReportAgent): Promise<QuickReport> {
  const pc = postcodeIn(ask.postcode) ?? postcodeIn(ask.address);
  if (!pc || !districtOf(pc)) throw new QuickReportRefused("That postcode can't be read. Type the full postcode, like NN5 4WJ.");

  /* Thrown, not swallowed: an error state, never a stale or zero figure. */
  const picture = await getMarketPicture(pc, []);
  const scope = picture.scopes[picture.scopes.length - 1];
  if (!scope) {
    throw new QuickReportRefused(`No homes are advertised to let in ${districtOf(pc)} right now, so there is nothing live to put in a report.`);
  }

  let sized: QuickReport["sized"] = null;
  if (ask.kind === "rental" && ask.beds) {
    const band = Math.min(ask.beds, 5);
    /* Most local first; widen to the district when the sector has too few of that size. */
    for (const s of [...picture.scopes].reverse()) {
      const b = s.beds.find((x) => x.beds === band);
      if (b?.rent && b.n >= SIZED_FLOOR) {
        sized = { scope: s, beds: band, rent: b.rent };
        break;
      }
    }
  }
  if (ask.kind === "rental" && !sized && !ask.view) {
    throw new QuickReportRefused(
      `Too few ${ask.beds ?? ""}${ask.beds ? " bedroom " : ""}homes are advertised near ${pc} to quote a figure. Give your own early view on the next step, or make a Market Report instead.`.replace(/\s+/g, " ")
    );
  }

  return {
    ask: { ...ask, postcode: pc },
    agent,
    scope,
    sized,
    ourLetSpeed: picture.ourLetSpeed,
    madeAt: new Date().toISOString(),
  };
}

/** "NN5 4" reads as the sector; "NN5" the district. */
export function areaWords(s: MarketPictureScope): string {
  return s.level === "sector" ? `the ${s.area} postcode area` : `${s.area}`;
}

export { sectorOf };
