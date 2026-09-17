import "server-only";
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

/**
 * Is there an EPC? On the listing itself (where REX keeps one entered with
 * the advert) or as a compliance entry on the property. "Not required" counts:
 * a handful of homes are genuinely exempt.
 */
export async function hasEpc(details: ListingDetails): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  if (details.epc.rating || (details.epc.expiry && details.epc.expiry >= today)) return true;
  if (!details.propertyId) return false;
  try {
    const { certificatesFor } = await import("@/lib/rex-compliance");
    const book = await certificatesFor([
      { propertyId: details.propertyId, name: details.address, locality: details.town, epcExpiry: details.epc.expiry, service: details.service },
    ]);
    const state = book.properties[0]?.certs?.epc;
    return Boolean(state && (state.expires == null ? state.attached : state.expires >= 0 || state.notRequired));
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
  if (!(await hasEpc(details))) gaps.push({ id: "epc", label: "EPC" });
  return gaps;
}

/* Read once per listing per version: a board of drafts asks for the same few
   again every time it is opened, and each read is four calls upstream. The
   key carries the book's lastUpdated, so a save on the Marketing tab (which
   refreshes the book) is a new key rather than a stale answer. */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; gaps: PublishGap[] }>();

export async function publishGapsFor(id: number, version: string): Promise<PublishGap[]> {
  const key = `${id}:${version}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.gaps;
  const gaps = await publishGaps(await readListingDetails(id));
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), gaps });
  return gaps;
}
