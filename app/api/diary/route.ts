import { NextResponse } from "next/server";
import { fetchDiary, type DiaryBook } from "@/lib/rex-diary";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";

/**
 * The team's diary, cached — same manners as leads and listings.
 *
 * Held briefly (two minutes): a diary that is ten minutes stale is a diary
 * that shows a slot as free after somebody has taken it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_KEY = "diary:v1";
const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

interface Cached { book: DiaryBook; at: number }

let memory: Cached | null = null;
let refreshing: Promise<Cached> | null = null;

async function readStored(): Promise<Cached | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { book: DiaryBook }; computed_at: Date }>(
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
    refreshing = fetchDiary()
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
    return NextResponse.json({ ok: true, live: false, reason: "REX isn't connected here — the sample diary is standing in." });
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
