import "server-only";
import { hasDb, q } from "@/lib/db";
import { lockedUsers } from "@/lib/session-revoke";
import { record } from "@/lib/audit";
import type { OsUser } from "@/lib/users";

/**
 * Locking somebody out (James, 10 Oct 2026).
 *
 * The button for the day a partner hands in their notice, or the read log
 * (lib/read-log) shows somebody copying the book. One press on their file in
 * Admin > People and every session they hold - laptop, phone, the app, a
 * browser an AI is driving for them - is refused:
 *
 *   - verifySessionToken refuses them from this process's locked list, kept
 *     with the sign-outs in lib/session-revoke and refreshed every 30 seconds,
 *     so every server instance has it inside half a minute (this one at once);
 *   - whoIs reads the lock off their row on every request, so the screens
 *     that ask who you are refuse them straight away;
 *   - the middleware asks /api/auth/lock-state, so the next page or call
 *     takes them to sign-in and clears the cookie;
 *   - sign-in says their access is paused, once the password is right.
 *
 * Nothing is deleted: their account, their work and their history stay as
 * they were, and Unlock lets them straight back in. Both are in the audit
 * trail with who pressed it and why.
 *
 * Owners cannot be locked from the screen, and nobody can lock themselves:
 * a button that can lock the last owner out of the business is one press
 * from a very bad afternoon.
 */

export const LOCKED_MESSAGE = "Your access to TLE OS has been paused. Speak to James.";

export interface LockState {
  locked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  reason: string;
}

export async function lockStateOf(userId: string): Promise<LockState> {
  const none: LockState = { locked: false, lockedAt: null, lockedBy: null, reason: "" };
  if (!hasDb() || !userId) return none;
  const rows = await q<{ locked_at: Date | string | null; locked_by: string | null; locked_reason: string }>(
    `SELECT locked_at, locked_by, locked_reason FROM os_users WHERE id = $1`,
    [userId]
  );
  const r = rows[0];
  if (!r?.locked_at) return none;
  return { locked: true, lockedAt: new Date(r.locked_at).toISOString(), lockedBy: r.locked_by, reason: r.locked_reason ?? "" };
}

type Target = { id: string; email: string; role: string };

/** Why this owner may not lock this person, or null when they may. */
export function lockRefusal(by: OsUser, target: Target): string | null {
  if (by.role !== "owner") return "Only an owner can lock somebody out.";
  if (target.id === by.id) return "You can't lock yourself out.";
  if (target.role === "owner") return "Owners can't be locked out from here.";
  return null;
}

export async function lockUser(by: OsUser, target: Target, reason: string, ip = ""): Promise<void> {
  const why = reason.trim().slice(0, 500);
  await q(
    `UPDATE os_users SET locked_at = NOW(), locked_by = $2, locked_reason = $3 WHERE id = $1`,
    [target.id, by.email, why]
  );
  /* This instance refuses them now; the others within the half minute. */
  lockedUsers().add(target.id);
  await record({
    kind: "user_locked",
    actorId: by.id,
    actorEmail: by.email,
    subjectId: target.id,
    subjectEmail: target.email,
    detail: why,
    ip,
  });
}

export async function unlockUser(by: OsUser, target: Target, ip = ""): Promise<void> {
  await q(`UPDATE os_users SET locked_at = NULL, locked_by = NULL, locked_reason = '' WHERE id = $1`, [target.id]);
  lockedUsers().delete(target.id);
  await record({
    kind: "user_unlocked",
    actorId: by.id,
    actorEmail: by.email,
    subjectId: target.id,
    subjectEmail: target.email,
    ip,
  });
}
