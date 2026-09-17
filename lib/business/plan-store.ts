import "server-only";
import { hasDb, q } from "@/lib/db";
import type { YearPlan } from "@/lib/business/plan-import";

/**
 * Susan's uploaded year plan, one document per year in os_settings.
 *
 * One document rather than a row per cell: the sheet is replaced whole when
 * she sends a new one, and a half-replaced plan (new August, old September)
 * is worse than either version.
 */
const keyFor = (year: number) => `business:plan:${year}`;

export async function getPlan(year: number): Promise<YearPlan | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: YearPlan }>("SELECT value FROM os_settings WHERE key = $1", [keyFor(year)]).catch(() => []);
  const v = rows[0]?.value;
  return v && v.lines ? v : null;
}

export async function savePlan(plan: YearPlan): Promise<void> {
  if (!hasDb()) throw new Error("No database here.");
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [keyFor(plan.year), JSON.stringify(plan), plan.importedBy]
  );
}
