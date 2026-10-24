import { hasDb, q } from "@/lib/db";

/**
 * Stale-while-revalidate for the website feed's own reads, in the same two
 * layers as lib/listings-cache.ts: this process's memory, then os_cache so a
 * fresh container does not make the website's first visitor wait on REX.
 *
 * Fresh: answered from what is held. Ageing (past freshMs, within keepMs):
 * answered from what is held, refreshed behind. Gone (past keepMs) or never
 * held: the read happens now, and if it fails with nothing to fall back on
 * the error is the answer. Never a seed.
 */
export interface Held<T> {
  value: T;
  at: number;
  stale: boolean;
  ageMs: number;
}

const memory = new Map<string, { value: unknown; at: number }>();
const inflight = new Map<string, Promise<{ value: unknown; at: number }>>();

async function readStored<T>(key: string): Promise<{ value: T; at: number } | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { value: T }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [key]
    );
    if (!rows[0]) return null;
    return { value: rows[0].payload.value, at: new Date(rows[0].computed_at).getTime() };
  } catch {
    return null;
  }
}

async function store(key: string, entry: { value: unknown; at: number }): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [key, JSON.stringify({ value: entry.value })]
    );
  } catch {
    /* a cache that will not write is a slow read, not a broken one */
  }
}

function refresh<T>(key: string, work: () => Promise<T>): Promise<{ value: T; at: number }> {
  const live = inflight.get(key);
  if (live) return live as Promise<{ value: T; at: number }>;
  const p = work()
    .then(async (value) => {
      const entry = { value, at: Date.now() };
      memory.set(key, entry);
      await store(key, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export async function swr<T>(
  key: string,
  work: () => Promise<T>,
  { freshMs, keepMs }: { freshMs: number; keepMs: number }
): Promise<Held<T>> {
  const held = (memory.get(key) as { value: T; at: number } | undefined) ?? (await readStored<T>(key));
  const now = Date.now();
  if (held && now - held.at < keepMs) {
    const stale = now - held.at >= freshMs;
    if (stale) void refresh(key, work).catch(() => undefined);
    return { value: held.value, at: held.at, stale, ageMs: now - held.at };
  }
  try {
    const fresh = await refresh(key, work);
    return { value: fresh.value, at: fresh.at, stale: false, ageMs: 0 };
  } catch (err) {
    if (held) return { value: held.value, at: held.at, stale: true, ageMs: now - held.at };
    throw err;
  }
}
