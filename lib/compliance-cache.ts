import "server-only";
import { staleForWalk } from "@/lib/rex-outage";
import { certificatesFor, daysUntil, fetchComplianceBook, ukDayNumber, type CertSubject, type ComplianceBook } from "@/lib/rex-compliance";
import { rexConfigured } from "@/lib/rex";
import { inheritFromHouse, sliceBook, sliceCounts } from "@/lib/compliance-slice";
import { londonDay, londonToday } from "@/lib/london-clock";
import { hasDb, q } from "@/lib/db";
import { complianceWithoutArchived } from "@/lib/archived-homes";
import { complianceWithOverrides } from "@/lib/home-overrides";
import { complianceWithAgentMoves } from "@/lib/agent-moves";
import { RULES } from "./staleness";
import { checkingFor, osCertsFor } from "@/lib/os-certs";
import { foldOsCerts } from "@/lib/sweep-certs";

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
/** The last sweep that failed, so a reader that never waits for one can say
 *  it broke rather than "still building" (certificatesFromBook). */
let lastFailure: { at: number; message: string } | null = null;

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
  const held = memory ?? (await readStored());
  /* The service an agent put right on the home's page (lib/home-overrides),
     on a copy: the held book itself is never changed by it. */
  return held ? { ...held, book: await complianceWithAgentMoves(await complianceWithOverrides(held.book)) } : null;
}

/**
 * The same, but a database that does not answer is an error rather than "no
 * book" (26 Oct 2026). For the Maintenance board's done-on-a-certificate
 * check, where reading a failure as "nothing on file" quietly put a dozen
 * finished jobs back on the board for one load. Null still means no book has
 * ever been built.
 */
export async function heldComplianceBookStrict(): Promise<CachedBook | null> {
  if (memory) return memory;
  if (!hasDb()) return null;
  const rows = await q<{ payload: { book: ComplianceBook }; computed_at: Date }>("SELECT payload, computed_at FROM os_cache WHERE key = $1", [CACHE_KEY]);
  if (!rows[0]) return null;
  return { book: rows[0].payload.book, at: new Date(rows[0].computed_at).getTime() };
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

/**
 * A certificate just filed (or verified) on one home, onto the held book at
 * once (Michael, 27 Oct 2026). He uploaded 8 Recreation Terrace's new gas
 * record from the Compliance drawer: REX took it and the file below said
 * "Verified, in date", but the Gas tile above it still read "Expired 27d ago"
 * - the tile reads this book, and only the tracker's Upload asked for it to be
 * rebuilt. A rebuild walks REX for every home, so the one home is patched
 * here and the next full refresh reads the same answer from the database.
 *
 * The book's day counts are from the day it was BUILT (asOfToday moves them
 * on as it is read), so a count worked out today is moved back to that day.
 */
export async function patchHeldHome(propertyId: string): Promise<boolean> {
  const id = String(propertyId);
  const held = memory ?? (await readStored());
  if (!held || !held.book.properties.some((p) => String(p.id) === id)) return false;
  const [vault, checking] = await Promise.all([osCertsFor([id]), checkingFor([id])]);
  const shift = ukDayNumber(londonToday()) - ukDayNumber(londonDay(new Date(held.at).toISOString()));
  const own = Object.fromEntries(
    Object.entries(vault.get(id) ?? {}).map(([k, c]) => [k, c && typeof c.expires === "number" ? { ...c, expires: c.expires + Math.max(0, shift) } : c])
  );
  const ch = checking.get(id) ?? {};
  return patchHeldBook((book) => {
    for (const p of book.properties) {
      if (String(p.id) !== id) continue;
      /* Waiting for a check is read fresh: one verified since the build is not waiting any more. */
      for (const c of Object.values(p.certs)) if (c?.checking) delete c.checking;
      /* A person's mark (not needed, renewal applied) stays with the duty, whatever is filed. */
      const marks = Object.fromEntries(
        Object.entries(p.certs).map(([k, c]) => [k, { notNeeded: c?.notNeeded, renewalApplied: c?.renewalApplied }])
      );
      foldOsCerts(p, own, ch);
      for (const [k, m] of Object.entries(marks)) {
        const c = p.certs[k as keyof typeof p.certs];
        if (!c) continue;
        if (m.notNeeded) c.notNeeded = m.notNeeded;
        if (m.renewalApplied) c.renewalApplied = m.renewalApplied;
      }
    }
  });
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
        lastFailure = null;
        return entry;
      })
      .catch((e: unknown) => {
        lastFailure = { at: Date.now(), message: e instanceof Error ? e.message : String(e) };
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * A held book's day counts, moved on to today (Rig run 4, P-035, 10 Oct 2026).
 * `expires` is "days from the day the book was BUILT", and a book can be held
 * for up to a day: built at 22:30, read at 09:00 the next morning, yesterday's
 * expiry said "0 days" instead of one day over. Every count drops by the UK
 * calendar days since it was built, so every screen and the 30/14/7 chase
 * read today's figure.
 */
function asOfToday(book: ComplianceBook, builtAt: number): ComplianceBook {
  const shift = ukDayNumber(londonToday()) - ukDayNumber(londonDay(new Date(builtAt).toISOString()));
  if (shift <= 0) return book;
  return {
    ...book,
    properties: book.properties.map((p) => ({
      ...p,
      certs: Object.fromEntries(
        Object.entries(p.certs).map(([k, c]) => [k, c && typeof c.expires === "number" ? { ...c, expires: c.expires - shift } : c])
      ) as typeof p.certs,
    })),
  };
}

/**
 * The book, however we can get it fastest.
 *
 * `stale` tells the caller the answer is being refreshed behind them; it is
 * not an error and must not be shown as one.
 */
/* Homes archived in the OS (lib/archived-homes, 27 Oct 2026) are taken off
   on every read, so the desk, the tracker and the chases drop them at once. */
export async function getComplianceBook(): Promise<{
  book: ComplianceBook;
  ageMs: number;
  stale: boolean;
}> {
  const r = await bookAsHeld();
  return { ...r, book: await complianceWithAgentMoves(await complianceWithoutArchived(await complianceWithOverrides(r.book))) };
}

async function bookAsHeld(): Promise<{
  book: ComplianceBook;
  ageMs: number;
  stale: boolean;
}> {
  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;
  /* The REX copy's walk reads it again (lib/rex-outage, 21 Oct 2026). */
  const walk = await staleForWalk(held?.at);

  if (held && age < FRESH_MS && !walk) return { book: asOfToday(held.book, held.at), ageMs: age, stale: false };
  if (held && age < STALE_MS && !walk) {
    /* Caught (1 Oct 2026): a background refresh that failed was an
       unhandled rejection. The held copy stands, and says how old it is. */
    void refreshComplianceBook().catch((e) => console.error("[compliance-cache] background refresh failed", e instanceof Error ? e.message : e));
    return { book: asOfToday(held.book, held.at), ageMs: age, stale: true };
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

/* ------------------------------------------------ one person's homes -- */

export type CertsFromBook =
  | { status: "ready"; certs: ComplianceBook; ageMs: number; stale: boolean; unread: string[] }
  | { status: "pending" }
  | { status: "failed"; message: string };

/** How long a failed sweep is reported as a failure, before the next reader starts another. */
const FAILURE_SHOWN_MS = 5 * 60 * 1000;
/** REX homes read on their own when the book lacks them: three chunks of ten. */
const ON_THEIR_OWN_MAX = 30;

/**
 * Certificates for some homes, out of the held book, never waiting on a
 * sweep (1 Nov 2026). For the landlord portal and every agent's Portfolio,
 * which each used to sweep REX for the whole book themselves (see
 * lib/compliance-slice).
 *
 * The same ages as getComplianceBook - an hour fresh, a day served while a
 * refresh runs behind - but past a day, or with nothing held, it starts the
 * one shared sweep and says "pending" (or "failed", if the last sweep broke)
 * instead of holding a page open for minutes. Nobody is shown a book older
 * than getComplianceBook would show them.
 *
 * Reads `memory` first, which is the book patchHeldHome has just changed:
 * a certificate filed in the OS is on the landlord's page and Portfolio on
 * the next load.
 *
 * A home the book does not hold (a room REX PM links to another room's REX
 * property, a home added since the build) is read on its own with
 * certificatesFor's `only`: no REX call for a home REX has no property for,
 * one search per ten homes for one it does. One that still cannot be read
 * is in `unread`, so the screen can say so rather than show it bare.
 */
export async function certificatesFromBook(subjects: CertSubject[]): Promise<CertsFromBook> {
  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;
  const walk = await staleForWalk(held?.at).catch(() => false);
  const sweep = () => {
    if (!rexConfigured()) return;
    /* Not again straight after one failed: the held copy stands meanwhile. */
    if (lastFailure && Date.now() - lastFailure.at < FAILURE_SHOWN_MS) return;
    void refreshComplianceBook().catch((e) => console.error("[compliance-cache] background refresh failed", e instanceof Error ? e.message : e));
  };
  if (!held || age >= STALE_MS) {
    /* A sweep that has just failed is said as a failure, and not started
       again for a few minutes: every landlord page asking for a fresh walk
       while REX is struggling is the storm this replaced. */
    const failed = lastFailure;
    if (failed && !refreshing && Date.now() - failed.at < FAILURE_SHOWN_MS) return { status: "failed", message: failed.message };
    sweep();
    return { status: "pending" };
  }
  if (age >= FRESH_MS || walk) sweep();

  const book = await complianceWithAgentMoves(await complianceWithoutArchived(await complianceWithOverrides(asOfToday(held.book, held.at))));
  const cut = sliceBook(book, subjects, (iso) => daysUntil(iso));
  const unread: string[] = [];
  if (cut.missing.length) {
    /* At most three REX searches' worth on their own: more than that missing
       is a book that needs rebuilding, not reading round, and they wait for it. */
    let rex = 0;
    const asked = new Set(cut.missing.filter((id) => !/^\d+$/.test(id) || ++rex <= ON_THEIR_OWN_MAX));
    const extra = await certificatesFor(subjects.filter((s) => asked.has(String(s.propertyId))), { only: true }).catch(() => null);
    const got = new Map((extra?.properties ?? []).map((p) => [String(p.id), p]));
    for (const id of cut.missing) {
      const p = got.get(id);
      if (p) cut.properties.push(inheritFromHouse(p, book));
      else unread.push(id);
    }
  }
  return {
    status: "ready",
    certs: { properties: cut.properties, counts: sliceCounts(cut.properties) },
    ageMs: age,
    stale: age >= FRESH_MS || walk,
    unread,
  };
}
