import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Who sees the WHOLE business on the Overview board.
 *
 * James, 2 Oct 2026: "the overall list is just for Michael so he can keep
 * track of compliance and stuff... everybody can have their own version of
 * it." So everyone else's Overview is their own homes, and this short list of
 * named people - not a role, because a role grows (lib/plc-approvers has the
 * same reasoning) - gets every home. Owners always see the whole business.
 *
 * Held in os_settings under "overview_whole_business" so it can change without
 * a deploy. Emails, because that is what the session proves.
 */
export const DEFAULT_OVERVIEW_WHOLE = ["michael.healy@thelettingexperts.co.uk"];
const KEY = "overview_whole_business";

export async function overviewWholeList(): Promise<string[]> {
  if (!hasDb()) return DEFAULT_OVERVIEW_WHOLE;
  try {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
    const saved = Array.isArray(rows[0]?.value?.emails)
      ? (rows[0]!.value!.emails as unknown[]).map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@"))
      : [];
    return saved.length ? saved : DEFAULT_OVERVIEW_WHOLE;
  } catch {
    return DEFAULT_OVERVIEW_WHOLE;
  }
}

export async function seesWholeOverview(person: { role: string; email: string | null }): Promise<boolean> {
  if (person.role === "owner") return true;
  const e = (person.email ?? "").trim().toLowerCase();
  return e !== "" && (await overviewWholeList()).includes(e);
}
