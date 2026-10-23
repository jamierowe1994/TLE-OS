import "server-only";
import type { NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import type { OsUser } from "@/lib/users";

/**
 * Who may add people, send a password reset and set roles, without holding
 * the owner's whole People screen (James, 23 Oct 2026: "give access to Kirstie
 * so she can add people to the system, so it's not reliant on me").
 *
 * Named people, not a role, for the reason the PLC approvers are: Kirstie's
 * role is shared with Michael and Josel so the office can cover for each
 * other, and giving the role this would quietly give it to all three.
 *
 * Held in os_settings under "team_admins" so it can change without a deploy.
 * Owners always count. A team admin never opens a person's file or views as
 * them; that stays on the owner's People screen (manage:people).
 */
const KEY = "team_admins";
export const DEFAULT_TEAM_ADMINS = ["kirstie.mulholland@thelettingexperts.co.uk"];

const clean = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))]
    : [];

export async function teamAdmins(): Promise<string[]> {
  if (!hasDb()) return DEFAULT_TEAM_ADMINS;
  try {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
    const saved = clean(rows[0]?.value?.emails);
    return saved.length ? saved : DEFAULT_TEAM_ADMINS;
  } catch {
    return DEFAULT_TEAM_ADMINS;
  }
}

/** Owners, and the named list. */
export async function isTeamAdmin(user: Pick<OsUser, "email" | "role"> | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (user.role === "owner") return true;
  const e = (user.email ?? "").trim().toLowerCase();
  return e !== "" && (await teamAdmins()).includes(e);
}

/** The signed-in person, if they may run the team. Decided on the actor, never somebody being viewed as. */
export async function requireTeamAdmin(req: NextRequest): Promise<OsUser | null> {
  const { actor } = await whoIs(req);
  return actor && (await isTeamAdmin(actor)) ? actor : null;
}
