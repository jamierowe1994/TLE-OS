import "server-only";
import type { ListingBook, OsListing } from "@/lib/rex-listings";
import { archiveOf, type ArchiveReason, type LetElsewhere } from "@/lib/listing-archive";
import { archiveOverrides } from "@/lib/listing-archive-store";
import { managedBookFor } from "@/lib/managed-book-cache";
import { sittingTenantsByProperty } from "@/lib/rex-tenants";

/**
 * The book, with every listing told where it stands.
 *
 * The RULE runs on the server, once, and the board is handed the answer -
 * rather than the board being handed the created dates and the override table
 * and asked to work it out again. Two implementations of "is this archived"
 * is two answers to the same question, and the one the agent sees would be
 * whichever screen they happened to open.
 */

export interface ArchivedListing extends OsListing {
  archived: boolean;
  archiveReason: ArchiveReason | null;
  /** The date the archiving is reckoned from, ISO. */
  archivedSince: string | null;
  archiveAgeDays: number | null;
}

type Let = { at: string; listingId: string };

/**
 * Every let REX knows of, by property (6 Oct 2026): the leased listings in
 * the managed book (whole business, cached - one agent's draft can be let on
 * another agent's listing) and the accepted applications whose tenancy has
 * started. Empty, never a guess, when neither answers: a draft is then judged
 * by its age alone, as it was before.
 */
export async function letsByProperty(): Promise<Map<string, Let[]>> {
  const out = new Map<string, Let[]>();
  const add = (propertyId: string | null | undefined, at: string | null | undefined, listingId: string | null | undefined) => {
    if (!propertyId || !at || !listingId || !/^\d+$/.test(String(listingId))) return;
    const list = out.get(String(propertyId)) ?? [];
    list.push({ at: String(at).slice(0, 10), listingId: String(listingId) });
    out.set(String(propertyId), list);
  };
  const [book, sitting] = await Promise.all([
    managedBookFor(null).then((m) => m.book).catch(() => null),
    sittingTenantsByProperty().catch(() => null),
  ]);
  for (const p of book?.properties ?? []) add(p.propertyId, p.letSince, p.listingId);
  for (const [propertyId, t] of sitting ?? []) add(propertyId, t.startDate, t.listingId);
  return out;
}

/** The latest let of this listing's home on a DIFFERENT listing, if any. */
export function letElsewhereOf(l: { id: string; propertyId: string | null }, lets: Map<string, Let[]>): LetElsewhere | null {
  if (!l.propertyId) return null;
  let best: Let | null = null;
  for (const x of lets.get(String(l.propertyId)) ?? []) {
    if (x.listingId === String(l.id)) continue;
    if (!best || x.at > best.at) best = x;
  }
  return best;
}

/** Stamp the archive state onto a set of listings. */
export async function stampArchive(listings: OsListing[]): Promise<ArchivedListing[]> {
  const [overrides, lets] = await Promise.all([archiveOverrides(), letsByProperty()]);
  return listings.map((l) => {
    const a = archiveOf(l, overrides.get(String(l.id)), letElsewhereOf(l, lets));
    return { ...l, archived: a.archived, archiveReason: a.reason, archivedSince: a.since, archiveAgeDays: a.ageDays };
  });
}

/**
 * The book with the archive stamped on, and the counts re-cut around it.
 *
 * `draft` in the counts now means "a draft somebody is still working on",
 * because that is what the Draft tab shows. The old total is kept as
 * `draftsAll` rather than dropped: the blurb on the page says how much of the
 * book is unpublished, and that is a true and useful number even though it is
 * no longer the tab's count. Losing it would leave nowhere on the screen that
 * admits 167 drafts exist.
 */
export async function withArchiveState(book: ListingBook): Promise<
  Omit<ListingBook, "listings" | "counts"> & {
    listings: ArchivedListing[];
    counts: ListingBook["counts"] & { draftsAll: number; archived: number };
  }
> {
  const listings = await stampArchive(book.listings);
  return {
    ...book,
    listings,
    counts: {
      ...book.counts,
      draftsAll: book.counts.draft,
      draft: listings.filter((l) => !l.archived && l.publicationStatus !== "published" && !l.letAgreed).length,
      archived: listings.filter((l) => l.archived).length,
    },
  };
}
