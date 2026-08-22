import "server-only";
import { fetchComplianceBook, type ComplianceBook } from "@/lib/rex-compliance";
import { hasDb, q } from "@/lib/db";

/**
 * The compliance book, cached — and cached HARD.
 *
 * This is the most expensive read in the OS: the whole rental book, then
 * thirty chunked queries against a service that is superlinear-slow. But
 * certificates change a handful of times a week, so an hour-old answer is as
 * good as a fresh one, and the persisted copy means a deploy doesn't cost
 * anybody thirty seconds.
 *
 * Lifted out of `app/api/compliance/route.ts` so Michael's tracker can share
 * the SAME cache rather than triggering a second thirty-second sweep. Two
 * routes each holding their own copy of this logic would eventually disagree
 * about what "fresh" means, and would double the load on the slowest service
 * we talk to.
 *
 * Three ages, deliberately:
 *   fresh (< 1h)  — answer from cache
 *   stale (< 24h) — answer from cache AND refresh behind the request
 *   older         — make the caller wait, because a day-old compliance answer
 *                   could mean an expired certificate reported as in date
 */

const CACHE_KEY = "compliance:v1";
export const FRESH_MS = 60 * 60 * 1000;
export const STALE_MS = 24 * 60 * 60 * 1000;

export interface CachedBook {
  book: ComplianceBook;
  at: number;
}

let memory: CachedBook | null = null;
/** One in-flight refresh, shared. Without this, three simultaneous cold
 *  requests each start their own thirty-second sweep. */
let refreshing: Promise<CachedBook> | null = null;

async function readStored(): Promise<CachedBook | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { book: ComplianceBook }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [CACHE_KEY]
    );
    if (!rows[0]) return null;
    return { book: rows[0].payload.book, at: new Date(rows[0].computed_at).getTime() };
  } catch {
    return null;
  }
}

async function store(entry: CachedBook): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [CACHE_KEY, JSON.stringify({ book: entry.book })]
    );
  } catch {
    /* slow, not broken */
  }
}

export function refreshComplianceBook(): Promise<CachedBook> {
  if (!refreshing) {
    refreshing = fetchComplianceBook()
      .then(async (book) => {
        const entry = { book, at: Date.now() };
        memory = entry;
        await store(entry);
        return entry;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * The book, however we can get it fastest.
 *
 * `stale` tells the caller the answer is being refreshed behind them; it is
 * not an error and must not be shown as one.
 */
export async function getComplianceBook(): Promise<{
  book: ComplianceBook;
  ageMs: number;
  stale: boolean;
}> {
  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) return { book: held.book, ageMs: age, stale: false };
  if (held && age < STALE_MS) {
    void refreshComplianceBook();
    return { book: held.book, ageMs: age, stale: true };
  }
  try {
    const fresh = await refreshComplianceBook();
    return { book: fresh.book, ageMs: 0, stale: false };
  } catch (e) {
    // A stale answer beats no answer, but the caller must be told which it is.
    if (held) return { book: held.book, ageMs: age, stale: true };
    throw e;
  }
}
