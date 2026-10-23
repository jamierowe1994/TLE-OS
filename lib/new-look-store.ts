import "server-only";
import { hasDb, q } from "@/lib/db";
import { areaTesters } from "@/lib/area-access";
import { ALL_OFF, isLookLevel, LOOK_SCREENS, type LookLevel, type LookOn, type LookScreen } from "@/lib/new-look";
import type { OsUser } from "@/lib/users";

/**
 * The stored half of the new-look switches: one os_settings row holding each
 * screen's position. A screen with no position, or a database that does not
 * answer, reads as off - the old screen is the safe answer, never the new one.
 */

const KEY = "new_look";

type Stored = Partial<Record<LookScreen, { level: LookLevel; by: string; at: string }>>;

export interface LookRow {
  id: LookScreen;
  label: string;
  what: string;
  level: LookLevel;
  changedBy: string | null;
  changedAt: string | null;
}

async function stored(): Promise<Stored> {
  if (!hasDb()) return {};
  const rows = await q<{ value: Stored | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  return rows[0]?.value ?? {};
}

export async function lookRows(): Promise<LookRow[]> {
  const s = await stored();
  return LOOK_SCREENS.map((d) => {
    const row = s[d.id];
    return {
      id: d.id,
      label: d.label,
      what: d.what,
      level: row && isLookLevel(row.level) ? row.level : "off",
      changedBy: row?.by ?? null,
      changedAt: row?.at ?? null,
    };
  });
}

export async function setLookLevel(screen: LookScreen, level: LookLevel, by: string): Promise<void> {
  if (!hasDb()) throw new Error("No database on this environment.");
  const next: Stored = { ...(await stored()), [screen]: { level, by, at: new Date().toISOString() } };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify(next), by]
  );
}

/** Which screens this person sees in the new look. */
export async function lookFor(user: Pick<OsUser, "email" | "role"> | null): Promise<LookOn> {
  if (!user) return { ...ALL_OFF };
  const rows = await lookRows();
  const owner = user.role === "owner" || user.role === "super_admin";
  const needTesters = !owner && rows.some((r) => r.level === "testers");
  const me = user.email.trim().toLowerCase();
  const tester = needTesters ? (await areaTesters()).some((t) => t.email === me) : false;
  const on = { ...ALL_OFF };
  for (const r of rows) {
    on[r.id] =
      r.level === "everyone" ||
      (r.level === "testers" && (owner || tester)) ||
      (r.level === "owners" && owner) ||
      /* Only me: the one person who set it, by the address they set it with. */
      (r.level === "me" && (r.changedBy ?? "").trim().toLowerCase() === me);
  }
  return on;
}
