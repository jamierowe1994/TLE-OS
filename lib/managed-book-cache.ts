import "server-only";
import { hasDb, q } from "./db";
import { fetchManagedBook } from "./managed-book";
import { certificatesFor, type ComplianceBook } from "./rex-compliance";
import type { ManagedBook } from "./portfolio-types";

/**
 * Two caches for the Portfolio screen, same shape as lib/listings-cache.ts:
 * memory first, the os_cache table behind it so a deploy does not start cold,
 * and one refresh in flight per key so a busy morning is one REX walk.
 *
 * ── Why two, with different clocks ────────────────────────────────────────
 *
 * The BOOK is five REX searches, ten seconds cold. Fresh for ten minutes,
 * served stale for six hours while it refreshes behind.
 *
 * The CERTIFICATES are forty-five ComplianceEntries searches over the same
 * 449 properties — that service is superlinear-slow and capped at 100 rows a
 * call, so it is minutes, not seconds. Fresh for an hour, stale for a day, and
 * when nothing is held at all the route says "pending" and starts the walk
 * rather than making the screen wait for it. Certificates change weekly;
 * nobody needs them re-read while they are looking at the list.
 *
 * ── Keyed by scope, like everything else here ─────────────────────────────
 *
 * An agent's slice and the owner's whole book are different objects under
 * different keys. Serving one person's cached book to the next would be a
 * cross-tenant leak, not a stale figure — see the note in listings-cache.
 */

const BOOK_BASE = "portfolio:v1";
const CERTS_BASE = "portfolio-certs:v1";

export const bookKeyFor = (rexUserId: string | null) =>
  rexUserId ? `${BOOK_BASE}:agent:${rexUserId}` : `${BOOK_BASE}:all`;
export const certsKeyFor = (rexUserId: string | null) =>
  rexUserId ? `${CERTS_BASE}:agent:${rexUserId}` : `${CERTS_BASE}:all`;

export const BOOK_FRESH_MS = 10 * 60 * 1000;
export const BOOK_STALE_MS = 6 * 60 * 60 * 1000;
export const CERTS_FRESH_MS = 60 * 60 * 1000;
export const CERTS_STALE_MS = 24 * 60 * 60 * 1000;

export interface Held<T> {
  data: T;
  at: number;
}

const memory = new Map<string, Held<unknown>>();
const refreshing = new Map<string, Promise<Held<unknown>>>();
/* The last failure per key, so a route can tell "still working on it" from
   "it broke" — a walk that throws must not leave the screen saying pending
   forever. */
const failures = new Map<string, { at: number; message: string }>();

async function readStored<T>(key: string): Promise<Held<T> | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { data: T }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [key]
    );
    if (!rows[0]) return null;
    return { data: rows[0].payload.data, at: new Date(rows[0].computed_at).getTime() };
  } catch {
    return null;
  }
}

async function store<T>(key: string, held: Held<T>): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [key, JSON.stringify({ data: held.data })]
    );
  } catch {
    /* the durable copy is an optimisation, never a dependency */
  }
}

export async function held<T>(key: string): Promise<Held<T> | null> {
  const m = memory.get(key) as Held<T> | undefined;
  if (m) return m;
  const s = await readStored<T>(key);
  if (s) memory.set(key, s);
  return s;
}

export function refresh<T>(key: string, work: () => Promise<T>): Promise<Held<T>> {
  const live = refreshing.get(key) as Promise<Held<T>> | undefined;
  if (live) return live;
  const p = work()
    .then(async (data) => {
      const entry = { data, at: Date.now() };
      memory.set(key, entry);
      failures.delete(key);
      await store(key, entry);
      return entry;
    })
    .catch((e: unknown) => {
      failures.set(key, { at: Date.now(), message: e instanceof Error ? e.message : String(e) });
      throw e;
    })
    .finally(() => {
      refreshing.delete(key);
    });
  refreshing.set(key, p);
  return p;
}

export function inFlight(key: string): boolean {
  return refreshing.has(key);
}

export function failureFor(key: string): { at: number; message: string } | null {
  return failures.get(key) ?? null;
}

/* ------------------------------------------------------------ the book -- */

export async function managedBookFor(rexUserId: string | null): Promise<{
  book: ManagedBook;
  ageMs: number;
  stale: boolean;
}> {
  const key = bookKeyFor(rexUserId);
  const h = await held<ManagedBook>(key);
  const age = h ? Date.now() - h.at : Infinity;
  if (h && age < BOOK_FRESH_MS) return { book: h.data, ageMs: age, stale: false };
  if (h && age < BOOK_STALE_MS) {
    void refresh(key, () => fetchManagedBook(rexUserId)).catch(() => {});
    return { book: h.data, ageMs: age, stale: true };
  }
  try {
    const fresh = await refresh(key, () => fetchManagedBook(rexUserId));
    return { book: fresh.data, ageMs: 0, stale: false };
  } catch (e) {
    /* A stale answer beats no answer, but the caller is told which it is. */
    if (h) return { book: h.data, ageMs: age, stale: true };
    throw e;
  }
}

/* ---------------------------------------------------- the certificates -- */

export type CertsAnswer =
  | { status: "ready"; certs: ComplianceBook; ageMs: number; stale: boolean }
  | { status: "pending" }
  | { status: "failed"; message: string };

export async function managedCertsFor(rexUserId: string | null, book: ManagedBook): Promise<CertsAnswer> {
  const key = certsKeyFor(rexUserId);
  const work = () =>
    certificatesFor(
      book.properties
        .filter((p) => p.propertyId)
        .map((p) => ({ propertyId: p.propertyId as string, name: p.name, locality: p.locality, epcExpiry: p.epcExpiry }))
    );

  const h = await held<ComplianceBook>(key);
  const age = h ? Date.now() - h.at : Infinity;
  if (h && age < CERTS_FRESH_MS) return { status: "ready", certs: h.data, ageMs: age, stale: false };
  if (h && age < CERTS_STALE_MS) {
    void refresh(key, work).catch(() => {});
    return { status: "ready", certs: h.data, ageMs: age, stale: true };
  }

  /* Nothing usable held. Start the walk (or join the one running) and say so.
     A failure inside the last minute is reported as a failure rather than as
     pending, so a refused REX call surfaces instead of spinning. */
  const failed = failureFor(key);
  if (failed && !inFlight(key) && Date.now() - failed.at < 60_000) {
    return { status: "failed", message: failed.message };
  }
  void refresh(key, work).catch(() => {});
  return { status: "pending" };
}
