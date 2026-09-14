import "server-only";
import type { ListingBook, OsListing } from "@/lib/rex-listings";
import { archiveOf, type ArchiveReason } from "@/lib/listing-archive";
import { archiveOverrides } from "@/lib/listing-archive-store";

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

/** Stamp the archive state onto a set of listings. */
export async function stampArchive(listings: OsListing[]): Promise<ArchivedListing[]> {
  const overrides = await archiveOverrides();
  return listings.map((l) => {
    const a = archiveOf(l, overrides.get(String(l.id)));
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
