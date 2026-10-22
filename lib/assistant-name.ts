import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * What an agent calls the assistant (the agents' call, 20 Oct 2026: Kirstie,
 * "Steve doesn't work here in Scotland, can we have Hamish?"; James, "maybe I
 * should let you guys nickname him"). One name per person, kept in
 * os_user_prefs. Steve when they haven't chosen. Only the words change: the
 * character, his memory and his tools are the same.
 */
export const DEFAULT_ASSISTANT_NAME = "Steve";
const KEY = "assistant-name";

export const cleanAssistantName = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return /^[A-Za-z][A-Za-z' -]{0,19}$/.test(s) ? s : null;
};

export async function assistantNameFor(userId: string | null | undefined): Promise<string> {
  if (!userId || !hasDb()) return DEFAULT_ASSISTANT_NAME;
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, KEY]).catch(() => []);
  const v = rows[0]?.value;
  return cleanAssistantName(typeof v === "string" ? v : (v as { name?: unknown } | null)?.name) ?? DEFAULT_ASSISTANT_NAME;
}

export async function setAssistantName(userId: string, name: string | null): Promise<string> {
  const clean = name ? cleanAssistantName(name) : null;
  if (!clean || clean === DEFAULT_ASSISTANT_NAME) {
    await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, KEY]);
    return DEFAULT_ASSISTANT_NAME;
  }
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, KEY, JSON.stringify({ name: clean })]
  );
  return clean;
}
