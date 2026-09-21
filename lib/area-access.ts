import "server-only";
import { hasDb, q } from "@/lib/db";
import { AREA_DEFS, type AreaAccess, type AreaLevel } from "@/lib/area-map";
import type { OsUser } from "@/lib/users";

/**
 * The stored half of the area switches: which position each area is in, and
 * who the testers are. The map of what each area owns lives in lib/area-map.
 *
 * Read on every gated write (through the middleware's short cache), so it is
 * two small queries and nothing else. A database that does not answer reads as
 * no rows, which is `everyone` - the switches exist to control a rollout, and
 * a hiccup in them must never lock the whole pilot out of the product.
 */

const LEVELS: AreaLevel[] = ["hidden", "look", "practice", "testers", "everyone"];
export const isLevel = (v: unknown): v is AreaLevel => LEVELS.includes(v as AreaLevel);

export interface AreaRow {
  id: string;
  label: string;
  phase: 1 | 2;
  canHide: boolean;
  /** The area a single button sits in, when this row is a button. */
  parent: string | null;
  level: AreaLevel;
  changedBy: string | null;
  changedAt: string | null;
}

export async function areaRows(): Promise<AreaRow[]> {
  const stored = new Map<string, { level: string; changed_by: string; changed_at: Date | string }>();
  if (hasDb()) {
    const rows = await q<{ area: string; level: string; changed_by: string; changed_at: Date | string }>(
      `SELECT area, level, changed_by, changed_at FROM os_area_access`
    ).catch(() => []);
    for (const r of rows) stored.set(r.area, r);
  }
  return AREA_DEFS.map((a) => {
    const s = stored.get(a.id);
    const level = s && isLevel(s.level) ? s.level : "everyone";
    return {
      id: a.id,
      label: a.label,
      phase: a.phase,
      canHide: a.canHide,
      parent: a.parent ?? null,
      /* A stored "hidden" on an area that cannot hide reads as look only. */
      level: level === "hidden" && !a.canHide ? "look" : level,
      changedBy: s?.changed_by ?? null,
      changedAt: s ? new Date(s.changed_at).toISOString() : null,
    };
  });
}

export async function setAreaLevel(area: string, level: AreaLevel, by: string): Promise<void> {
  const def = AREA_DEFS.find((a) => a.id === area);
  if (!def) throw new Error("No such area.");
  if (level === "hidden" && !def.canHide) throw new Error(`${def.label} cannot be hidden - it is where everybody lands.`);
  if (!hasDb()) throw new Error("No database on this environment.");
  await q(
    `INSERT INTO os_area_access (area, level, changed_by, changed_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (area) DO UPDATE SET level = EXCLUDED.level, changed_by = EXCLUDED.changed_by, changed_at = NOW()`,
    [area, level, by]
  );
}

export async function areaTesters(): Promise<{ email: string; addedBy: string; addedAt: string }[]> {
  if (!hasDb()) return [];
  const rows = await q<{ email: string; added_by: string; added_at: Date | string }>(
    `SELECT email, added_by, added_at FROM os_area_testers ORDER BY added_at`
  ).catch(() => []);
  return rows.map((r) => ({ email: r.email, addedBy: r.added_by, addedAt: new Date(r.added_at).toISOString() }));
}

export async function addAreaTester(email: string, by: string): Promise<void> {
  if (!hasDb()) throw new Error("No database on this environment.");
  await q(`INSERT INTO os_area_testers (email, added_by) VALUES (lower($1), $2) ON CONFLICT (email) DO NOTHING`, [email.trim(), by]);
}

export async function removeAreaTester(email: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_area_testers WHERE email = lower($1)`, [email.trim()]);
}

/**
 * What this person may see and do, area by area.
 *
 * Only the `agent` role is gated - see lib/area-map for why Kirstie, Michael
 * and marketing are not.
 */
export async function accessFor(user: Pick<OsUser, "email" | "role"> | null): Promise<AreaAccess> {
  if (!user || user.role !== "agent") return { gated: false, tester: false, levels: {} };
  const [rows, testers] = await Promise.all([areaRows(), areaTesters()]);
  const levels: Record<string, AreaLevel> = {};
  for (const r of rows) levels[r.id] = r.level;
  const me = user.email.trim().toLowerCase();
  return { gated: true, tester: testers.some((t) => t.email === me), levels };
}
