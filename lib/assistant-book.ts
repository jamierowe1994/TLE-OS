import "server-only";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import type { OsListing } from "@/lib/rex-listings";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * IS THIS LISTING ON THEIR BOOK, FOR STEVE.
 *
 * Their book is two things: the listings they are marketing (bookFor) and the
 * homes of theirs we look after, which is Portfolio (managedBookFor). Steve
 * only checked the first, so a let home in an agent's own Portfolio came back
 * "isn't on your book" and with no landlord (Lorna, 2 Nov 2026: 44 Rosedale
 * Grove, rent collect, moved in 30 Oct, landlord on the record). The same
 * rule the screens apply: a home that opens on their Portfolio is theirs.
 */
export async function onTheirBook(
  rexUserId: string | null,
  listingId: string
): Promise<{ listing: OsListing | null; home: ManagedProperty | null; propertyId: string | null; address: string | null }> {
  const id = String(listingId);
  const listing = (await bookFor(rexUserId)).listings.find((l) => String(l.id) === id) ?? null;
  if (listing) return { listing, home: null, propertyId: listing.propertyId ? String(listing.propertyId) : null, address: `${listing.name}, ${listing.locality}` };
  const managed = await managedBookFor(rexUserId).catch(() => null);
  const home = managed?.book.properties.find((p) => String(p.listingId) === id) ?? null;
  return { listing: null, home, propertyId: home?.propertyId ?? null, address: home ? `${home.name}, ${home.locality}` : null };
}
