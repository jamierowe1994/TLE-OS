import "server-only";
import { hashPassword, uid, verifyPassword } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";

/**
 * The people who work here — stored in `os_users`, which the OS owns
 * outright (the database is shared with the portal; see lib/db.ts).
 *
 * Emails are normalised to lower case on the way in and on every lookup,
 * because "James@" and "james@" being two accounts is a support ticket
 * waiting to happen.
 */

export interface OsUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "agent";
  photo: string | null;
  createdAt: string;
}

interface Row extends Record<string, unknown> {
  id: string;
  email: string;
  name: string;
  role: string;
  photo: string | null;
  created_at: Date | string;
  password_hash?: string;
}

function toUser(r: Row): OsUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role === "owner" ? "owner" : "agent",
    photo: r.photo,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();

export async function countUsers(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ n: string }>("SELECT COUNT(*)::text AS n FROM os_users");
  return Number(rows[0]?.n ?? 0);
}

export async function findUserById(id: string): Promise<OsUser | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<Row>(
    "SELECT id, email, name, role, photo, created_at FROM os_users WHERE id = $1",
    [id]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function findUserByEmail(email: string): Promise<OsUser | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    "SELECT id, email, name, role, photo, created_at FROM os_users WHERE email = $1",
    [normaliseEmail(email)]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/** Create a person. The FIRST person to register becomes the owner. */
export async function createUser(params: {
  email: string;
  name: string;
  password: string;
}): Promise<OsUser> {
  const email = normaliseEmail(params.email);
  const first = (await countUsers()) === 0;
  const rows = await q<Row>(
    `INSERT INTO os_users (id, email, name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, photo, created_at`,
    [uid(), email, params.name.trim(), first ? "owner" : "agent", hashPassword(params.password)]
  );
  return toUser(rows[0]);
}

/**
 * Check an email and password.
 *
 * Returns null for both "no such person" and "wrong password", and does the
 * scrypt work either way — otherwise the response time alone tells an
 * attacker which addresses are real.
 */
export async function authenticate(email: string, password: string): Promise<OsUser | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    "SELECT id, email, name, role, photo, created_at, password_hash FROM os_users WHERE email = $1",
    [normaliseEmail(email)]
  );
  const row = rows[0];
  const stored = row?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`;
  const ok = verifyPassword(password, stored);
  if (!row || !ok) return null;
  await q("UPDATE os_users SET last_seen_at = NOW() WHERE id = $1", [row.id]);
  return toUser(row);
}
