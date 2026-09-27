import "server-only";
import { hasDb, q } from "@/lib/business/db";
import { noteFailure } from "@/lib/auto-bugs";

/**
 * EVERY CALL WE MAKE TO PROPOLY, COUNTED (27 Sep 2026).
 *
 * Propoly limits our key to a quota (40,000, the last they told us) and when
 * it runs out every call answers 429 "Limit Exceeded" until it resets - that
 * is what froze the pre-tenancy board from 21 Sep. Nothing counted our calls,
 * so the only warning was the lock-out. Now every request is counted, per day
 * and per product, in the shared propoly_cache table (the TLE portal counts
 * into the same day under its own name), and the day's total is checked
 * against the quota: a line in the log at 50%, a ticket on the bug list at
 * 70% and 90%, so there is time to act before Propoly stops answering.
 *
 * Counting never slows a call: it adds to a number in memory and a timer
 * writes the numbers out every twenty seconds.
 */

const APP = "os";
const QUOTA = Number(process.env.PROPOLY_DAILY_QUOTA) > 0 ? Number(process.env.PROPOLY_DAILY_QUOTA) : 40_000;
const FLUSH_MS = 20_000;

interface Meter {
  day: string;
  calls: number;
  refused: number;
  timer: ReturnType<typeof setTimeout> | null;
  warned: Record<string, boolean>;
}
declare global {
  // eslint-disable-next-line no-var
  var __propolyMeter: Meter | undefined;
}
const meter: Meter = (globalThis.__propolyMeter ??= { day: "", calls: 0, refused: 0, timer: null, warned: {} });

const londonDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const rowKey = (day: string, app: string) => `calls:${day}:${app}`;

/** One request went to Propoly. `status` is what it answered. */
export function countPropolyCall(status: number): void {
  const day = londonDay();
  if (meter.day && meter.day !== day && (meter.calls || meter.refused)) void flush();
  meter.day = day;
  meter.calls += 1;
  if (status === 429) meter.refused += 1;
  if (!meter.timer) meter.timer = setTimeout(() => void flush(), FLUSH_MS);
}

async function flush(): Promise<void> {
  if (meter.timer) clearTimeout(meter.timer);
  meter.timer = null;
  const { day, calls, refused } = meter;
  meter.calls = 0;
  meter.refused = 0;
  if (!calls || !hasDb()) return;
  try {
    await q(
      `INSERT INTO propoly_cache (key, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET updated_at = NOW(), data = json_build_object(
         'calls', COALESCE((propoly_cache.data::json->>'calls')::int, 0) + $3,
         'refused', COALESCE((propoly_cache.data::json->>'refused')::int, 0) + $4)::text`,
      [rowKey(day, APP), JSON.stringify({ calls, refused }), calls, refused]
    );
    const total = (await dayUsage(day)).calls;
    for (const [pct, level] of [[90, "ticket"], [70, "ticket"], [50, "log"]] as const) {
      const flag = `${day}:${pct}`;
      if (total < (QUOTA * pct) / 100 || meter.warned[flag]) continue;
      meter.warned[flag] = true;
      const line = `${total.toLocaleString("en-GB")} Propoly calls today, ${pct}% of the ${QUOTA.toLocaleString("en-GB")} quota`;
      console.log(`[propoly] ${line}`);
      if (level === "ticket") noteFailure({ source: "Propoly", what: "quota", status: 0, message: `${line} - slow the polling or ask Propoly for more` });
      break;
    }
  } catch {
    /* a lost count costs nothing but accuracy */
  }
}

export interface PropolyUsage {
  day: string;
  calls: number;
  refused: number;
  byApp: Record<string, number>;
  quota: number;
}

/** Calls made on one London day (today by default), both products together. */
export async function dayUsage(day = londonDay()): Promise<PropolyUsage> {
  const out: PropolyUsage = { day, calls: 0, refused: 0, byApp: {}, quota: QUOTA };
  if (!hasDb()) return out;
  const rows = await q<{ key: string; data: string }>(`SELECT key, data FROM propoly_cache WHERE key LIKE $1`, [`calls:${day}:%`]).catch(() => []);
  for (const r of rows) {
    const d = JSON.parse(r.data) as { calls?: number; refused?: number };
    const app = r.key.split(":")[2] ?? "?";
    out.byApp[app] = (out.byApp[app] ?? 0) + (d.calls ?? 0);
    out.calls += d.calls ?? 0;
    out.refused += d.refused ?? 0;
  }
  return out;
}
