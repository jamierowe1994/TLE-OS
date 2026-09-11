import "server-only";
import { hasDb, q } from "@/lib/db";
import { worksSummary, type WorksSummary } from "@/lib/works-orders";

/**
 * What the maintenance board looked like on a given day.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * James's mockup of the page carried "↑ 3 from last month" under each of the
 * four figures, and there was no honest way to draw it: nothing anywhere kept
 * yesterday's counts, let alone last month's. A made-up trend on a screen
 * somebody uses to decide what to chase is worse than no trend, so the tiles
 * shipped without it (10 Sep 2026) and he asked for the snapshot instead.
 *
 * One row a day, written by the daily cron. The delta is this morning's
 * figures against the row nearest to a month ago — and until such a row
 * exists, there is no delta and the tile says nothing. It starts telling the
 * truth roughly a month after the first run, which is the earliest it could
 * tell the truth at all.
 *
 * Deliberately the WHOLE summary rather than four numbers: the snapshot costs
 * the same either way, and the next figure somebody wants to trend is already
 * in the row rather than needing another month's wait.
 */

export interface WorksSnapshot {
  day: string; // YYYY-MM-DD
  summary: WorksSummary;
}

/** Today's figures, written once a day. Safe to run again - the day is the key. */
export async function snapshotWorks(): Promise<{ ok: boolean; day: string; summary: WorksSummary | null }> {
  if (!hasDb()) return { ok: false, day: "", summary: null };
  const summary = await worksSummary();
  const day = new Date().toISOString().slice(0, 10);
  await q(
    `INSERT INTO os_works_snapshots (day, summary) VALUES ($1, $2)
       ON CONFLICT (day) DO UPDATE SET summary = EXCLUDED.summary, taken_at = NOW()`,
    [day, JSON.stringify(summary)]
  );
  return { ok: true, day, summary };
}

/**
 * The row nearest to `daysBack` ago, and never one from the future.
 *
 * Nearest rather than exact: the cron can miss a night - a deploy, a REX
 * outage, a month with a 31st - and an exact-date lookup would silently drop
 * the whole comparison for a day. A window of a week either side of the
 * target keeps it honest without pretending a gap did not happen; outside
 * that, there is no answer and the screen says nothing.
 */
export async function worksSnapshotAround(daysBack = 30): Promise<WorksSnapshot | null> {
  if (!hasDb()) return null;
  const rows = await q<{ day: string; summary: WorksSummary }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, summary
       FROM os_works_snapshots
      WHERE day BETWEEN (CURRENT_DATE - ($1 + 7)::int) AND (CURRENT_DATE - ($1 - 7)::int)
      ORDER BY abs(day - (CURRENT_DATE - $1::int)) ASC
      LIMIT 1`,
    [daysBack]
  ).catch(() => []);
  return rows[0] ?? null;
}

/** How many days of history we hold, so a screen can say "not yet" honestly. */
export async function worksHistoryDays(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ n: string }>(
    `SELECT coalesce(CURRENT_DATE - min(day), 0)::text AS n FROM os_works_snapshots`
  ).catch(() => []);
  return Number(rows[0]?.n ?? 0);
}
