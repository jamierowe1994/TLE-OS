import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * What each person opened (James, 10 Oct 2026).
 *
 * "I'm a bad agent, I know I'm leaving, and I set Claude loose on the web
 * pages to copy everything into my own system." An AI driving somebody's own
 * browser signs in as them and clicks like them, so nothing at the door can
 * tell it from the person. What it cannot hide is volume: a person opens tens
 * of records in an hour, a copy job opens hundreds. So every signed-in call is
 * written down - who, what, when, from where - and Admin shows who has been
 * reading how much (lib/read-log-summary: Admin > Activity and each person's
 * file).
 *
 * Collected at the front door, the middleware, because that is the one place
 * every call passes with the person known: some thirty staff routes never ask
 * who is calling themselves, and the landlord on a listing is one of them. The
 * middleware cannot reach the database, so it queues calls in memory and hands
 * them here in batches every few seconds (/api/internal/read-log, signed with
 * AUTH_SECRET). Nothing waits on it, and a failed write is told to the server
 * log and dropped - an access log that can take the site down is worse than a
 * gap in it.
 */

export interface ReadEntry {
  at: number;
  userId: string;
  method: string;
  path: string;
  query: string;
  ip: string;
}

const KEEP_DAYS = 365;
const G = globalThis as { __osReadSweptAt?: number };

/** Clean one entry off the wire, or null. Every field capped. */
export function cleanEntry(v: unknown): ReadEntry | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const text = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");
  const at = typeof o.at === "number" && Number.isFinite(o.at) ? o.at : NaN;
  const userId = text(o.userId, 64);
  const path = text(o.path, 300);
  if (!userId || !path.startsWith("/api/") || !Number.isFinite(at)) return null;
  /* Not from the future, nor from before a restart could have held it. */
  if (at > Date.now() + 60_000 || at < Date.now() - 24 * 3600_000) return null;
  return { at, userId, method: text(o.method, 8) || "GET", path, query: text(o.query, 300), ip: text(o.ip, 64) };
}

export async function writeReadLog(entries: ReadEntry[]): Promise<void> {
  if (!hasDb() || !entries.length) return;
  for (let i = 0; i < entries.length; i += 400) {
    const rows = entries.slice(i, i + 400);
    const params: unknown[] = [];
    const values = rows.map((r, j) => {
      params.push(new Date(r.at), r.userId, r.method, r.path, r.query, r.ip);
      const b = j * 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    });
    await q(`INSERT INTO os_read_log (at, user_id, method, path, query, ip) VALUES ${values.join(", ")}`, params);
  }
  /* A year is kept; older rows are swept once a day, by whichever instance
     writes first that day. */
  if (Date.now() - (G.__osReadSweptAt ?? 0) > 24 * 3600_000) {
    G.__osReadSweptAt = Date.now();
    void q(`DELETE FROM os_read_log WHERE at < NOW() - make_interval(days => $1)`, [KEEP_DAYS]).catch(() => {});
  }
}
