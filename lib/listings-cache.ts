import { fetchListingBook, fetchRetiredListings, type ListingBook, type OsListing } from "./rex-listings";
import { hasDb, q } from "./db";

/**
 * The rental book's cache, owned here rather than inside the route.
 *
 * It moved because of a bug worth naming. The book is cached in TWO layers —
 * a per-process Map for speed and os_cache so the first person in after a
 * deploy doesn't pay for everyone — and the save-the-write-up route only ever
 * cleared os_cache, under the key "listings:v2", which stopped existing when
 * the book became scoped per agent (v3). So saving a write-up cleared nothing:
 * the listing kept showing its OLD advert copy for up to ten minutes, and the
 * only reading available to whoever had just pressed Save was that the write
 * to REX had silently failed. It hadn't. The cache had lied about it.
 *
 * A route module is the wrong owner for state another route has to invalidate,
 * so both layers and the one function that clears them live together now.
 */

/* v2: the book gained the portal write-up. A cached object that grows a field
   keeps serving the old shape under the old key, so the field reads as missing
   on every environment that has already warmed the cache. */
/* v3, and the version bump is load-bearing: the book is now SCOPED, so a
   cached v2 object holds one agent's book under a key that says "everyone".
   Serving that to the next person is a cross-tenant leak, not a stale figure. */
/* v4: the book gained `createdAt`, which is what the two-month draft cap ages
   from. This bump is the whole reason the archive works. Without it a warm v3
   object comes back with no created dates at all, `archiveOf` finds no age to
   judge - and, correctly, archives NOTHING. The tab reads zero, the rule looks
   broken, and the cause is three files away. Caught exactly that way on
   14 Sep 2026, which is the third time this comment's own warning has been
   proved right. */
const CACHE_KEY_BASE = "listings:v4";

export const cacheKeyFor = (rexUserId: string | null) =>
  rexUserId ? `${CACHE_KEY_BASE}:agent:${rexUserId}` : `${CACHE_KEY_BASE}:all`;

export const FRESH_MS = 10 * 60 * 1000;
export const STALE_MS = 6 * 60 * 60 * 1000;

export interface Cached {
  book: ListingBook;
  at: number;
}

/* Keyed by scope, not a single slot. One shared `memory` would hand the first
   agent's book to the second — the exact bug this whole change exists to
   prevent, reintroduced one layer up. */
const memory = new Map<string, Cached>();
const refreshing = new Map<string, Promise<Cached>>();

async function readStored(key: string): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { book: ListingBook }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [key]
    );
    if (!rows[0]) return null;
    return { book: rows[0].payload.book, at: new Date(rows[0].computed_at).getTime() };
  } catch {
    return null;
  }
}

async function store(key: string, entry: Cached): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [key, JSON.stringify({ book: entry.book })]
    );
  } catch {
    /* a cache that won't write is a slow page, not a broken one */
  }
}

/** Whatever is held for this scope, from either layer, or null. */
export async function heldFor(key: string): Promise<Cached | null> {
  return memory.get(key) ?? (await readStored(key));
}

export function refresh(key: string, rexUserId: string | null): Promise<Cached> {
  const live = refreshing.get(key);
  if (live) return live;
  const p = fetchListingBook(rexUserId)
    .then(async (book) => {
      const entry = { book, at: Date.now() };
      memory.set(key, entry);
      await store(key, entry);
      return entry;
    })
    .finally(() => {
      refreshing.delete(key);
    });
  refreshing.set(key, p);
  return p;
}

/**
 * The book for one scope, from cache when there is one.
 *
 * The route wants stale-while-revalidate manners and a `stale` flag to render;
 * a caller that just needs the listings (the assistant's tools, say) wants the
 * book and nothing else. Both go through the same two layers, so asking twice
 * costs one REX fetch rather than two.
 */
export async function bookFor(rexUserId: string | null): Promise<ListingBook> {
  const key = cacheKeyFor(rexUserId);
  const held = await heldFor(key);
  if (held && Date.now() - held.at < STALE_MS) {
    /* Warm it behind them if it's going off, but answer from what we hold —
       a person waiting on a reply should not pay for a book refresh. */
    if (Date.now() - held.at >= FRESH_MS) void refresh(key, rexUserId);
    return held.book;
  }
  return (await refresh(key, rexUserId)).book;
}

/**
 * Forget the book, everywhere, for everyone.
 *
 * Called after a write that changes what the book says about a listing. It
 * clears every scope rather than the writer's own, because a property can sit
 * in more than one agent's book and clearing only the person who pressed Save
 * leaves the stale copy in front of their colleague. The book costs a few
 * seconds to rebuild and is rebuilt on demand — throwing all of it away is the
 * cheap, obviously-correct option.
 */
export async function invalidateListingBook(): Promise<void> {
  memory.clear();
  if (!hasDb()) return;
  try {
    await q("DELETE FROM os_cache WHERE key LIKE $1", [`${CACHE_KEY_BASE}%`]);
  } catch {
    /* a cache that won't clear is a stale read, not a failed save */
  }
}

/* ── The retired half of the book ─────────────────────────────────────────
 *
 * REX's `withdrawn` listings - 223 residential rentals, the ones that came
 * off the market without a tenant. They are only ever wanted by the archive,
 * so they are fetched SEPARATELY and lazily rather than being folded into the
 * main book: three more REX pages on a page that already waits ~15s a call,
 * paid for by every agent opening Listings, to fill a tab most of them will
 * not open that day.
 *
 * They hold far longer than the live book, too. A withdrawn listing is
 * finished - nothing about it changes - so a day-old read of it is as good as
 * a fresh one.
 */

const RETIRED_KEY_BASE = "listings:retired:v1";
const RETIRED_FRESH_MS = 12 * 60 * 60 * 1000;

const retiredMemory = new Map<string, { listings: OsListing[]; at: number }>();

export async function retiredFor(rexUserId: string | null): Promise<OsListing[]> {
  const key = rexUserId ? `${RETIRED_KEY_BASE}:agent:${rexUserId}` : `${RETIRED_KEY_BASE}:all`;
  const mem = retiredMemory.get(key);
  if (mem && Date.now() - mem.at < RETIRED_FRESH_MS) return mem.listings;

  if (hasDb()) {
    try {
      const rows = await q<{ payload: { listings: OsListing[] }; computed_at: Date }>(
        "SELECT payload, computed_at FROM os_cache WHERE key = $1",
        [key]
      );
      if (rows[0] && Date.now() - new Date(rows[0].computed_at).getTime() < RETIRED_FRESH_MS) {
        retiredMemory.set(key, { listings: rows[0].payload.listings, at: new Date(rows[0].computed_at).getTime() });
        return rows[0].payload.listings;
      }
    } catch {
      /* fall through to a live fetch */
    }
  }

  const listings = await fetchRetiredListings(rexUserId);
  retiredMemory.set(key, { listings, at: Date.now() });
  if (hasDb()) {
    try {
      await q(
        `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
        [key, JSON.stringify({ listings })]
      );
    } catch {
      /* a cache that will not write is a slow tab, not a broken one */
    }
  }
  return listings;
}
