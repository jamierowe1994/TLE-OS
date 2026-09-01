import { NextResponse } from "next/server";
import { fetchDiary, type DiaryBook } from "@/lib/rex-diary";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";
import type { Appt, ApptKind } from "@/lib/diary";

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

/**
 * Appointments made HERE, folded in beside the REX ones.
 *
 * These were being written and never read. `/api/appointments` had a GET that
 * nothing called, so an ad-hoc appointment — and, once buffers existed, a
 * travel block — vanished the moment its modal closed and reappeared nowhere.
 * A diary that silently drops what you put in it is worse than one that never
 * offered, because you stop checking.
 *
 * Read FRESH on every request rather than through the two-minute REX cache:
 * you have to see the thing you just saved, and the REX pull is the slow half
 * that the cache exists for. This is one indexed query against our own table.
 */
async function ours(): Promise<Appt[]> {
  if (!hasDb()) return [];
  try {
    const rows = await q<{
      id: string; starts_at: Date; mins: number; kind: string;
      title: string; where_at: string; who: string; author_name: string;
    }>(
      `SELECT id, starts_at, mins, kind, title, where_at, who, author_name
         FROM os_appointments
        WHERE starts_at > NOW() - INTERVAL '21 days'
          AND starts_at < NOW() + INTERVAL '60 days'
        ORDER BY starts_at`
    );

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    return rows.map((r) => {
      const at = new Date(r.starts_at);
      const onDay = new Date(at.getFullYear(), at.getMonth(), at.getDate());
      return {
        id: `os-${r.id}`,
        // Whole days apart on the LOCAL clock. Subtracting raw timestamps
        // gets this wrong twice a year: the day the clocks change is 23 or
        // 25 hours long, and /86400000 rounds it onto the wrong column.
        day: Math.round((onDay.getTime() - midnight.getTime()) / 86400000),
        start: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
        mins: Math.min(Math.max(r.mins || 30, 15), 8 * 60),
        kind: (["viewing", "appraisal", "takeon", "movein", "inspection", "travel", "other"]
          .includes(r.kind) ? r.kind : "other") as ApptKind,
        what: r.title,
        where: r.where_at ?? "",
        who: r.who ?? "",
        agent: r.author_name ?? "",
        comms: [],
      } satisfies Appt;
    });
  } catch {
    /* The OS's own appointments failing must not take the REX diary down
       with them — a diary short a travel block still beats no diary. */
    return [];
  }
}

/** The REX book with our own entries merged in, sorted as one day reads. */
function merged(book: DiaryBook, mine: Appt[]): DiaryBook {
  if (!mine.length) return book;
  const appts = [...book.appts, ...mine].sort(
    (a, b) => a.day - b.day || a.start.localeCompare(b.start)
  );
  return { ...book, appts };
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
  /* Ours are read OUTSIDE the cache, every time. The two-minute hold exists
     for the slow REX pull; applying it to our own table would mean saving a
     travel buffer and watching the diary insist it isn't there for another
     minute and a half. */
  const mine = await ours();

  if (!rexConfigured()) {
    /* No REX here, so the client is showing the sample book. Hand our own
       entries over separately for it to merge on top — they are real, and
       dropping them because the demo diary is standing in would lose work
       somebody actually did. */
    return NextResponse.json({
      ok: true,
      live: false,
      mine,
      reason: "REX isn't connected here — the sample diary is standing in.",
    });
  }

  const held = memory ?? (await readStored());
  const age = held ? Date.now() - held.at : Infinity;
  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, ...merged(held.book, mine), ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh();
    return NextResponse.json({ ok: true, live: true, ...merged(held.book, mine), ageMs: age, stale: true });
  }
  try {
    const fresh = await refresh();
    return NextResponse.json({ ok: true, live: true, ...merged(fresh.book, mine), ageMs: 0 });
  } catch (e) {
    if (held) {
      return NextResponse.json({ ok: true, live: true, ...merged(held.book, mine), ageMs: age, stale: true });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." }, { status: 502 });
  }
}
