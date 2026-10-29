import "server-only";
import { hasDb, q } from "@/lib/db";
import { sameHome } from "@/lib/address-parse";
import { stillOnPortalFeeds } from "@/lib/advert-offline";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { allCancellations } from "@/lib/let-cancel";
import { forgetListing, readListingDetails } from "@/lib/listing-details";
import { invalidateListingBook } from "@/lib/listings-cache";
import { decisionsForListing, recordDecision, type DecisionRef } from "@/lib/offer-decisions";
import { isExpiredToken, rexCall, rexWritesLocked, type RexResponse } from "@/lib/rex";
import { outstandingTerms } from "@/lib/rex-esign";
import { cancelledTermIds, cancelTermsHere } from "@/lib/terms-cancelled";

/**
 * A HOME WITHDRAWN SOMEWHERE ELSE, and what the agent wants done about it
 * (James, 29 Oct 2026, on Lorna Fieldson's 15 Egton Street tickets):
 *
 *   "If it gets withdrawn ... then we should offer them the option to
 *    withdraw it ... Give them a couple of options: remove it from the
 *    market, relist it, or ignore this ... They should be able to go in and
 *    re-edit that at any point."
 *
 * Two ways a home is withdrawn behind the OS's back:
 *   listing  the listings system's own state is withdrawn (Egton Street,
 *            25 Sep: "LANDLORD WITHDREW") - the OS kept saying On the market
 *   deal     its let fell through: the Propoly deal on this listing was
 *            cancelled, or the let was cancelled on its page here, while the
 *            listing still reads Let agreed
 *
 * The three answers, each kept with who and when, and changeable later:
 *   off      off the market: withdrawn in the listings system and the portals
 *            told, with any terms still out cancelled if the agent says so
 *   relist   back on the market: current again, the Let Agreed tick and any
 *            offer accepted here cleared, back on the portals
 *   leave    nothing changes; the question stops being asked
 *
 * James said yes to the listing writes on 29 Oct 2026 (Listings/changeState,
 * alongside the publication and Let Agreed writes already allowed). Terms are
 * never voided in the listings system, only stopped here (lib/terms-cancelled).
 * Nothing is emailed to anybody by any of this.
 */

export type WithdrawnChoice = "off" | "relist" | "leave";
export const WITHDRAWN_CHOICES: readonly WithdrawnChoice[] = ["off", "relist", "leave"];

export interface WithdrawnTerms {
  id: string;
  name: string;
  sentAt: string | null;
}

export interface Withdrawn {
  /** What happened, or null when nothing has. */
  source: "listing" | "deal" | null;
  /** The listing's own state in the listings system: current, withdrawn, leased, sold. */
  state: string | null;
  /** The day it happened, YYYY-MM-DD, where known. */
  on: string | null;
  /** The reason written down, in the listings system or on the let. */
  why: string | null;
  /** The tenants on the deal that fell through. */
  tenants: string | null;
  /** Still showing on Rightmove, OnTheMarket or Zoopla. */
  onPortals: boolean;
  letAgreed: boolean;
  /** Terms of business still out for signature on this listing. */
  terms: WithdrawnTerms[];
  /** The answer given, for this same event. A newer event asks again. */
  choice: { choice: WithdrawnChoice; by: string; at: string } | null;
}

const KIND = "withdrawn-choice";
type Kept = { choice: WithdrawnChoice; event: string; by: string; at: string };

const ymd = (v: unknown): string | null => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
};

/** What the listings system says about the listing itself. */
async function listingNow(id: number) {
  const [read, feeds] = await Promise.all([
    rexCall("Listings", "read", { id }),
    rexCall("ListingPortalUploads", "getStatuses", { listing_id: id, include_last_sent: false }),
  ]);
  if (!read.ok) throw new Error("The listings system didn't answer. Try again in a minute.");
  const r = (read.result ?? {}) as Record<string, unknown>;
  return {
    state: String(r.system_listing_state ?? "") || null,
    on: ymd(r.state_date),
    why: typeof r.state_reason_note === "string" && r.state_reason_note.trim() ? r.state_reason_note.trim() : null,
    letAgreed: r.let_agreed === true,
    stillShowing: feeds.ok ? stillOnPortalFeeds(feeds.result) : false,
    portalsChannel: r.publish_to_portals === true,
  };
}

/** A let on this listing that fell through: cancelled in Propoly, or cancelled on its page here. */
async function fellThrough(id: string, address: string): Promise<{ on: string | null; why: string | null; tenants: string | null } | null> {
  const [deals, decisions, cancels] = await Promise.all([
    getAllPropolyDeals().catch(() => null),
    decisionsForListing(id),
    allCancellations(),
  ]);
  /* Cancelled here: an offer accepted on this listing whose let was cancelled. */
  const accepted = [...decisions.entries()].filter(([, d]) => d.decision === "accepted").map(([ref]) => ref);
  const here = cancels.find((c) => accepted.includes(c.ref));
  if (here) return { on: here.at.slice(0, 10), why: [here.reason, here.note].filter(Boolean).join(": ") || null, tenants: null };
  if (!deals) return null;
  const onThis = deals.filter((d) => (d.app.listingId != null ? String(d.app.listingId) === id : Boolean(address) && sameHome(address, `${d.app.propertyName}, ${d.app.locality}`)));
  /* Another deal still going on the same listing is the let now. */
  if (onThis.some((d) => d.statusKey !== "cancelled" && d.statusKey !== "complete")) return null;
  const gone = onThis
    .filter((d) => d.statusKey === "cancelled")
    .sort((a, b) => String(b.app.dateUnsuccessful ?? "").localeCompare(String(a.app.dateUnsuccessful ?? "")))[0];
  if (!gone) return null;
  return {
    on: ymd(gone.app.dateUnsuccessful),
    why: "The let was cancelled in Propoly",
    tenants: gone.app.tenants.map((t) => t.name).filter(Boolean).join(" & ") || null,
  };
}

async function keptChoice(id: string): Promise<Kept | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: Kept }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [KIND, id]).catch(() => []);
  return rows[0]?.payload ?? null;
}

/** Terms still out on this listing that nobody has cancelled here. */
async function openTermsOn(id: string): Promise<WithdrawnTerms[]> {
  const [rows, cancelled] = await Promise.all([outstandingTerms().catch(() => []), cancelledTermIds()]);
  return rows
    .filter((t) => t.listingId != null && String(t.listingId) === id && !cancelled.has(`esign:${t.id}`))
    .map((t) => ({
      id: `esign:${t.id}`,
      name: t.signers.find((s) => s.role.toLowerCase() !== "agent")?.name ?? "the landlord",
      sentAt: t.sentAt,
    }));
}

export async function withdrawnFor(listingId: string): Promise<Withdrawn> {
  const id = Number(listingId);
  const now = await listingNow(id);
  let source: Withdrawn["source"] = null;
  let on: string | null = null;
  let why: string | null = null;
  let tenants: string | null = null;
  if (now.state && now.state !== "current") {
    source = "listing";
    on = now.on;
    why = now.why;
  } else {
    const details = await readListingDetails(id).catch(() => null);
    const fell = await fellThrough(listingId, details?.address ?? "");
    if (fell) {
      source = "deal";
      ({ on, why, tenants } = fell);
    }
  }
  const [kept, terms] = await Promise.all([keptChoice(listingId), source ? openTermsOn(listingId) : Promise.resolve([])]);
  const event = `${source}:${on ?? ""}`;
  return {
    source,
    state: now.state,
    on,
    why,
    tenants,
    onPortals: now.stillShowing,
    letAgreed: now.letAgreed,
    terms,
    /* Asked again for a different event: relisted, then withdrawn a second time. */
    choice: kept && (kept.event === event || !source) ? { choice: kept.choice, by: kept.by, at: kept.at } : null,
  };
}

export class WithdrawnRefused extends Error {
  constructor(message: string, readonly status = 409, readonly signIn = false) {
    super(message);
  }
}

/** One write to the listings system, as the person, said plainly when refused. */
async function write(service: string, method: string, body: unknown, token: string | null, words: string): Promise<RexResponse> {
  const res = await rexCall(service, method, body, token);
  if (!res.ok) {
    if (token && isExpiredToken(res)) throw new WithdrawnRefused("Your sign-in to the listings system has run out. Sign in again and press it once more.", 401, true);
    throw new WithdrawnRefused(`${words} didn't go through. Nothing else was changed after it. Try again in a minute.`, 502);
  }
  return res;
}

/**
 * Do what was chosen. Every write goes as the person (their own sign-in), so
 * the listings system says who did it. Written in the order that leaves the
 * least wrong if one is refused: the portals before the state on the way off,
 * the state before the portals on the way back.
 */
export async function chooseWithdrawn(p: {
  listingId: string;
  choice: WithdrawnChoice;
  cancelTerms: boolean;
  token: string | null;
  by: { name: string; email: string };
}): Promise<{ did: string[] }> {
  const id = Number(p.listingId);
  const before = await withdrawnFor(p.listingId);
  const did: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (p.choice !== "leave" && rexWritesLocked("Listings", "changeState") && ((p.choice === "off" && before.state === "current") || (p.choice === "relist" && before.state !== "current"))) {
    throw new WithdrawnRefused("Withdrawing and relisting from here isn't switched on yet. Ask James.", 423);
  }

  if (p.choice === "off") {
    if (before.onPortals) {
      await write("ListingPortalUploads", "queue", { listing_id: id, portal_listing_status: "withdrawn" }, p.token, "Taking it off the portals");
      did.push("The portals were told to take it down.");
    }
    if (before.state === "current") {
      await write("Listings", "changeState", { id, state: "withdrawn", details: { date: today, reason_id: "other", reason_note: before.why ?? "Withdrawn from TLE OS" } }, p.token, "Withdrawing it");
      did.push("Withdrawn in the listings system.");
    }
    if (p.cancelTerms) {
      for (const t of before.terms) await cancelTermsHere(t.id, "The home was withdrawn", p.by.name);
      if (before.terms.length) did.push(`The terms out to ${before.terms.map((t) => t.name).join(" and ")} were cancelled here.`);
    }
  }

  if (p.choice === "relist") {
    if (before.state && before.state !== "current") {
      await write("Listings", "changeState", { id, state: "current", details: { date: today } }, p.token, "Putting it back as current");
      did.push("Current again in the listings system.");
    }
    if (before.letAgreed) {
      await write("Listings", "update", { data: { id, let_agreed: false } }, p.token, "Clearing Let Agreed");
      did.push("Let Agreed taken off.");
    }
    /* An offer accepted here would keep it reading Let agreed: it fell through. */
    const decisions = await decisionsForListing(p.listingId);
    for (const [ref, d] of decisions) {
      if (d.decision !== "accepted") continue;
      await recordDecision({ ref: ref as DecisionRef, listingId: p.listingId, decision: "declined", note: "Fell through: the home went back on the market.", by: p.by });
      did.push("The accepted offer is marked as fallen through.");
    }
    await write("ListingPublication", "setActivePublicationChannels", { listing_id: id, channels: ["portals", "automatch", "external", "general"] }, p.token, "Putting it back on the portals");
    await write("ListingPortalUploads", "queue", { listing_id: id }, p.token, "Sending it to the portals");
    did.push("Back on Rightmove, OnTheMarket and Zoopla within about 10 minutes.");
  }

  const kept: Kept = { choice: p.choice, event: `${before.source}:${before.on ?? ""}`, by: p.by.name || p.by.email, at: new Date().toISOString() };
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_by) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = $3::jsonb, updated_at = NOW(), updated_by = $4`,
    [KIND, p.listingId, JSON.stringify(kept), kept.by]
  );
  if (p.choice !== "leave") {
    forgetListing(id);
    await invalidateListingBook().catch(() => {});
  }
  return { did };
}
