import "server-only";
import type { NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";

/**
 * Who may open the deposit register.
 *
 * It was built as Admin > Compliance > Deposits for everyone who can open
 * Admin (James, 19 Nov 2026). Michael could not find it (23 Nov 2026): his
 * role lands on the compliance desk and never opens Admin, so James asked
 * for it on his desk too, with the same reach Admin has - read, fill in,
 * upload, download.
 *
 * Named people, not a role, for the reason the PLC approvers and the team
 * admins are: Michael's role is shared with the rest of the office so they
 * can cover for each other, and giving the role this would quietly give it
 * to all of them. James's answer was Michael only.
 *
 * Held in os_settings under "deposit_register_people" so it can change
 * without a deploy. Everyone who can open Admin always counts.
 */
const KEY = "deposit_register_people";
export const DEFAULT_DEPOSIT_PEOPLE = ["michael.healy@thelettingexperts.co.uk"];

const clean = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))]
    : [];

export async function depositPeople(): Promise<string[]> {
  if (!hasDb()) return DEFAULT_DEPOSIT_PEOPLE;
  try {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
    const saved = clean(rows[0]?.value?.emails);
    return saved.length ? saved : DEFAULT_DEPOSIT_PEOPLE;
  } catch {
    return DEFAULT_DEPOSIT_PEOPLE;
  }
}

/** Admin, and the named list. */
export async function seesDeposits(user: Pick<OsUser, "email" | "role"> | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (can(user.role, "admin:open")) return true;
  const e = (user.email ?? "").trim().toLowerCase();
  return e !== "" && (await depositPeople()).includes(e);
}

/**
 * The signed-in person, if the register is theirs to open. Decided on the
 * ACTOR, never the subject, as every admin gate is (lib/admin).
 */
export async function depositActor(req: NextRequest): Promise<OsUser | null> {
  const { actor } = await whoIs(req);
  return actor && (await seesDeposits(actor)) ? actor : null;
}
