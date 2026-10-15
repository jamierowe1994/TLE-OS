import "server-only";
import { londonDay, londonToday } from "@/lib/london-clock";
import type { Cert } from "@/lib/compliance";
import { readListingDetails, type ListingDetails } from "@/lib/listing-details";
import { inputFromDetails, missing } from "@/lib/listing-requirements";

/**
 * WHAT STILL STANDS BETWEEN A LISTING AND THE PORTALS - the push route's own
 * check, in one place so the board can ask the same question (17 Sep 2026).
 *
 * The board used to look at photos and the EPC alone, so a tile said "Ready
 * to publish" over a drawer that then refused for want of a council tax band.
 * Now both read this: every field in lib/listing-requirements, and the EPC.
 */

export interface PublishGap {
  id: string;
  label: string;
}

/** Does this EPC count? Same rule as always: in date, or attached with no
 *  date on it, or marked not required. */
const epcCounts = (s: Cert | null | undefined): boolean =>
  Boolean(s && (s.expires == null ? s.attached : s.expires >= 0 || s.notRequired));

/**
 * Is there an EPC? On the listing itself (where REX keeps one entered with
 * the advert) or as a compliance entry on the property. "Not required" counts:
 * a handful of homes are genuinely exempt.
 *
 * ONE HOME, NOT THE BOOK (15 Oct 2026, bug 1f6bd9ad). This used to build the
 * whole compliance book to answer for one property, and the board asks it for
 * every ready-looking draft, so REX was swamped. Now: the held book first (it
 * already knows, and a room there inherits its house's EPC); only when that
 * does not say yes, one ComplianceEntries search for this property plus the
 * EPCs filed in the OS - so one just uploaded counts straight away.
 */
export async function hasEpc(details: ListingDetails): Promise<boolean> {
  const today = londonToday();
  if (details.epc.rating || (details.epc.expiry && details.epc.expiry >= today)) return true;
  if (!details.propertyId) return false;
  const pid = String(details.propertyId);
  try {
    const { heldComplianceBook, STALE_MS } = await import("@/lib/compliance-cache");
    const held = await heldComplianceBook().catch(() => null);
    if (held && Date.now() - held.at < STALE_MS) {
      const state = held.book.properties.find((p) => String(p.id) === pid)?.certs?.epc;
      /* Its day counts are from the day it was built: move them on to today. */
      const { ukDayNumber } = await import("@/lib/rex-compliance");
      const shift = ukDayNumber(today) - ukDayNumber(londonDay(new Date(held.at).toISOString()));
      if (state && epcCounts(state.expires == null ? state : { ...state, expires: state.expires - Math.max(0, shift) })) return true;
    }
  } catch {
    /* No held book: ask about the one home below. */
  }
  try {
    const { epcForProperty } = await import("@/lib/rex-compliance");
    return epcCounts(await epcForProperty(pid));
  } catch {
    /* A check that cannot be made must not stop a legitimate publish: the
       screen has already shown the agent what is missing. */
    return true;
  }
}

/**
 * The EPC, and only the EPC, of the certificates (James, 16 Sep 2026): it is
 * what the law needs to ADVERTISE. Gas and the EICR are needed before anyone
 * moves in and block the handover instead (lib/deal-handoff).
 */
export async function publishGaps(details: ListingDetails): Promise<PublishGap[]> {
  const gaps: PublishGap[] = missing(inputFromDetails(details)).map((g) => ({ id: g.id, label: g.label }));
  const [epc, terms] = await Promise.all([hasEpc(details), hasTerms(details)]);
  if (!epc) gaps.push({ id: "epc", label: "EPC" });
  if (terms === false) gaps.push({ id: "terms", label: "Signed terms of business" });
  if (terms === null) gaps.push({ id: TERMS_UNCHECKED, label: "Terms of business not checked yet" });
  return gaps;
}

/**
 * REX REFUSES TO PUBLISH WITHOUT TERMS OF BUSINESS (6 Oct 2026). 6 Ruskin
 * Place was pushed twice and refused twice; REX's own "what is stopping
 * this" calls (getErrorsPreventingPublication, getPublicationIssues) both
 * answered empty. James found it by pressing Publish inside REX: a
 * terms_of_business compliance entry has to be on the property. So the OS
 * asks the question itself.
 *
 * True, false, or null when it could not be checked (15 Oct 2026). It used
 * to say yes whenever REX's search timed out, which is exactly how 848794
 * went to REX without terms and came back refused. Unknown is its own gap
 * now: "try again", not "send the terms".
 */
export async function hasTerms(details: ListingDetails): Promise<boolean | null> {
  if (!details.propertyId) return true;
  try {
    const { osTermsFor, rexHasTerms } = await import("@/lib/terms-to-rex");
    /* Uploaded on the Documents tab and marked Terms of Business counts, and
       so do terms signed online (James, 6 and 12 Oct 2026): the push files
       them into REX before publishing. Asked first - it is our own database,
       and saves a REX search when the answer is already yes. */
    if (await osTermsFor(details.propertyId)) return true;
    return await rexHasTerms(details.propertyId);
  } catch {
    return null;
  }
}

/** The gap for terms nobody could check: not missing, not there either. */
export const TERMS_UNCHECKED = "terms_unchecked";

/* Read once per listing per version: a board of drafts asks for the same few
   again every time it is opened, and each read is four calls upstream. The
   key carries the listing's modified time (the board sends it), so a save on
   the Marketing tab is a new key rather than a stale answer. */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; gaps: PublishGap[] }>();
/* One read per listing at a time (15 Oct 2026, bug e8a23c44). The readiness
   route stops waiting after its time budget and the board asks again; the
   read already under way is the one the second ask waits on, not a new one. */
const inFlight = new Map<string, Promise<PublishGap[]>>();

/**
 * The board's question. Display only - the push route checks fresh - so the
 * listing read may be one from the last couple of minutes (readListingDetails
 * cached), which is most of what kept Lianna's board waiting past 100 seconds.
 * An answer that says terms could not be checked is not kept: it is REX being
 * slow, and the next ask should try again.
 */
export function publishGapsFor(id: number, version: string): Promise<PublishGap[]> {
  const key = `${id}:${version}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.gaps);
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    const gaps = await publishGaps(await readListingDetails(id, { cached: true }));
    if (!gaps.some((g) => g.id === TERMS_UNCHECKED)) {
      if (cache.size > 500) cache.clear();
      cache.set(key, { at: Date.now(), gaps });
    }
    return gaps;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
