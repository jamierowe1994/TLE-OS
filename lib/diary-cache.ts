import "server-only";
import { hasDb, q } from "@/lib/db";
import { fetchDiary, type DiaryBook } from "@/lib/rex-diary";
import { londonDayOffset, londonParts } from "@/lib/london-time";

/**
 * The held copy of the office diary, and the one place it is refreshed.
 *
 * Lifted out of app/api/diary on 19 Sep 2026 so that something other than a
 * person opening a screen can keep it warm. The REX read behind it takes the
 * best part of half a minute, and until now the only thing that ever started
 * one was a request: so the first dashboard of the morning, and the first after
 * every deploy, sat with a hole where Today should be while it ran. The
 * five-minute timer calls warmDiary() now, and a person finds a book already
 * there.
 */

/* v2, 18 Sep 2026: a held book carries times already worked out, and v1's were
   worked out on the UTC clock - an hour early. A new key drops them at deploy. */
const CACHE_KEY = "diary:v2";
export const FRESH_MS = 2 * 60 * 1000;
export const STALE_MS = 60 * 60 * 1000;

export interface Cached { book: DiaryBook; at: number }

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

/** The copy we hold, from this process or the database. Whoever asks decides
 *  whether it is fresh enough. */
export async function heldDiary(): Promise<Cached | null> {
  return memory ?? (await readStored());
}

/** Read the diary again. Callers arriving while one is running join it. */
export function refreshDiaryBook(): Promise<Cached> {
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

/**
 * Keep it warm through the working day. Called from the five-minute timer.
 *
 * Does nothing when the held book is still fresh, nothing outside 06:30-20:00
 * London time (nobody is looking, and it is REX's rate limit too), and never
 * throws: a timer that fails because the diary did is a timer that stops
 * doing its real job.
 */
export async function warmDiary(): Promise<"fresh" | "warmed" | "asleep" | "failed"> {
  const { hour, minute } = londonParts(new Date());
  const mins = hour * 60 + minute;
  if (mins < 6 * 60 + 30 || mins >= 20 * 60) return "asleep";
  const held = await heldDiary();
  if (held && londonDayOffset(held.at) === 0 && Date.now() - held.at < FRESH_MS) return "fresh";
  try {
    await refreshDiaryBook();
    return "warmed";
  } catch {
    return "failed";
  }
}
