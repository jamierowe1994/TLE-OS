import "server-only";
import type { NextRequest } from "next/server";
import type { Application } from "@/lib/applications";
import type { PreTenancyDeal } from "@/app/api/pretenancy/deals/route";
import { GET as dealsGET } from "@/app/api/pretenancy/deals/route";
import { GET as applicationsGET } from "@/app/api/applications/route";
import { allCancellations } from "@/lib/let-cancel";
import { letsInProgress } from "@/lib/lets-in-progress-rule";

/**
 * The lets in progress for one person, counted on the server (Susan Liles,
 * 20 Nov 2026, ticket 0573c824): the PM Dashboard's Lets in Progress tile and
 * the Applications board's All tab both read this, so they can never
 * disagree. The rule itself is lib/lets-in-progress-rule.
 *
 * Read from the two screens the board itself reads - the person's own deals
 * (/api/pretenancy/deals?mine=1) and their applications (/api/applications) -
 * called here with requests the caller makes, so a scope the caller grants
 * (the PM Dashboard's whole business, or one agent's book from its picker,
 * lib/scope) is the scope both are read in. Propoly is never asked: the deals
 * route reads the saved copy (lib/business/propoly-deals, the one reader).
 *
 * A source that can't be read throws, and the caller shows an error - never a
 * count from half the sources, and never a stored one.
 */

export type LetsInProgressCount = {
  count: number;
  /** The deals counted, by Propoly deal id. */
  deals: string[];
  /** The accepted lets counted that are not in Propoly yet, by application id. */
  waiting: string[];
  /** Every agent's lets (the owners, the office), or one person's own. */
  wholeBook: boolean;
  /** When the older of the two sources was read. */
  at: string;
  /** The applications came from the last board while a fresh one is built. */
  stale?: boolean;
};

/** Thrown when Propoly's saved deals aren't there yet: ask again shortly. */
export class LetsStillReading extends Error {
  constructor() {
    super("The lets are still being read. Try again in a minute.");
  }
}

type Json = Record<string, unknown>;

export async function countLetsInProgress(
  sub: (path: string) => NextRequest,
  mode: "quick" | "fresh" | "" = ""
): Promise<LetsInProgressCount> {
  const appsPath = `/api/applications?limit=200&counts=1${mode ? `&${mode}=1` : ""}`;
  const [dealsRes, appsRes, cancelledList] = await Promise.all([
    dealsGET(sub("/api/pretenancy/deals?mine=1")),
    applicationsGET(sub(appsPath)),
    allCancellations(),
  ]);
  const d = (await dealsRes.json()) as Json;
  const a = (await appsRes.json()) as Json;

  if (!appsRes.ok || typeof a.error === "string" || !Array.isArray(a.applications)) {
    throw new Error(typeof a.error === "string" ? a.error : `The applications didn't answer (${appsRes.status}).`);
  }
  if (!dealsRes.ok || typeof d.error === "string") {
    throw new Error(typeof d.error === "string" ? d.error : `The lets didn't answer (${dealsRes.status}).`);
  }
  /* A cold saved copy answers null (the board asks again); not "none". */
  if (d.deals === null || d.deals === undefined) {
    if (d.configured === false) throw new Error("Propoly isn't connected here, so the lets in progress can't be counted.");
    throw new LetsStillReading();
  }
  if (!Array.isArray(d.deals)) throw new Error("The lets didn't answer.");

  const cancelled = {
    refs: new Set(cancelledList.map((c) => c.ref)),
    deals: new Set(cancelledList.map((c) => c.dealId).filter((x): x is string => Boolean(x))),
  };
  const apps = a.applications as Application[];
  const lets = letsInProgress(d.deals as PreTenancyDeal[], apps, cancelled);
  const dealsAt = typeof d.savedAt === "string" ? Date.parse(d.savedAt) : NaN;
  const appsAt = typeof a.pulledAt === "string" ? Date.parse(a.pulledAt) : NaN;
  const at = [dealsAt, appsAt].filter(Number.isFinite);
  return {
    count: lets.count,
    deals: lets.deals.map((x) => x.app.id),
    waiting: lets.waiting.map((w) => w.id),
    wholeBook: d.wholeBook === true,
    at: new Date(at.length ? Math.min(...at) : Date.now()).toISOString(),
    ...(a.stale === true ? { stale: true } : {}),
  };
}
