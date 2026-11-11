import "server-only";
import { sameHome } from "@/lib/address-parse";
import { stillOnPortalFeeds } from "@/lib/advert-offline";
import { assembled, type Assembled } from "@/lib/applications-board";
import { getAllPropolyDeals, getPropolyCompletes, type BusinessDeal, type CompletedDeal } from "@/lib/business/propoly-deals";
import { listingRead } from "@/lib/listing-details";
import { bookFor } from "@/lib/listings-cache";
import { withTakenState } from "@/lib/listings-taken";
import { londonToday } from "@/lib/london-clock";
import { rexCall, rexRows } from "@/lib/rex";
import { toListing, type OsListing } from "@/lib/rex-listings";
import { RULES } from "@/lib/staleness";
import { isTestId } from "@/lib/test-overlay";

/**
 * MOVED IN, AND STILL ON THE PORTALS (Susan Liles, 3 Nov 2026).
 *
 * "We have a lot of properties that are Let Agreed and still being advertised
 * on the portals. Can we add a setting so that any properties Let Agreed that
 * have actually moved in and past 14 days from move in date that the adverts
 * are removed from the portals?"
 *
 * James: a report first, nothing taken down by itself. So this is the list
 * for the owners: every home that is let agreed (in the listing system, or by
 * the OS's own taken rule, lib/listings-taken) or let, whose tenant moved in
 * 14 days ago or more, and whose advert the portals are still being fed.
 *
 * Two places to look, measured 3 Nov 2026:
 *   - the current book, published and let agreed or taken (67 that day);
 *   - LEASED listings. A listing marked let leaves the book, but its portal
 *     feeds keep whatever was last sent them - and 47 of the 150 most recently
 *     let still had "current" as the last thing sent, i.e. still advertised.
 *     The 7 Sep bulk move to let accounts for many of them.
 *
 * The move-in date, latest first-hand evidence wins:
 *   - an accepted application on this listing, its start date (as the
 *     Applications board reads "Moved in", lib/applications closedReasons);
 *   - Propoly: a finished deal's move-in, or a live deal past the holding fee,
 *     on the same home since it was listed (the lib/listings-taken rules);
 *   - for a let listing with neither, the date it was let in the listing system.
 * A start date still ahead means not moved in, so not on the list.
 *
 * "Still on the portals" is the feeds, not the channel or the OS's Offline
 * marker (lib/advert-offline stillOnPortalFeeds): a feed running with the home
 * on it and the last upload sent said "current".
 *
 * That is what the listing system is SENDING, not what the portals SHOW. On
 * 3 Nov 2026 the list was 78 homes; opening each advert by hand, Rightmove
 * still showed 3 of them and OnTheMarket 8 (both drop let adverts on their
 * own after a while). Zoopla's links land on a street page, so it could not
 * be checked. Taking the advert down still sends every feed "withdrawn".
 *
 * Read only. Nothing here writes to the listing system; the screen's Take the
 * advert down is the existing /api/listings/publish "off". The once-a-day
 * automatic take-down, behind its own switch, is lib/listings-auto-takedown.
 */

/** Susan's fortnight. */
export const AFTER_DAYS = 14;

const DAY = 86_400_000;
const PAST_FEE = new Set(["references", "tenancy_generation", "signing_and_move_in_monies"]);
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const minus = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10)) - days * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

type L = Pick<OsListing, "id" | "name" | "locality" | "publishedAt" | "createdAt" | "availableFrom" | "listingState" | "stateDate"> & {
  letAgreed: boolean;
  publicationStatus: string | null;
  taken?: { why: string } | null;
};

export type MoveInSource = "application" | "propoly" | "let";

export interface MovedInHome {
  listingId: string;
  address: string;
  /** "Let agreed" while it is still in the book; "Let" once marked let. */
  stage: "Let agreed" | "Let";
  moveIn: string;
  source: MoveInSource;
  days: number;
}

/**
 * The rule on what was read, kept apart so it can be run against any day:
 * each listing's move-in, and whether it is a fortnight or more behind
 * `today`. Homes with no move-in on file are counted, not guessed.
 */
export function decideMovedIn(
  listings: L[],
  apps: Pick<Assembled, "applications" | "closed"> | null,
  deals: BusinessDeal[] | null,
  completes: CompletedDeal[] | null,
  today: string,
  /** How long after the move-in a home counts: Susan's fortnight for the adverts, 0 for "has moved in". */
  afterDays = AFTER_DAYS
): { homes: MovedInHome[]; notYet: number; noDate: number } {
  const homes: MovedInHome[] = [];
  let notYet = 0;
  let noDate = 0;
  for (const l of listings) {
    const address = [l.name, l.locality].filter(Boolean).join(", ");
    const listedOn = day(l.publishedAt ?? l.createdAt);
    const after = (at: string | null | undefined, slack = 0) => !listedOn || (at != null && at.slice(0, 10) >= (slack ? minus(listedOn, slack) : listedOn));
    /* The tenancy before this round, on a re-let of the same record (the
       285 Leith Walk rule in lib/listings-taken). */
    const prior = (start: string | null | undefined) => Boolean(l.availableFrom && start && start.slice(0, 10) < minus(l.availableFrom, 14));
    const found: { at: string; source: MoveInSource }[] = [];

    for (const a of apps?.applications ?? []) {
      if (String(a.listingId ?? "") !== String(l.id)) continue;
      const agreed = a.status === "accepted" || a.osDecision?.decision === "accepted";
      if (!agreed || a.status === "unsuccessful") continue;
      const closed = apps?.closed.get(a.id);
      if (closed && closed !== "Moved in") continue;
      const start = day(a.startDate);
      if (!start || !after(start, 14) || prior(start)) continue;
      found.push({ at: start, source: "application" });
    }

    for (const d of deals ?? []) {
      if (d.statusKey === "cancelled") continue;
      if (!sameHome(address, [d.app.propertyName, d.app.locality].filter(Boolean).join(", "))) continue;
      const paid = d.app.propoly?.holdingPaid?.status === "paid";
      if (!(paid || PAST_FEE.has(d.statusKey))) continue;
      const start = day(d.app.startDate);
      if (!start || !after(d.app.dateReceived, 14) || prior(start)) continue;
      found.push({ at: start, source: "propoly" });
    }

    for (const c of completes ?? []) {
      if (!c.address || !c.date || !after(c.date) || prior(c.date) || !sameHome(address, c.address)) continue;
      found.push({ at: c.date.slice(0, 10), source: "propoly" });
    }

    const leased = l.listingState === "leased";
    if (!found.length && leased && l.stateDate) found.push({ at: l.stateDate.slice(0, 10), source: "let" });
    if (!found.length) {
      noDate += 1;
      continue;
    }
    found.sort((a, b) => b.at.localeCompare(a.at));
    const last = found[0];
    const days = daysBetween(last.at, today);
    if (days < afterDays) {
      notYet += 1;
      continue;
    }
    homes.push({ listingId: String(l.id), address, stage: leased ? "Let" : "Let agreed", moveIn: last.at, source: last.source, days });
  }
  return { homes, notYet, noDate };
}

/** Portal names in a fixed order, so the chips never reshuffle. */
const ORDER = ["Rightmove", "Zoopla", "OnTheMarket"];
const portalName = (p: { xml_format?: unknown; profile_name?: unknown }) => {
  const f = String(p.xml_format ?? "");
  if (f === "uk_rightmove") return "Rightmove";
  if (f === "uk_zoopla") return "Zoopla";
  if (f === "uk_onthemarket") return "OnTheMarket";
  return String(p.profile_name ?? "").split(" - ")[0] || null;
};

/** The portals carrying the advert: feeds running with the home on them. */
function portalsOf(feeds: unknown): string[] {
  const list = ((feeds ?? {}) as { portals?: unknown }).portals;
  if (!Array.isArray(list)) return [];
  const names = new Set<string>();
  for (const p of list as { feed_status?: unknown; remote_id_on_portal?: unknown; xml_format?: unknown; profile_name?: unknown }[]) {
    if (p.feed_status !== "feeding" || !p.remote_id_on_portal) continue;
    const n = portalName(p);
    if (n) names.add(n);
  }
  return [...names].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

/** Every let listing REX holds, published ones only: the ones a feed could still carry. */
async function leasedListings(): Promise<{ listings: OsListing[]; agents: Map<string, string> }> {
  const listings: OsListing[] = [];
  const agents = new Map<string, string>();
  for (let n = 0; n < 10; n++) {
    const res = await rexCall("Listings", "search", {
      criteria: [
        { name: "system_listing_state", value: "leased" },
        { name: "listing_category_id", value: "residential_rental" },
      ],
      limit: 100,
      offset: n * 100,
      order_by: { system_modtime: "desc" },
    });
    /* A refused page is not the end of the list: thrown, so the screen says
       it could not check rather than showing half the homes as all of them. */
    if (!res.ok) throw new Error(res.error ?? `The listings system did not answer (${res.status}).`);
    const rows = rexRows(res.result);
    for (const r of rows) {
      const l = toListing(r as never);
      /* Edited mid-read, a listing can land on two pages. Once each. */
      if (l.publicationStatus !== "published" || agents.has(l.id) || listings.some((x) => x.id === l.id)) continue;
      listings.push(l);
      const agent = (r.listing_agent_1 as { name?: unknown } | null)?.name;
      if (typeof agent === "string" && agent) agents.set(l.id, agent);
    }
    if (rows.length < 100) break;
  }
  return { listings, agents };
}

/** The listing agents of the book's homes, one search per hundred. */
async function agentsOf(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const numeric = ids.filter((id) => /^\d+$/.test(id)).map(Number);
  for (let i = 0; i < numeric.length; i += 100) {
    const chunk = numeric.slice(i, i + 100);
    const res = await rexCall("Listings", "search", { criteria: [{ name: "id", type: "in", value: chunk }], limit: chunk.length }).catch(() => null);
    if (!res?.ok) continue;
    for (const r of rexRows(res.result)) {
      const agent = (r.listing_agent_1 as { name?: unknown } | null)?.name;
      if (typeof agent === "string" && agent) out.set(String(r.id), agent);
    }
  }
  return out;
}

/** The applications board's held copy, if it comes within a few seconds (as lib/listings-taken). */
async function applications() {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 6000));
  return Promise.race([assembled(null).then((x) => x.held.value).catch(() => null), timeout]);
}

/**
 * LIVE LISTINGS WHOSE LET HAS MOVED IN (Lianna Denholm, 11 Nov 2026, ticket
 * c0840a39: "12 South Chesters Lane is not showing on my portfolio, still
 * showing under listing? tenant moved in 2 days ago").
 *
 * Portfolio is every listing the listing system has marked let, and nothing
 * in the OS marks one: that was done by hand in the old system, which agents
 * no longer open. So a home let through the OS stayed a live listing for good
 * and never reached its agent's Portfolio (43 let agreed homes still live on
 * 11 Nov, 18 of them on a service we look after). The same evidence the
 * advert list uses says who has moved in - the accepted let's start date, or
 * Propoly's move-in - so the managed book reads these as let homes from the
 * day the tenant is in (lib/managed-book). Read only: nothing is written to
 * the listing system, and the listing stays where it is there.
 *
 * `rexUserId`: one agent's listings, or everyone's.
 */
export async function movedInListings(rexUserId: string | null, today = londonToday()): Promise<Map<string, { moveIn: string; source: MoveInSource }>> {
  const [book, apps, deals, completes] = await Promise.all([
    bookFor(rexUserId).then(withTakenState),
    applications(),
    getAllPropolyDeals().catch(() => null) as Promise<BusinessDeal[] | null>,
    getPropolyCompletes().catch(() => null) as Promise<CompletedDeal[] | null>,
  ]);
  const live = (book.listings as (OsListing & { taken?: { why: string } | null })[]).filter(
    (l) => !isTestId(l.id) && l.listingState !== "leased" && (l.letAgreed || l.taken)
  );
  const { homes } = decideMovedIn(live, apps, deals, completes, today, 0);
  return new Map(homes.map((h) => [h.listingId, { moveIn: h.moveIn, source: h.source }]));
}

export interface MovedInRow extends MovedInHome {
  agent: string | null;
  portals: string[];
}

export interface MovedInReport {
  rows: MovedInRow[];
  /** Let agreed or let homes looked at. */
  looked: number;
  /** Moved in under a fortnight ago, or moving in later. */
  notYet: number;
  /** No move-in date on file, so not judged. */
  noDate: number;
  /** A fortnight past move-in, but the feeds could not be read. */
  unreadable: number;
  checkedAt: string;
}

/** Ask the feeds of each home, a few at a time. */
async function feedsFor(ids: string[]): Promise<Map<string, unknown | null>> {
  const out = new Map<string, unknown | null>();
  const ABREAST = 8;
  for (let i = 0; i < ids.length; i += ABREAST) {
    await Promise.all(
      ids.slice(i, i + ABREAST).map(async (id) => {
        const res = await listingRead(id, "ListingPortalUploads", "getStatuses", { listing_id: Number(id), include_last_sent: false }).catch(() => null);
        out.set(id, res?.ok ? res.result : null);
      })
    );
  }
  return out;
}

export async function buildMovedInReport(today = londonToday()): Promise<MovedInReport> {
  const [book, leased, apps, deals, completes] = await Promise.all([
    bookFor(null).then(withTakenState),
    leasedListings(),
    applications(),
    getAllPropolyDeals().catch(() => null) as Promise<BusinessDeal[] | null>,
    getPropolyCompletes().catch(() => null) as Promise<CompletedDeal[] | null>,
  ]);
  const inBook = (book.listings as (OsListing & { taken?: { why: string } | null })[]).filter(
    (l) => !isTestId(l.id) && l.publicationStatus === "published" && (l.letAgreed || l.taken)
  );
  const have = new Set(inBook.map((l) => String(l.id)));
  const all: L[] = [...inBook, ...leased.listings.filter((l) => !have.has(String(l.id)))];

  const { homes, notYet, noDate } = decideMovedIn(all, apps, deals, completes, today);
  const [feeds, bookAgents] = await Promise.all([
    feedsFor(homes.map((h) => h.listingId)),
    agentsOf(homes.filter((h) => !leased.agents.has(h.listingId)).map((h) => h.listingId)),
  ]);

  const rows: MovedInRow[] = [];
  let unreadable = 0;
  for (const h of homes) {
    const f = feeds.get(h.listingId);
    if (f == null) {
      unreadable += 1;
      continue;
    }
    if (!stillOnPortalFeeds(f)) continue;
    rows.push({ ...h, agent: leased.agents.get(h.listingId) ?? bookAgents.get(h.listingId) ?? null, portals: portalsOf(f) });
  }
  rows.sort((a, b) => b.days - a.days || a.address.localeCompare(b.address));
  return { rows, looked: all.length, notYet, noDate, unreadable, checkedAt: new Date().toISOString() };
}

/* Held for the book's own ten minutes (lib/staleness "listing-book"), one
   build at a time: every home's feeds are asked, a few hundred calls. A take
   down drops the home from the held copy at once (forgetMovedIn). */
const held: { at: number; report: MovedInReport | null; building: Promise<MovedInReport> | null } = { at: 0, report: null, building: null };

export async function movedInReport(fresh = false): Promise<MovedInReport> {
  if (!fresh && held.report && Date.now() - held.at < RULES["listing-book"].freshMs) return held.report;
  held.building ??= buildMovedInReport()
    .then((r) => {
      held.report = r;
      held.at = Date.now();
      return r;
    })
    .finally(() => {
      held.building = null;
    });
  return held.building;
}

/** After a take down: out of the held list straight away. */
export function forgetMovedIn(listingId: string): void {
  if (held.report) held.report = { ...held.report, rows: held.report.rows.filter((r) => r.listingId !== listingId) };
}
