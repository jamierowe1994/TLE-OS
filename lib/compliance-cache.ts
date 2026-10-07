import "server-only";
import { fetchComplianceBook, type ComplianceBook } from "@/lib/rex-compliance";
import { hasDb, q } from "@/lib/db";
import { RULES } from "./staleness";

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

/* v2 (7 Sep 2026): the book carries the landlord and the tenant now. The
   old entries hold "—" for every home, and would be served stale for a day,
   so the key moves rather than the shape being patched in place. */
/* v4, and the bump is load-bearing: CompProperty now carries `service`, and a
   v3 blob has none, so every let-only home would read as an ordinary managed
   one and be counted as a gap again (7 Sep 2026). */
/* v7 (18 Sep 2026): the book carries the agent and whether they have left.
   A v6 blob has neither, so every leaver's home would read as ours again. */
const CACHE_KEY = "compliance:v7";
/* From lib/staleness, where every kind's window lives with the reason for it.
   An hour to READ a certificate is fine; approving a pack on one is not, and
   that path asks REX itself rather than coming through here. */
export const FRESH_MS = RULES["compliance"].freshMs;
export const STALE_MS = RULES["compliance"].keepMs;

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

/**
 * The book as it is held right now, however old, and never a refresh. For a
 * look-up inside somebody's click (who is the agent on this home?) that must
 * not wait minutes on REX. Null when nothing has been built yet.
 */
export async function heldComplianceBook(): Promise<CachedBook | null> {
  return memory ?? (await readStored());
}

/**
 * Change the held book in place and keep it, without a REX sweep. For a mark
 * a person has just made (not needed) that every screen should show at once;
 * the next full refresh reads the same answer from the database anyway.
 */
export async function patchHeldBook(fn: (book: ComplianceBook) => void): Promise<boolean> {
  const held = memory ?? (await readStored());
  if (!held) return false;
  fn(held.book);
  memory = held;
  /* Keep the book's own age: a mark does not make old REX figures new. */
  if (hasDb()) {
    await q(`UPDATE os_cache SET payload = $2 WHERE key = $1`, [CACHE_KEY, JSON.stringify({ book: held.book })]).catch(() => null);
  }
  return true;
}

export function refreshComplianceBook(): Promise<CachedBook> {
  if (!refreshing) {
    refreshing = fetchComplianceBook()
      .then(async (book) => {
        const entry = { book, at: Date.now() };
        memory = entry;
        await store(entry);
        /* Renewals filed on REX go onto Michael's To verify list (lib/
           cert-register, 2 Oct 2026). Behind the refresh, never holding it
           up, and imported late because cert-register reaches back here. */
        void import("@/lib/cert-register")
          .then((m) => m.feedRexRenewals(book.properties, entry.at))
          .then((r) => (r.queued || r.seeded ? console.log("[cert-register] REX renewals", JSON.stringify(r)) : undefined))
          .catch((e) => console.error("[cert-register] feed failed", e instanceof Error ? e.message : e));
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
    /* Caught (1 Oct 2026): a background refresh that failed was an
       unhandled rejection. The held copy stands, and says how old it is. */
    void refreshComplianceBook().catch((e) => console.error("[compliance-cache] background refresh failed", e instanceof Error ? e.message : e));
    return { book: held.book, ageMs: age, stale: true };
  }
  try {
    const fresh = await refreshComplianceBook();
    return { book: fresh.book, ageMs: 0, stale: false };
  } catch (e) {
    /* No more "a stale answer beats no answer" (4 Oct 2026, compliance going
       live). Past a day old, a held book can call an expired certificate in
       date, and the house rule is that a source that fails shows an error,
       never an old number. Every screen and the chase read through here, so
       none of them can quote a book this old. */
    if (held) {
      const when = new Date(held.at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      throw new Error(`REX did not answer, and the last copy of the compliance book is from ${when}, which is too old to show. Try again in a few minutes.`);
    }
    throw e;
  }
}
