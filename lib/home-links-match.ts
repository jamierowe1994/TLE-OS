import { isRoomAddress, sameHome } from "@/lib/address-parse";
import { isLet } from "@/lib/application-record";
import type { Application } from "@/lib/applications";

/**
 * THE SAME HOME, for the toggle between a home's listing, managed home and let
 * in progress (lib/home-links). Kept apart from the reads so it can be tried
 * on a copy of the book.
 *
 * REX's property id first; then the address, the way search pairs a home's
 * rows (lib/address-parse sameHome: same postcode, street and door). Rooms in
 * a shared house can share the house's REX id, so a room matches on the id
 * only when the address agrees too - Room 3 is never Room 1's listing.
 */

export interface HomeLink {
  href: string;
  /** Who, small, on hover: the applicants on a let. */
  hint?: string | null;
}
export interface HomeLinks {
  listing: HomeLink | null;
  home: HomeLink | null;
  let: HomeLink | null;
}

export type Rec = { listingId: string | null; propertyId: string | null; address: string };

/** 2 = the same REX property, 1 = the same address, 0 = another home. `rex` turns an OS pm- id into REX's. */
export function matchOf(a: Rec, b: Rec, rex: Map<string, string>): 0 | 1 | 2 {
  const idA = a.propertyId ? rex.get(a.propertyId) ?? a.propertyId : null;
  const idB = b.propertyId ? rex.get(b.propertyId) ?? b.propertyId : null;
  const addr = sameHome(a.address, b.address);
  if (idA && idB && idA === idB && (addr || (!isRoomAddress(a.address) && !isRoomAddress(b.address)))) return 2;
  return addr ? 1 : 0;
}

/** The best match among `rows`, never `me` itself: the same REX property over the same address, then the newest (REX's ids rise). */
export function bestOf<T>(me: Rec, rows: T[], rec: (x: T) => Rec, rex: Map<string, string>): T | null {
  let top: { x: T; m: number; id: number } | null = null;
  for (const x of rows) {
    const r = rec(x);
    if (me.listingId && r.listingId === me.listingId) continue;
    const m = matchOf(me, r, rex);
    const id = Number(r.listingId) || 0;
    if (m && (!top || m > top.m || (m === top.m && id > top.id))) top = { x, m, id };
  }
  return top?.x ?? null;
}

/**
 * Lets on this home, as the Applications board counts one: accepted (in REX
 * or here). On the listing it came from, or the same home. The caller drops
 * the closed ones (closedReasons).
 */
export function letsOn(me: Rec, listingIds: Set<string>, apps: Application[], rex: Map<string, string>): Application[] {
  return apps.filter(
    (a) =>
      isLet(a) &&
      ((a.listingId != null && listingIds.has(String(a.listingId))) ||
        matchOf(me, { listingId: null, propertyId: a.propertyId, address: `${a.property}, ${a.locality}` }, rex) > 0)
  );
}

export const listingRec = (l: { id: string | number; propertyId?: string | null; name: string; locality: string }): Rec => ({
  listingId: String(l.id),
  propertyId: l.propertyId ?? null,
  address: `${l.name}, ${l.locality}`,
});
export const homeRec = (h: { listingId: string | number; propertyId: string | null; name: string; locality: string; address?: string | null }): Rec => ({
  listingId: String(h.listingId),
  propertyId: h.propertyId,
  address: h.address || `${h.name}, ${h.locality}`,
});
