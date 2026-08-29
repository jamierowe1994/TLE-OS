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
  /** The role they get on redeeming. Null = the default (agent). */
  role: string | null;
  invitedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
}

export async function invites(): Promise<Invite[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    email: string; name: string; rex_user_id: string | null; role: string | null;
    invited_at: Date; sent_at: Date | null; accepted_at: Date | null;
  }>(`select email, name, rex_user_id, role, invited_at, sent_at, accepted_at
        from os_invites order by invited_at desc`);
  return rows.map((r) => ({
    email: r.email,
    name: r.name,
    rexUserId: r.rex_user_id,
    role: r.role,
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
  email: string; name?: string; rexUserId?: string | null; role?: string | null; by: string;
}): Promise<void> {
  if (!hasDb()) return;
  await q(
    `insert into os_invites (email, name, rex_user_id, role, invited_by)
     values ($1,$2,$3,$4,$5)
     on conflict (email) do update set name = excluded.name,
       rex_user_id = excluded.rex_user_id, role = excluded.role`,
    [normaliseEmail(p.email), p.name ?? "", p.rexUserId ?? null, p.role ?? null, p.by]
  );
}

/**
 * The role this address was invited as, or null.
 *
 * Read at REDEEM time, from the invite the owner created — never taken from
 * whatever the browser posts. That is the whole security property: the person
 * accepting an invite has no say in what they become, and the only screen that
 * can set it is owner-gated.
 */
export async function invitedRole(email: string): Promise<string | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ role: string | null }>(
      `select role from os_invites where email = $1`,
      [normaliseEmail(email)]
    );
    return rows[0]?.role ?? null;
  } catch {
    return null;
  }
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
  /** A JPEG data URL of their screen. Optional, and never worth failing over. */
  shot?: string | null;
}): Promise<void> {
  if (!hasDb()) return;
  const id = uid();
  await q(
    `insert into os_bugs (id, reporter_id, reporter_email, body, path, kind, context)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id, p.reporterId ?? null, p.reporterEmail ?? "", p.body.trim(),
      p.path ?? "", p.kind ?? "bug", p.context ? JSON.stringify(p.context) : null,
    ]
  );

  if (!p.shot) return;
  try {
    await q(`insert into os_bug_shots (bug_id, shot) values ($1,$2)
             on conflict (bug_id) do nothing`, [id, p.shot]);
    /* Retention, swept here rather than on a schedule. Thirty days, decided by
       James: long enough to investigate anything the pilot reports, short
       enough that pictures of landlord and tenant details never quietly become
       an archive. Doing it on write means there is no cron to forget, and no
       endpoint to leave unguarded — the sweep cannot outlive the feature. */
    await q(`delete from os_bug_shots where created_at < now() - interval '30 days'`);
  } catch {
    /* The report is filed. A picture that would not store is not a failure
       worth telling the person about — they came to report something else. */
  }
}

/** The screen as it looked, or null. Fetched only when somebody opens one. */
export async function bugShot(bugId: string): Promise<string | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ shot: string }>(
      `select shot from os_bug_shots where bug_id = $1`, [bugId]
    );
    return rows[0]?.shot ?? null;
  } catch {
    return null;
  }
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
