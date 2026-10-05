import "server-only";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";
import { ALERT_TYPES, isAlertRule, isAlertType, type AlertRule, type AlertType, type AlertTypeDef } from "@/lib/alert-types";

/**
 * Who has said what about phone alerts (5 Oct 2026). See lib/alert-types.
 *
 *   James's rules    os_settings "phone_alerts.rules"  { [type]: off | on | always }
 *   a person's own   os_user_prefs "alerts.phone"      { [type]: true | false }
 *
 * Nothing written means on, both ways, so a type added later arrives switched
 * on for everybody until somebody says otherwise.
 */

const RULES_KEY = "phone_alerts.rules";
const MINE_KEY = "alerts.phone";

export type Rules = Partial<Record<AlertType, AlertRule>>;
export type Mine = Partial<Record<AlertType, boolean>>;

export async function alertRules(): Promise<Rules> {
  if (!hasDb()) return {};
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_settings WHERE key = $1`, [RULES_KEY]);
  const v = rows[0]?.value;
  const out: Rules = {};
  if (v && typeof v === "object") for (const [k, r] of Object.entries(v)) if (isAlertType(k) && isAlertRule(r)) out[k] = r;
  return out;
}

export async function setAlertRule(type: AlertType, rule: AlertRule, by: string): Promise<Rules> {
  const next = { ...(await alertRules()), [type]: rule };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [RULES_KEY, JSON.stringify(next), by]
  );
  return next;
}

export async function myAlerts(userId: string): Promise<Mine> {
  if (!hasDb()) return {};
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, MINE_KEY]);
  const v = rows[0]?.value;
  const out: Mine = {};
  if (v && typeof v === "object") for (const [k, on] of Object.entries(v)) if (isAlertType(k) && typeof on === "boolean") out[k] = on;
  return out;
}

export async function setMyAlert(userId: string, type: AlertType, on: boolean): Promise<Mine> {
  const next = { ...(await myAlerts(userId)), [type]: on };
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, MINE_KEY, JSON.stringify(next)]
  );
  return next;
}

/** The kinds that can ever reach this person, in the order the app lists them. */
export function alertTypesFor(me: OsUser): AlertTypeDef[] {
  const marketing = me.role === "owner" || can(me.role, "see:marketing");
  const ops = me.role === "owner" || can(me.role, "see:pretenancy");
  return ALERT_TYPES.filter((t) => (t.only === "marketing" ? marketing : t.only === "ops" ? ops : true));
}
