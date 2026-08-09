import { NextResponse } from "next/server";
import { fetchComplianceBook, type ComplianceBook } from "@/lib/rex-compliance";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";

/**
 * The compliance book, cached — and cached HARD.
 *
 * This is the most expensive read in the OS: the whole rental book, then
 * thirty chunked queries against a service that is superlinear-slow. But
 * certificates change a handful of times a week, so an hour-old answer is
 * as good as a fresh one, and the persisted copy means a deploy doesn't
 * cost anybody thirty seconds.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_KEY = "compliance:v1";
const FRESH_MS = 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

interface Cached { book: ComplianceBook; at: number }

let memory: Cached | null = null;
let refreshing: Promise<Cached> | null = null;

async function readStored(): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { book: ComplianceBook }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [CACHE_KEY]
    );
    if (!rows[0]) return null;
    return { book: rows[0].payload.book, at: new Date(rows[0].computed_at).getTime() };
  } catch { return null; }
}

async function store(entry: Cached): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [CACHE_KEY, JSON.stringify({ book: entry.book })]
    );
  } catch { /* slow, not broken */ }
}

function refresh(): Promise<Cached> {
  if (!refreshing) {
    refreshing = fetchComplianceBook()
      .then(async (book) => {
        const entry = { book, at: Date.now() };
        memory = entry;
        await store(entry);
        return entry;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function GET() {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: true, live: false, reason: "REX isn't connected here — the sample book is standing in." });
  }
  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;
  if (held && age < FRESH_MS) return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age });
  if (held && age < STALE_MS) {
    void refresh();
    return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age, stale: true });
  }
  try {
    const fresh = await refresh();
    return NextResponse.json({ ok: true, live: true, ...fresh.book, ageMs: 0 });
  } catch (e) {
    if (held) return NextResponse.json({ ok: true, live: true, ...held.book, ageMs: age, stale: true });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." }, { status: 502 });
  }
}
