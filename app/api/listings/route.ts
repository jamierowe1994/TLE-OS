import { NextResponse } from "next/server";
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
const CACHE_KEY = "listings:v2";
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000;

interface Cached {
  book: ListingBook;
  at: number;
}

let memory: Cached | null = null;
let refreshing: Promise<Cached> | null = null;

async function readStored(): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { book: ListingBook }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [CACHE_KEY]
    );
    if (!rows[0]) return null;
    return { book: rows[0].payload.book, at: new Date(rows[0].computed_at).getTime() };
  } catch {
    return null;
  }
}

async function store(entry: Cached): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [CACHE_KEY, JSON.stringify({ book: entry.book })]
    );
  } catch {
    /* a cache that won't write is a slow page, not a broken one */
  }
}

function refresh(): Promise<Cached> {
  if (!refreshing) {
    refreshing = fetchListingBook()
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

export async function GET() {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: true,
      live: false,
      reason: "REX isn't connected on this environment — the static export is standing in.",
    });
  }

  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh();
    return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age, stale: true });
  }

  try {
    const fresh = await refresh();
    return NextResponse.json({ ok: true, live: true, ...fresh.book, ageMs: 0 });
  } catch (e) {
    if (held) return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age, stale: true });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
