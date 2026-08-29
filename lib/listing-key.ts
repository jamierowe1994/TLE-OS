/**
 * ONE STABLE IDENTITY FOR A LISTING, shared by the cards and the map.
 *
 * It used to be `address|rent`, computed separately in two components, and it
 * was NOT unique: four of the six three-bed rentals in NN5 4 are on Upton Hall
 * Crescent, and the feed gives a street rather than a house number, so several
 * of them are the same string at the same rent.
 *
 * That collided in three places at once. React dropped duplicate keys and left
 * stale cards behind when the list shrank — filtering to 3 bed showed the six
 * correct houses plus a 2-bed and a 1-bed from the previous list, which is what
 * "the beds filter isn't working" actually looked like. Ticking one Upton Hall
 * Crescent ticked them all. And clicking a pin opened whichever card matched
 * the string first.
 *
 * Homesearch's own listing id is unique and stable; the address falls back for
 * the handful of rows without one.
 */
export function listingKey(l: { listingId?: number | null; address: string; rent: number | null }): string {
  return l.listingId ? `hs:${l.listingId}` : `${l.address}|${l.rent}`;
}
