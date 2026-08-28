import { NextRequest, NextResponse } from "next/server";
import { fetchLeadBook, type LeadBook } from "@/lib/rex-leads";
import { scopeFor } from "@/lib/scope";
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

/* v2, and the bump is load-bearing: the book is SCOPED now, so a cached v1
   object holds one agent's leads under a key that says "everyone". Serving
   that to the next person is a cross-tenant leak, not a stale figure. */
const CACHE_KEY_BASE = "leads:v2";
const cacheKeyFor = (rexUserId: string | null) =>
  rexUserId ? `${CACHE_KEY_BASE}:agent:${rexUserId}` : `${CACHE_KEY_BASE}:all`;
const FRESH_MS = 2 * 60 * 1000; // serve without thinking
const STALE_MS = 30 * 60 * 1000; // serve, but refresh behind the scenes

interface Cached {
  book: LeadBook;
  at: number;
}

/* Keyed by scope, not a single slot. One shared `memory` would hand the first
   agent's leads to the second — the exact bug this change exists to prevent,
   reintroduced one layer up. The listings route had the same trap. */
const memory = new Map<string, Cached>();
const refreshing = new Map<string, Promise<Cached>>();

async function readStored(key: string): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: Cached; computed_at: Date }>(
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
  // Collapse concurrent callers onto one walk — five people opening the page
  // at nine o'clock shouldn't be five trips through REX. Per SCOPE, though:
  // collapsing two different agents onto one walk would serve one of them the
  // other's leads.
  const live = refreshing.get(key);
  if (live) return live;
  const p = fetchLeadBook(rexUserId)
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
      reason: "REX isn't connected on this environment — the demo book is standing in.",
    });
  }

  /* WHOSE LEADS. Resolved before anything is fetched or read from cache. */
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: true,
      live: false,
      unlinked: true,
      reason:
        "We can't tell which REX user you are, so we can't show you your leads — and we won't show you everybody's. Ask James to link your account.",
    });
  }
  const key = cacheKeyFor(scope.rexUserId);

  const held = memory.get(key) ?? (await readStored(key));
  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh(key, scope.rexUserId); // behind the scenes; this caller gets the stale copy now
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age, stale: true });
  }

  try {
    const fresh = await refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...fresh.book, ageMs: 0 });
  } catch (e) {
    // Something is better than nothing, however old.
    if (held) {
      return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age, stale: true });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
