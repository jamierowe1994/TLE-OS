import "server-only";
import { hasDb, q } from "@/lib/db";
import { DEFAULT_PLC_APPROVERS } from "@/lib/plc";

/**
 * Who may give a PLC pack its final approval.
 *
 * James, 30 Sep 2026: the first check is Josel's, then "it gets passed over
 * to either Kirstie or Michael for approval". That is a short list of named
 * people rather than a role, because a role grows: everybody given the
 * compliance role later would quietly become a final approver too.
 *
 * Held in os_settings under "plc_approvers" so it can change from Admin
 * without a deploy. Until somebody saves it, the default in lib/plc applies.
 * Emails, never names, because that is what the session proves.
 */

const KEY = "plc_approvers";

const clean = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))]
    : [];

export async function plcApprovers(): Promise<string[]> {
  if (!hasDb()) return DEFAULT_PLC_APPROVERS;
  try {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
    const saved = clean(rows[0]?.value?.emails);
    return saved.length ? saved : DEFAULT_PLC_APPROVERS;
  } catch {
    return DEFAULT_PLC_APPROVERS;
  }
}

export async function isPlcApprover(email: string | null | undefined): Promise<boolean> {
  const e = (email ?? "").trim().toLowerCase();
  return e !== "" && (await plcApprovers()).includes(e);
}

/** An empty list is refused: nobody could ever approve a pack again. */
export async function savePlcApprovers(emails: string[], by: string): Promise<string[]> {
  const list = clean(emails);
  if (!list.length) throw new Error("Keep at least one person who can give the final approval.");
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify({ emails: list }), by]
  );
  return list;
}
