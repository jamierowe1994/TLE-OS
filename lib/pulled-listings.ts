import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Listings somebody found in REX and asked the OS to carry.
 *
 * ── What this stores, and what it deliberately does not ───────────────────
 *
 * The id, the address as it read at the time, who asked and when. NOT the
 * listing itself. The book fetches it from REX along with everything else, so
 * there is one source of truth and nothing here can drift out of date.
 *
 * Storing the record itself - real read-through caching - is the larger job,
 * and it waits on the staleness rule: the moment we hold a copy, every screen
 * needs an answer for how old is too old, and the live-figures rule still
 * holds. Recording the intent gets the property onto the board today without
 * making that decision early.
 *
 * ── Why nothing is ever removed by age ────────────────────────────────────
 *
 * A pull is somebody saying "this one matters to me". The listing-archive rule
 * still applies to it afterwards, so a pulled draft nobody touches ages out of
 * the working list exactly like any other - which means this table does not
 * need a tidy-up of its own.
 */

export interface PulledListing {
  listingId: string;
  address: string | null;
  byUser: string | null;
  at: string;
}

/** Every id the OS has been asked to carry. Empty without a database. */
export async function pulledListingIds(): Promise<string[]> {
  if (!hasDb()) return [];
  try {
    const rows = await q<{ listing_id: string }>(`select listing_id from os_pulled_listings`);
    return rows.map((r) => String(r.listing_id));
  } catch {
    /* The board is not worth losing over a table that may not exist yet. */
    return [];
  }
}

/** The log, newest first - for the record, and for anyone asking why a
 *  property is on the board that REX would not normally hand us. */
export async function pulledListings(limit = 200): Promise<PulledListing[]> {
  if (!hasDb()) return [];
  try {
    const rows = await q<{ listing_id: string; address: string | null; by_user: string | null; at: Date }>(
      `select listing_id, address, by_user, at from os_pulled_listings order by at desc limit $1`,
      [limit]
    );
    return rows.map((r) => ({
      listingId: String(r.listing_id),
      address: r.address,
      byUser: r.by_user,
      at: new Date(r.at).toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Ask the OS to carry this listing.
 *
 * Idempotent on purpose: pressing it twice is the same as pressing it once,
 * and the first person's name stays on it.
 */
export async function pullListing(listingId: string, address: string | null, byUser: string | null): Promise<void> {
  if (!hasDb()) return;
  await q(
    `insert into os_pulled_listings (listing_id, address, by_user)
     values ($1,$2,$3)
     on conflict (listing_id) do nothing`,
    [listingId, address, byUser]
  );
}
