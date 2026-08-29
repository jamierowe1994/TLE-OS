import { fetchListingBook, type ListingBook } from "./rex-listings";
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
const CACHE_KEY_BASE = "listings:v3";

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
