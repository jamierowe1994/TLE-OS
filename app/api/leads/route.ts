import { NextResponse } from "next/server";
import { fetchLeadBook, type LeadBook } from "@/lib/rex-leads";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";

/**
 * The lead book, cached.
 *
 * Reading it costs five REX calls, so doing that on every page view would be
 * both slow and rude to an API the whole business depends on. Two layers:
 *
 *   • memory — instant, dies with the process
 *   • os_cache — survives deploys, so the first person in after a release
 *     doesn't pay for everyone
 *
 * Stale data is served while a refresh runs rather than making someone wait
 * on a spinner: a two-minute-old lead list is worth far more than a blank
 * screen, and the age is sent along so the screen can say which it has.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_KEY = "leads:v1";
const FRESH_MS = 2 * 60 * 1000; // serve without thinking
const STALE_MS = 30 * 60 * 1000; // serve, but refresh behind the scenes

interface Cached {
  book: LeadBook;
  at: number;
}

let memory: Cached | null = null;
let refreshing: Promise<Cached> | null = null;

async function readStored(): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: Cached; computed_at: Date }>(
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
  // Collapse concurrent callers onto one walk — five people opening the page
  // at nine o'clock shouldn't be five trips through REX.
  if (!refreshing) {
    refreshing = fetchLeadBook()
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
      reason: "REX isn't connected on this environment — the demo book is standing in.",
    });
  }

  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh(); // behind the scenes; this caller gets the stale copy now
    return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age, stale: true });
  }

  try {
    const fresh = await refresh();
    return NextResponse.json({ ok: true, live: true, ...fresh.book, ageMs: 0 });
  } catch (e) {
    // Something is better than nothing, however old.
    if (held) {
      return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age, stale: true });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
