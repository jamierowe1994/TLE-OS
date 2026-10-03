import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { getAppraisal } from "@/lib/appraisal-store";
import { threadFor, markThreadRead, type ThreadMessage } from "@/lib/appraisal-messages";
import { isOwner } from "@/lib/agent-words";
import { milesBetween } from "@/lib/m-match";
import type { OsUser } from "@/lib/users";

/**
 * CHATS on the agent's phone (James, 3 Oct 2026). Two halves:
 *
 *   WORK  what customers wrote through their portals - a landlord on their
 *         property file (os_landlord_messages, per appraisal) and a tenant
 *         from the tenant portal (os_tenant_messages, per account). An agent
 *         sees their own: the appraisal is theirs, or the message was sent to
 *         them. An owner sees everyone's.
 *   PLAY  the team's own chat: General, open to all, where a post can be a
 *         question that others answer; and huddles - small groups a person
 *         starts and invites colleagues into, found by their patch.
 *
 * A patch is the town and area an agent says they work (os_user_prefs
 * "agent-patch"), set by them in Profile. Never a home address: the Team Hub's
 * home_address stays out of every list, as lib/teg-people says.
 */

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/* ─────────────────────────────── WORK ─────────────────────────────── */

export interface WorkThread {
  key: string;
  kind: "landlord" | "tenant";
  /** The landlord's or tenant's name. */
  name: string;
  /** The home it is about, where known. */
  about: string;
  last: { body: string; from: "customer" | "agent"; at: string };
  unread: number;
}

export async function workThreads(me: OsUser): Promise<WorkThread[]> {
  if (!hasDb()) return [];
  const all = isOwner(me);
  const out: WorkThread[] = [];

  /* Landlords: one thread per appraisal. */
  const landlord = await q<{ appraisal_id: string; account_id: string; name: string; body: string; direction: string; sent_at: Date; unread: number; to_me: boolean }>(
    `SELECT DISTINCT ON (m.appraisal_id) m.appraisal_id, m.account_id, COALESCE(a.name, '') AS name, m.body, m.direction, m.sent_at,
            (SELECT count(*)::int FROM os_landlord_messages u WHERE u.appraisal_id = m.appraisal_id AND u.direction = 'landlord' AND u.read_at IS NULL) AS unread,
            EXISTS (SELECT 1 FROM os_landlord_messages t WHERE t.appraisal_id = m.appraisal_id AND lower(t.to_email) = lower($1)) AS to_me
       FROM os_landlord_messages m
       LEFT JOIN os_portal_accounts a ON a.id = m.account_id
      WHERE m.appraisal_id IS NOT NULL
      ORDER BY m.appraisal_id, m.sent_at DESC
      LIMIT 300`,
    [me.email]
  ).catch(() => []);
  const appraisals = await Promise.all(landlord.map((r) => getAppraisal(r.appraisal_id).catch(() => null)));
  landlord.forEach((r, i) => {
    const ma = appraisals[i];
    if (!all && !r.to_me && !same(ma?.agent, me.name)) return;
    out.push({
      key: `landlord:${r.appraisal_id}`,
      kind: "landlord",
      name: r.name || ma?.landlord || "A landlord",
      about: ma?.address ?? "",
      last: { body: r.body, from: r.direction === "agent" ? "agent" : "customer", at: iso(r.sent_at)! },
      unread: r.unread,
    });
  });

  /* Tenants: one thread per portal account. */
  const tenant = await q<{ account_id: string; name: string; email: string; body: string; direction: string; sent_at: Date; unread: number; agent_email: string }>(
    `SELECT DISTINCT ON (m.account_id) m.account_id, COALESCE(a.name, '') AS name, COALESCE(a.email, '') AS email, m.body, m.direction, m.sent_at, m.agent_email,
            (SELECT count(*)::int FROM os_tenant_messages u WHERE u.account_id = m.account_id AND u.direction = 'tenant' AND u.read_at IS NULL) AS unread
       FROM os_tenant_messages m
       LEFT JOIN os_portal_accounts a ON a.id = m.account_id
      WHERE ($2::boolean OR EXISTS (SELECT 1 FROM os_tenant_messages t WHERE t.account_id = m.account_id AND lower(t.agent_email) = lower($1)))
      ORDER BY m.account_id, m.sent_at DESC
      LIMIT 300`,
    [me.email, all]
  ).catch(() => []);
  for (const r of tenant) {
    out.push({
      key: `tenant:${r.account_id}`,
      kind: "tenant",
      name: r.name || r.email || "A tenant",
      about: "Tenant portal",
      last: { body: r.body, from: r.direction === "agent" ? "agent" : "customer", at: iso(r.sent_at)! },
      unread: r.unread,
    });
  }

  return out.sort((a, b) => b.last.at.localeCompare(a.last.at));
}

export interface WorkMessage {
  id: string;
  from: "customer" | "agent";
  body: string;
  at: string;
}

/** A landlord thread, if it is this agent's to see. */
export async function landlordThread(me: OsUser, appraisalId: string, markRead: boolean) {
  const ma = await getAppraisal(appraisalId).catch(() => null);
  if (!ma) return null;
  if (!isOwner(me) && !same(ma.agent, me.name)) {
    const toMe = await q<{ n: number }>(`SELECT count(*)::int AS n FROM os_landlord_messages WHERE appraisal_id = $1 AND lower(to_email) = lower($2)`, [appraisalId, me.email]).catch(() => []);
    if (!toMe[0]?.n) return null;
  }
  const messages: ThreadMessage[] = await threadFor(appraisalId);
  if (markRead) await markThreadRead(appraisalId);
  return {
    ma,
    title: ma.landlord,
    about: ma.address,
    phone: ma.landlordMobile ?? null,
    email: ma.landlordEmail ?? null,
    messages: messages.map((m): WorkMessage => ({ id: m.id, from: m.from === "agent" ? "agent" : "customer", body: m.body, at: m.sentAt })),
  };
}

type TenantRow = { id: string; direction: string; body: string; sent_at: Date };

export async function tenantMessages(accountId: string): Promise<WorkMessage[]> {
  if (!hasDb()) return [];
  const rows = await q<TenantRow>(`SELECT id, direction, body, sent_at FROM os_tenant_messages WHERE account_id = $1 ORDER BY sent_at ASC LIMIT 300`, [accountId]).catch(() => []);
  return rows.map((r) => ({ id: r.id, from: r.direction === "agent" ? "agent" : "customer", body: r.body, at: iso(r.sent_at)! }));
}

/** A tenant thread, if it is this agent's to see. */
export async function tenantThread(me: OsUser, accountId: string, markRead: boolean) {
  if (!hasDb()) return null;
  const acc = await q<{ name: string; email: string }>(`SELECT name, email FROM os_portal_accounts WHERE id = $1 AND kind = 'tenant'`, [accountId]).catch(() => []);
  if (!acc[0]) return null;
  if (!isOwner(me)) {
    const mine = await q<{ n: number }>(`SELECT count(*)::int AS n FROM os_tenant_messages WHERE account_id = $1 AND lower(agent_email) = lower($2)`, [accountId, me.email]).catch(() => []);
    if (!mine[0]?.n) return null;
  }
  const messages = await tenantMessages(accountId);
  if (markRead) await q(`UPDATE os_tenant_messages SET read_at = NOW() WHERE account_id = $1 AND direction = 'tenant' AND read_at IS NULL`, [accountId]).catch(() => null);
  return { title: acc[0].name || acc[0].email, email: acc[0].email, messages };
}

/** Store a message either way round. Stored first, emailed second, as the landlord twin does. */
export async function addTenantMessage(p: { accountId: string; direction: "tenant" | "agent"; body: string; agentEmail: string; authorId?: string | null }): Promise<WorkMessage> {
  const rows = await q<TenantRow>(
    `INSERT INTO os_tenant_messages (id, account_id, direction, body, agent_email, author_id, read_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $3 = 'agent' THEN NOW() ELSE NULL END)
     RETURNING id, direction, body, sent_at`,
    [uid(), p.accountId, p.direction, p.body, p.agentEmail, p.authorId ?? null]
  );
  const r = rows[0]!;
  return { id: r.id, from: r.direction === "agent" ? "agent" : "customer", body: r.body, at: iso(r.sent_at)! };
}

export async function markTenantEmailed(id: string, error?: string): Promise<void> {
  await q(error ? `UPDATE os_tenant_messages SET email_error = $2 WHERE id = $1` : `UPDATE os_tenant_messages SET emailed_at = NOW() WHERE id = $1`, error ? [id, error.slice(0, 500)] : [id]).catch(() => null);
}

/** The agent a tenant's thread already belongs to, so a reply keeps it there. */
export async function tenantAgentEmail(accountId: string): Promise<string> {
  const rows = await q<{ agent_email: string }>(`SELECT agent_email FROM os_tenant_messages WHERE account_id = $1 AND agent_email <> '' ORDER BY sent_at DESC LIMIT 1`, [accountId]).catch(() => []);
  return rows[0]?.agent_email ?? "";
}

/* ─────────────────────────────── PLAY ─────────────────────────────── */

export const GENERAL = "general";

export interface Room {
  id: string;
  kind: "general" | "huddle";
  name: string;
  members: number;
  last: { body: string; who: string; at: string } | null;
  unread: number;
}

async function ensureGeneral(): Promise<void> {
  await q(`INSERT INTO os_team_rooms (id, kind, name) VALUES ($1, 'general', 'General') ON CONFLICT (id) DO NOTHING`, [GENERAL]).catch(() => null);
}

export async function roomsFor(me: OsUser): Promise<Room[]> {
  if (!hasDb()) return [];
  await ensureGeneral();
  const rows = await q<{ id: string; kind: string; name: string; members: number; body: string | null; who: string | null; at: Date | null; unread: number }>(
    `SELECT r.id, r.kind, r.name,
            (SELECT count(*)::int FROM os_team_members m WHERE m.room_id = r.id) AS members,
            l.body, l.author_name AS who, l.created_at AS at,
            (SELECT count(*)::int FROM os_team_messages x
              WHERE x.room_id = r.id AND x.author_id <> $1 AND x.reply_to IS NULL
                AND x.created_at > COALESCE((SELECT read_at FROM os_team_members y WHERE y.room_id = r.id AND y.user_id = $1), 'epoch')) AS unread
       FROM os_team_rooms r
       LEFT JOIN LATERAL (SELECT body, author_name, created_at FROM os_team_messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) l ON TRUE
      WHERE r.kind = 'general' OR EXISTS (SELECT 1 FROM os_team_members m WHERE m.room_id = r.id AND m.user_id = $1)
      ORDER BY (r.kind = 'general') DESC, COALESCE(l.created_at, r.created_at) DESC`,
    [me.id]
  ).catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "general" ? "general" : "huddle",
    name: r.name,
    members: r.members,
    last: r.body ? { body: r.body, who: r.who ?? "", at: iso(r.at)! } : null,
    unread: r.unread,
  }));
}

export interface TeamMessage {
  id: string;
  authorId: string;
  author: string;
  body: string;
  question: boolean;
  at: string;
  replies: number;
}

/** Can this person read the room? General is everyone's; a huddle is its members'. */
export async function canSee(me: OsUser, roomId: string): Promise<{ kind: "general" | "huddle"; name: string } | null> {
  if (!hasDb()) return null;
  if (roomId === GENERAL) await ensureGeneral();
  const rows = await q<{ kind: string; name: string; member: boolean }>(
    `SELECT kind, name, EXISTS (SELECT 1 FROM os_team_members m WHERE m.room_id = r.id AND m.user_id = $2) AS member FROM os_team_rooms r WHERE id = $1`,
    [roomId, me.id]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return null;
  if (r.kind !== "general" && !r.member) return null;
  return { kind: r.kind === "general" ? "general" : "huddle", name: r.name };
}

export async function roomMessages(me: OsUser, roomId: string, replyTo: string | null): Promise<TeamMessage[]> {
  const rows = await q<{ id: string; author_id: string; author_name: string; body: string; question: boolean; created_at: Date; replies: number }>(
    `SELECT m.id, m.author_id, m.author_name, m.body, m.question, m.created_at,
            (SELECT count(*)::int FROM os_team_messages r WHERE r.reply_to = m.id) AS replies
       FROM os_team_messages m
      WHERE m.room_id = $1 AND ${replyTo ? "(m.reply_to = $2 OR m.id = $2)" : "m.reply_to IS NULL"}
      ORDER BY m.created_at DESC
      LIMIT 200`,
    replyTo ? [roomId, replyTo] : [roomId]
  ).catch(() => []);
  /* How far they have read: a member row, made for General on first open. */
  await q(
    `INSERT INTO os_team_members (room_id, user_id, read_at) VALUES ($1, $2, NOW())
     ON CONFLICT (room_id, user_id) DO UPDATE SET read_at = NOW()`,
    [roomId, me.id]
  ).catch(() => null);
  return rows.reverse().map((r) => ({ id: r.id, authorId: r.author_id, author: r.author_name, body: r.body, question: r.question, at: iso(r.created_at)!, replies: r.replies }));
}

export async function postMessage(me: OsUser, roomId: string, body: string, question: boolean, replyTo: string | null): Promise<TeamMessage> {
  const rows = await q<{ id: string; created_at: Date }>(
    `INSERT INTO os_team_messages (id, room_id, author_id, author_name, body, question, reply_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [uid(), roomId, me.id, me.name, body, question && !replyTo, replyTo]
  );
  await q(`UPDATE os_team_rooms SET last_at = NOW() WHERE id = $1`, [roomId]).catch(() => null);
  return { id: rows[0]!.id, authorId: me.id, author: me.name, body, question: question && !replyTo, at: iso(rows[0]!.created_at)!, replies: 0 };
}

export async function createHuddle(me: OsUser, name: string, userIds: string[]): Promise<string> {
  const id = uid();
  await q(`INSERT INTO os_team_rooms (id, kind, name, created_by) VALUES ($1, 'huddle', $2, $3)`, [id, name, me.id]);
  await addMembers(id, me.id, [me.id, ...userIds]);
  return id;
}

export async function addMembers(roomId: string, by: string, userIds: string[]): Promise<number> {
  const real = await q<{ id: string }>(`SELECT id FROM os_users WHERE id = ANY($1::text[])`, [[...new Set(userIds)]]).catch(() => []);
  for (const u of real) {
    await q(`INSERT INTO os_team_members (room_id, user_id, invited_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [roomId, u.id, by]).catch(() => null);
  }
  return real.length;
}

export async function leaveRoom(me: OsUser, roomId: string): Promise<void> {
  await q(`DELETE FROM os_team_members WHERE room_id = $1 AND user_id = $2`, [roomId, me.id]).catch(() => null);
}

export async function roomMembers(roomId: string): Promise<Array<{ id: string; name: string }>> {
  return q<{ id: string; name: string }>(
    `SELECT u.id, u.name FROM os_team_members m JOIN os_users u ON u.id = m.user_id WHERE m.room_id = $1 ORDER BY u.name`,
    [roomId]
  ).catch(() => []);
}

/* ─────────────────────────────── PATCH ─────────────────────────────── */

export const PATCH_KEY = "agent-patch";

export interface Patch {
  /** What others see: a town. */
  town: string;
  /** What distance is worked out from: a postcode or its first half. */
  area: string;
  lat: number;
  lng: number;
}

export async function patchOf(userId: string): Promise<Patch | null> {
  const rows = await q<{ value: Patch }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, PATCH_KEY]).catch(() => []);
  return rows[0]?.value ?? null;
}

/** "NN1 1AA" or "NN1" -> a point, from postcodes.io (the same service lib/postcode-geo uses). */
export async function placeArea(area: string): Promise<{ lat: number; lng: number; area: string } | null> {
  const a = area.toUpperCase().replace(/\s+/g, " ").trim();
  const full = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(a);
  const out = /^[A-Z]{1,2}\d[A-Z\d]?$/.test(a);
  if (!full && !out) return null;
  try {
    const r = await fetch(`https://api.postcodes.io/${full ? "postcodes" : "outcodes"}/${encodeURIComponent(a)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { result?: { latitude: number | null; longitude: number | null } | null };
    if (j.result?.latitude == null || j.result.longitude == null) return null;
    return { lat: j.result.latitude, lng: j.result.longitude, area: a };
  } catch {
    return null;
  }
}

export async function savePatch(userId: string, patch: Patch | null): Promise<void> {
  if (!patch) {
    await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, PATCH_KEY]).catch(() => null);
    return;
  }
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, PATCH_KEY, JSON.stringify(patch)]
  );
}

export interface Colleague {
  id: string;
  name: string;
  photo: string | null;
  town: string | null;
  miles: number | null;
}

/** Everyone on the team but me: those with a patch nearest first, then the rest by name. */
export async function colleagues(me: OsUser): Promise<{ mine: Patch | null; people: Colleague[] }> {
  const [mine, rows] = await Promise.all([
    patchOf(me.id),
    q<{ id: string; name: string; photo: string | null; patch: Patch | null }>(
      `SELECT u.id, u.name, u.photo, p.value AS patch
         FROM os_users u
         LEFT JOIN os_user_prefs p ON p.user_id = u.id AND p.key = $2
        WHERE u.id <> $1 AND u.name <> ''
        ORDER BY u.name`,
      [me.id, PATCH_KEY]
    ).catch(() => []),
  ]);
  const people = rows.map((r) => ({
    id: r.id,
    name: r.name,
    photo: r.photo,
    town: r.patch?.town ?? null,
    miles: mine && r.patch ? Math.round(milesBetween(mine, r.patch) * 10) / 10 : null,
  }));
  people.sort((a, b) => (a.miles ?? 1e9) - (b.miles ?? 1e9) || a.name.localeCompare(b.name));
  return { mine, people };
}

/* ─────────────────────────────── ALERTS ─────────────────────────────── */

/**
 * What customers wrote to this agent since `since`, for phone alerts
 * (lib/push): a landlord message sent to them, a tenant message for them.
 * Newest first. These go through during a Focus Hour - James: urgent calls
 * "from a landlord or something" should still reach them.
 */
export async function customerMessagesSince(me: OsUser, since: string): Promise<Array<{ at: string; title: string; body: string; href: string }>> {
  if (!hasDb()) return [];
  const [ll, tt] = await Promise.all([
    q<{ appraisal_id: string | null; name: string; body: string; sent_at: Date }>(
      `SELECT m.appraisal_id, COALESCE(a.name, '') AS name, m.body, m.sent_at
         FROM os_landlord_messages m LEFT JOIN os_portal_accounts a ON a.id = m.account_id
        WHERE m.direction = 'landlord' AND m.sent_at > $2 AND lower(m.to_email) = lower($1)
        ORDER BY m.sent_at DESC LIMIT 20`,
      [me.email, since]
    ).catch(() => []),
    q<{ account_id: string; name: string; body: string; sent_at: Date }>(
      `SELECT m.account_id, COALESCE(a.name, a.email, '') AS name, m.body, m.sent_at
         FROM os_tenant_messages m LEFT JOIN os_portal_accounts a ON a.id = m.account_id
        WHERE m.direction = 'tenant' AND m.sent_at > $2 AND lower(m.agent_email) = lower($1)
        ORDER BY m.sent_at DESC LIMIT 20`,
      [me.email, since]
    ).catch(() => []),
  ]);
  return [
    ...ll.map((r) => ({ at: iso(r.sent_at)!, title: `${r.name || "A landlord"} wrote`, body: r.body.slice(0, 160), href: r.appraisal_id ? `/agent/chats/landlord/${encodeURIComponent(r.appraisal_id)}` : "/agent/chats" })),
    ...tt.map((r) => ({ at: iso(r.sent_at)!, title: `${r.name || "A tenant"} wrote`, body: r.body.slice(0, 160), href: `/agent/chats/tenant/${encodeURIComponent(r.account_id)}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

/* ─────────────────────────────── FOCUS ─────────────────────────────── */

export const FOCUS_KEY = "focus";

/** When this person's Focus Hour ends, if one is running. */
export async function focusUntil(userId: string): Promise<string | null> {
  const rows = await q<{ value: { until?: string } }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, FOCUS_KEY]).catch(() => []);
  const until = rows[0]?.value?.until ?? null;
  return until && until > new Date().toISOString() ? until : null;
}

export async function setFocus(userId: string, until: string | null): Promise<void> {
  if (!until) {
    await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, FOCUS_KEY]).catch(() => null);
    return;
  }
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, FOCUS_KEY, JSON.stringify({ until })]
  );
}
