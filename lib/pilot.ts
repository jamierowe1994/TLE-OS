import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { normaliseEmail } from "@/lib/users";

/**
 * The pre-launch pilot.
 *
 * About five agents get the platform early. Three things need to be true for
 * that to be worth doing:
 *   1. we can invite them without a deploy
 *   2. we can see what they actually use — and what they NEVER open
 *   3. they can tell us something is broken in one click, from where it broke
 *
 * ── Why "never opened" is the interesting half ────────────────────────────
 *
 * Usage stats normally answer "what is popular". For a pilot the useful
 * question is the opposite: which tab has nobody touched in three weeks? That
 * is either a feature nobody needs or one nobody can find, and both are worth
 * knowing before launch. So `tabUsage` returns EVERY tab, including the zeroes,
 * rather than only the rows that exist.
 */

/** Every tab an agent can reach. The zeroes are the point — see the header. */
export const TRACKED_TABS = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/leads", label: "Leads" },
  { path: "/listings", label: "Listings" },
  { path: "/viewings", label: "Viewings" },
  { path: "/market-appraisals", label: "Market Appraisals" },
  { path: "/applications", label: "Applications" },
  { path: "/compliance", label: "Compliance" },
  { path: "/emails", label: "Emails" },
  { path: "/portfolio", label: "Portfolio" },
  { path: "/finances", label: "Finances" },
  { path: "/profile", label: "Profile" },
] as const;

export interface Invite {
  email: string;
  name: string;
  rexUserId: string | null;
  invitedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
}

export async function invites(): Promise<Invite[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    email: string; name: string; rex_user_id: string | null;
    invited_at: Date; sent_at: Date | null; accepted_at: Date | null;
  }>(`select email, name, rex_user_id, invited_at, sent_at, accepted_at
        from os_invites order by invited_at desc`);
  return rows.map((r) => ({
    email: r.email,
    name: r.name,
    rexUserId: r.rex_user_id,
    invitedAt: new Date(r.invited_at).toISOString(),
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
  }));
}

/** Is this address allowed an account? The invite list IS the allowlist. */
export async function isInvited(email: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ email: string }>(`select email from os_invites where email = $1`, [
    normaliseEmail(email),
  ]);
  return rows.length > 0;
}

export async function addInvite(p: {
  email: string; name?: string; rexUserId?: string | null; by: string;
}): Promise<void> {
  if (!hasDb()) return;
  await q(
    `insert into os_invites (email, name, rex_user_id, invited_by)
     values ($1,$2,$3,$4)
     on conflict (email) do update set name = excluded.name, rex_user_id = excluded.rex_user_id`,
    [normaliseEmail(p.email), p.name ?? "", p.rexUserId ?? null, p.by]
  );
}

export async function markInviteSent(email: string): Promise<void> {
  if (!hasDb()) return;
  await q(`update os_invites set sent_at = now() where email = $1`, [normaliseEmail(email)]);
}

export async function markInviteAccepted(email: string): Promise<void> {
  if (!hasDb()) return;
  await q(`update os_invites set accepted_at = now() where email = $1`, [normaliseEmail(email)]);
}

export async function removeInvite(email: string): Promise<void> {
  if (!hasDb()) return;
  await q(`delete from os_invites where email = $1`, [normaliseEmail(email)]);
}

/* ── usage ────────────────────────────────────────────────────────────────── */

/** Count a visit. Upserted per person per page per day — see the schema. */
export async function trackView(userId: string, path: string): Promise<void> {
  if (!hasDb() || !userId || !path) return;
  try {
    await q(
      `insert into os_page_views (user_id, path, day, views, last_at)
       values ($1, $2, current_date, 1, now())
       on conflict (user_id, path, day)
       do update set views = os_page_views.views + 1, last_at = now()`,
      [userId, path]
    );
  } catch {
    /* Never let analytics break a page load. */
  }
}

export interface TabUsage {
  path: string;
  label: string;
  views: number;
  people: number;
  lastAt: string | null;
}

/** EVERY tab, including the ones nobody has opened. */
export async function tabUsage(): Promise<TabUsage[]> {
  if (!hasDb()) return TRACKED_TABS.map((t) => ({ ...t, views: 0, people: 0, lastAt: null }));
  const rows = await q<{ path: string; views: string; people: string; last_at: Date }>(
    `select path, sum(views)::text as views, count(distinct user_id)::text as people,
            max(last_at) as last_at
       from os_page_views group by path`
  );
  const by = new Map(rows.map((r) => [r.path, r]));
  return TRACKED_TABS.map((t) => {
    const r = by.get(t.path);
    return {
      path: t.path,
      label: t.label,
      views: Number(r?.views ?? 0),
      people: Number(r?.people ?? 0),
      lastAt: r?.last_at ? new Date(r.last_at).toISOString() : null,
    };
  }).sort((a, b) => b.views - a.views);
}

/* ── bugs ─────────────────────────────────────────────────────────────────── */

export interface Bug {
  id: string;
  reporterEmail: string;
  body: string;
  path: string;
  kind: string;
  state: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export async function logBug(p: {
  reporterId?: string | null; reporterEmail?: string;
  body: string; path?: string; kind?: string; context?: Record<string, unknown>;
}): Promise<void> {
  if (!hasDb()) return;
  await q(
    `insert into os_bugs (id, reporter_id, reporter_email, body, path, kind, context)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      uid(), p.reporterId ?? null, p.reporterEmail ?? "", p.body.trim(),
      p.path ?? "", p.kind ?? "bug", p.context ? JSON.stringify(p.context) : null,
    ]
  );
}

export async function bugs(limit = 100): Promise<Bug[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    id: string; reporter_email: string; body: string; path: string;
    kind: string; state: string; context: Record<string, unknown> | null; created_at: Date;
  }>(
    `select id, reporter_email, body, path, kind, state, context, created_at
       from os_bugs order by case state when 'open' then 0 when 'ack' then 1 else 2 end,
       created_at desc limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    reporterEmail: r.reporter_email,
    body: r.body,
    path: r.path,
    kind: r.kind,
    state: r.state,
    context: r.context,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function setBugState(id: string, state: string): Promise<void> {
  if (!hasDb()) return;
  await q(`update os_bugs set state = $1 where id = $2`, [state, id]);
}
