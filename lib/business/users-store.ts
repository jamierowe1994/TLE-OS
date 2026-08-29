import "server-only";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/business/data-dir";
import { hasDb, q } from "@/lib/business/db";
import { qShared } from "@/lib/db";
import { isAdminEmail, isPreTenancyEmail } from "@/lib/business/brand";
import type { AdminNote, UserProfile } from "@/lib/business/types";

// User store — dual backend like TEG: Postgres when DATABASE_URL is set,
// otherwise a pretty-printed JSON file under DATA_DIR.

export interface StoredUser extends UserProfile {
  passwordHash: string;
  adminNotes?: AdminNote[]; // internal — stripped before reaching the agent
}

/* ------------------------------------------------------------------------ */
/* Serialization boundaries                                                  */
/* ------------------------------------------------------------------------ */

/** Agent-facing: strip the secret AND internal admin notes. */
export function toPublic(user: StoredUser): UserProfile {
  const { passwordHash: _pw, adminNotes: _notes, ...pub } = user;
  return {
    ...pub,
    isAdmin: isAdminEmail(user.email),
    isPreTenancy: isPreTenancyEmail(user.email),
  };
}

/** Admin-facing: strip only the secret (keeps adminNotes, location, links). */
export function toAdmin(user: StoredUser): UserProfile & { adminNotes?: AdminNote[] } {
  const { passwordHash: _pw, ...adm } = user;
  return {
    ...adm,
    isAdmin: isAdminEmail(user.email),
    isPreTenancy: isPreTenancyEmail(user.email),
  };
}

/* ------------------------------------------------------------------------ */
/* Postgres row mapping                                                      */
/* ------------------------------------------------------------------------ */

interface UserRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  mobile: string;
  photo: string | null;
  agent_key: string | null;
  rex_user_id: string | null;
  meta_campaign_id: string | null;
  location: string | null;
  ads_connected: boolean | null;
  admin_notes: AdminNote[] | null;
  created_at: string | Date;
  password_hash: string;
}

function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    photo: row.photo,
    agentKey: row.agent_key,
    rexUserId: row.rex_user_id,
    metaCampaignId: row.meta_campaign_id,
    location: row.location,
    adsConnected: !!row.ads_connected,
    createdAt: new Date(row.created_at).toISOString(),
    passwordHash: row.password_hash,
    adminNotes: Array.isArray(row.admin_notes) ? row.admin_notes : [],
  };
}

/* ------------------------------------------------------------------------ */
/* JSON fallback                                                             */
/* ------------------------------------------------------------------------ */

const FILE = path.join(DATA_DIR, "users.json");

async function readAllFile(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch {
    return [];
  }
}

async function writeAllFile(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf8");
}

/* ------------------------------------------------------------------------ */
/* Store API                                                                 */
/* ------------------------------------------------------------------------ */

export async function findByEmail(email: string): Promise<StoredUser | null> {
  const needle = email.trim().toLowerCase();
  if (hasDb()) {
    const rows = await q<UserRow>("SELECT * FROM users WHERE email = $1", [
      needle,
    ]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const users = await readAllFile();
  return users.find((u) => u.email.toLowerCase() === needle) ?? null;
}

export async function findById(id: string): Promise<StoredUser | null> {
  if (hasDb()) {
    const rows = await q<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const users = await readAllFile();
  return users.find((u) => u.id === id) ?? null;
}

/* `createUser` and `updateUser` used to live here and have both been removed.
 *
 * Each wrote the portal's `users` table wholesale, `password_hash` and all, so
 * each would throw the moment it was called — and neither had a caller left.
 * Keeping a pair of guaranteed-throwing writers around as "we might need it"
 * is how the next person wires one up and rediscovers the same afternoon of
 * confusion. Portal accounts are created and their passwords set BY THE
 * PORTAL. From here they are read, and their mapping columns are written
 * through `linkUser` below.
 */

/* ------------------------------------------------------------------------ */
/* Linking a portal account to the business                                  */
/* ------------------------------------------------------------------------ */

/** The columns the OS may write on a portal account. Nothing else, ever. */
export interface UserLinks {
  agentKey?: string | null;
  rexUserId?: string | null;
  metaCampaignId?: string | null;
  location?: string | null;
  adminNotes?: AdminNote[];
}

/**
 * Update ONLY the business-mapping columns on a portal account.
 *
 * ── Why this exists rather than `updateUser` ──────────────────────────────
 *
 * `users` is the portal's own account table and the OS is barred from writing
 * it (see lib/business/db.ts). That bar is right, but its stated reason is
 * specific: two products writing ACCOUNTS into one table is how somebody ends
 * up locked out of one by a change made in the other.
 *
 * `agent_key`, `rex_user_id`, `meta_campaign_id`, `location` and `admin_notes`
 * are not accounts. They are the mapping from a person to their book, and
 * getting them wrong cannot lock anybody out of anything — it can only make a
 * partner's figures fail to appear in Susan's roll-up, which is exactly the
 * problem this screen exists to fix. `updateUser` was refused wholesale, so
 * the Save button on the Agents tab had been answering "Couldn't save changes"
 * to every click since the port.
 *
 * So the distinction is drawn at the COLUMN, not the table. This function
 * names the five it may touch; `password_hash` and `email` are unreachable
 * from here by construction rather than by care, which is the only version of
 * that guarantee worth having. Resetting a portal password from the OS stays
 * impossible on purpose — /admin/people sends a proper emailed reset link
 * against the OS's own accounts instead.
 */
export async function linkUser(
  id: string,
  links: UserLinks
): Promise<StoredUser | null> {
  const existing = await findById(id);
  if (!existing) return null;

  const merged: StoredUser = {
    ...existing,
    ...("agentKey" in links ? { agentKey: links.agentKey ?? null } : {}),
    ...("rexUserId" in links ? { rexUserId: links.rexUserId ?? null } : {}),
    ...("metaCampaignId" in links
      ? { metaCampaignId: links.metaCampaignId ?? null }
      : {}),
    ...("location" in links ? { location: links.location ?? null } : {}),
    ...("adminNotes" in links ? { adminNotes: links.adminNotes ?? [] } : {}),
  };

  if (hasDb()) {
    await qShared(
      `UPDATE users SET
         agent_key = $2, rex_user_id = $3, meta_campaign_id = $4,
         location = $5, admin_notes = $6
       WHERE id = $1`,
      [
        merged.id,
        merged.agentKey,
        merged.rexUserId,
        merged.metaCampaignId,
        merged.location,
        JSON.stringify(merged.adminNotes ?? []),
      ],
      "Linking a portal account to the business — agent_key, rex_user_id, " +
        "meta_campaign_id, location and admin_notes only. Never password_hash " +
        "or email: see linkUser in lib/business/users-store.ts."
    );
    return merged;
  }

  const users = await readAllFile();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const { isAdmin: _drop, ...clean } = merged;
  users[idx] = clean as StoredUser;
  await writeAllFile(users);
  return merged;
}

/** Admin list view (adminNotes included, no password hashes), newest first. */
export async function listUsers(): Promise<UserProfile[]> {
  if (hasDb()) {
    const rows = await q<UserRow>(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    return rows.map((r) => toAdmin(rowToUser(r)));
  }
  const users = await readAllFile();
  return users
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map(toAdmin);
}
