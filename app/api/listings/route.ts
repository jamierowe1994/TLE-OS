import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { fetchListingBook, type ListingBook } from "@/lib/rex-listings";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";

/**
 * The rental book, cached — same two layers as the leads route (memory for
 * speed, os_cache so the first person in after a deploy doesn't pay for
 * everyone) and the same stale-while-revalidate manners.
 *
 * The book changes far more slowly than the lead feed, so it holds longer:
 * a listing added five minutes ago is not the emergency a lead is.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* v2: the book gained the portal write-up. A cached object that grows a field
   keeps serving the old shape under the old key, so the field reads as missing
   on every environment that has already warmed the cache. */
/* v3, and the version bump is load-bearing: the book is now SCOPED, so a
   cached v2 object holds one agent's book under a key that says "everyone".
   Serving that to the next person is a cross-tenant leak, not a stale figure. */
const CACHE_KEY_BASE = "listings:v3";
const cacheKeyFor = (rexUserId: string | null) =>
  rexUserId ? `${CACHE_KEY_BASE}:agent:${rexUserId}` : `${CACHE_KEY_BASE}:all`;
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000;

interface Cached {
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

function refresh(key: string, rexUserId: string | null): Promise<Cached> {
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

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: true,
      live: false,
      reason: "REX isn't connected on this environment — the static export is standing in.",
    });
  }

  /* WHOSE BOOK. Resolved before anything is fetched or read from cache. */
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: true,
      live: false,
      unlinked: true,
      reason:
        "We can't tell which REX user you are, so we can't show you your listings — and we won't show you everybody's. Ask James to link your account.",
    });
  }
  const key = cacheKeyFor(scope.rexUserId);

  const held = memory.get(key) ?? (await readStored(key));
  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age, stale: true });
  }

  try {
    const fresh = await refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...fresh.book, ageMs: 0 });
  } catch (e) {
    if (held) return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age, stale: true });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
