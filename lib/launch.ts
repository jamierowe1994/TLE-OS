import "server-only";
import { hasDb, q } from "@/lib/db";
import { lettingsAgents } from "@/lib/rex-agents";
import { isInternalAddress } from "@/lib/email-policy";
import { nameKey } from "@/lib/staff-photos";
import { normaliseEmail } from "@/lib/users";
import { latestJoinLinks } from "@/lib/verification";

/**
 * THE LAUNCH (James, 12 Oct 2026, for Wednesday 14 Oct).
 *
 * "What I don't want to do is have a meltdown when we get there, trying to
 * invite everybody." One button on Admin > Launch invites everybody at The
 * Letting Experts who has no account yet, all at once. Before he presses it he
 * can untick anybody, add anybody, and pick the role each joins as; after it,
 * the same screen shows who has signed up and how far each person is through
 * the pre-start checklist (photo, REX, email, setup, the tour).
 *
 * ── Where "everybody" comes from ──────────────────────────────────────────
 *
 * No one list has the whole team, so three are joined on the person:
 *   - REX's active lettings agents (@thelettingexperts.co.uk only)
 *   - the TEG Team Hub copy (os_teg_people), less anybody Departed or a
 *     Duplicate, and only Letting Experts: a TLE address, a lettings job
 *     title, or a headshot on the TLE website
 *   - the website headshots (os_staff_photos), for their other addresses
 * Joined on first-and-last name (nameKey), because the same person is on
 * @thepropertyexperts in one list and @thelettingexperts in another.
 *
 * Anybody who already has an account - matched on any of their addresses or
 * their name - is not on the invite list; they show under "already on".
 *
 * What James decided (unticked, added by hand, role, sent) lives in
 * os_launch_list. The roster itself is worked out fresh on every load.
 */

/** The TLE OS tour (jamierowe1994/tle-os-demo), linked from the invite. */
export const TOUR_URL = (process.env.LAUNCH_TOUR_URL || "https://tle-os-demo-production.up.railway.app").trim();

/** How long a launch join link lasts. See startVerification's ttlMs. */
export const LAUNCH_LINK_DAYS = 7;

/** Prefs key for the agent's own checklist answers (the tour, a dismiss). */
export const READY_PREF = "os-launch-ready";

export type Readiness = {
  photo: boolean;
  /** "lapsed": connected once, the REX session has since run out. */
  rex: "live" | "lapsed" | "none";
  email: boolean;
  /** Pressed the last button of the setup wizard. */
  setup: boolean;
  /** Opened the tour from their checklist. */
  tour: boolean;
  lastSeenAt: string | null;
};

export type LaunchPerson = {
  email: string;
  name: string;
  /** Every address we know for them, for the screen to show on hover. */
  emails: string[];
  rexId: string | null;
  role: string;
  /** Where they came from: rex, hub, website, invite, or added by hand. */
  sources: string[];
  custom: boolean;
  included: boolean;
  /** The OS may only email our own domains (lib/email-policy). */
  sendable: boolean;
  sentAt: string | null;
  lastError: string | null;
  linkExpiresAt: string | null;
};

export type OnPerson = {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
  ready: Readiness;
};

type Draft = {
  key: string;
  name: string;
  emails: Set<string>;
  rexId: string | null;
  rexEmail: string | null;
  /** Every REX user id anybody has for them - REX's own and the Hub's. */
  rexIds: Set<string>;
  sources: Set<string>;
};

const TLE = "@thelettingexperts.co.uk";

/** The address an invite goes to: REX's, then a TLE one, then any we may email. */
function pickEmail(d: Draft): string {
  const all = [...d.emails];
  if (d.rexEmail && isInternalAddress(d.rexEmail)) return d.rexEmail;
  return (
    all.find((e) => e.endsWith(TLE)) ??
    all.find((e) => isInternalAddress(e)) ??
    all[0] ??
    ""
  );
}

export async function launchState(): Promise<{ launchedAt: string | null; by: string | null }> {
  if (!hasDb()) return { launchedAt: null, by: null };
  const rows = await q<{ value: { launchedAt?: string; by?: string } }>(
    `select value from os_settings where key = 'launch'`
  ).catch(() => []);
  return { launchedAt: rows[0]?.value?.launchedAt ?? null, by: rows[0]?.value?.by ?? null };
}

/** Stamped the first time the Launch button sends anything. Never moved after. */
export async function markLaunched(by: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `insert into os_settings (key, value, updated_at, updated_by)
     values ('launch', $1, now(), $2)
     on conflict (key) do nothing`,
    [JSON.stringify({ launchedAt: new Date().toISOString(), by }), by]
  );
}

/** Everybody, split into who still needs inviting and who is already on. */
export async function launchBoard(): Promise<{ toInvite: LaunchPerson[]; on: OnPerson[] }> {
  if (!hasDb()) return { toInvite: [], on: [] };

  const [rex, hub, photos, users, saved, invites] = await Promise.all([
    lettingsAgents().catch(() => []),
    q<{ email: string; name: string | null; job_title: string | null; status: string | null; rex_id: string | null }>(
      `select email, name, job_title, status, rex_id from os_teg_people`
    ).catch(() => []),
    q<{ name_key: string; name: string; emails: string[] }>(
      `select name_key, name, emails from os_staff_photos`
    ).catch(() => []),
    q<{ id: string; name: string; email: string; role: string; created_at: Date | null; last_seen_at: Date | null; has_photo: boolean; rex_user_id: string | null }>(
      `select id, name, email, role, created_at, last_seen_at, rex_user_id,
              (photo is not null and photo <> '') as has_photo
         from os_users`
    ),
    q<{ email: string; name: string; role: string | null; excluded: boolean; custom: boolean; sent_at: Date | null; last_error: string | null }>(
      `select email, name, role, excluded, custom, sent_at, last_error from os_launch_list`
    ),
    q<{ email: string; name: string; role: string | null; rex_user_id: string | null; accepted_at: Date | null }>(
      `select email, name, role, rex_user_id, accepted_at from os_invites`
    ),
  ]);

  /* ── Join the rosters on the person ─────────────────────────────────── */
  const drafts = new Map<string, Draft>();
  const byEmail = new Map<string, Draft>();
  const touch = (name: string, email: string | null, source: string, rex?: { id: string; email: string }, hubRexId?: string | null) => {
    const e = email ? normaliseEmail(email) : null;
    const key = nameKey(name) || e || "";
    if (!key) return;
    let d = (e && byEmail.get(e)) || drafts.get(key);
    if (!d) {
      d = { key, name: name.trim(), emails: new Set(), rexId: null, rexEmail: null, rexIds: new Set(), sources: new Set() };
      drafts.set(key, d);
    }
    if (e) {
      d.emails.add(e);
      byEmail.set(e, d);
    }
    d.sources.add(source);
    if (hubRexId) d.rexIds.add(String(hubRexId));
    if (rex) {
      d.rexIds.add(String(rex.id));
      d.rexId = rex.id;
      d.rexEmail = normaliseEmail(rex.email);
      d.name = name.trim() || d.name;
    }
  };

  for (const a of rex) touch(a.name, a.email, "rex", { id: a.id, email: a.email });
  const photoKeys = new Set(photos.map((p) => p.name_key));
  /* Somebody the Hub says has LEFT is never added by the Hub, and if REX
     still has them active they start unticked (Jay Gorania, 12 Oct 2026:
     Departed in the Hub, active in REX). */
  const departed = new Set<string>();
  for (const h of hub) {
    if (h.status !== "Departed") continue;
    departed.add(normaliseEmail(h.email));
    if (h.name) departed.add(nameKey(h.name));
  }
  for (const h of hub) {
    /* A Duplicate is a second address for somebody listed again under
       another: worth having as an address, never a person of its own. */
    if (h.status === "Duplicate" || h.status === "Departed") continue;
    const lettings =
      normaliseEmail(h.email).endsWith(TLE) ||
      /letting/i.test(h.job_title ?? "") ||
      photoKeys.has(nameKey(h.name ?? ""));
    if (lettings) touch(h.name ?? h.email.split("@")[0], h.email, "hub", undefined, h.rex_id);
  }
  for (const p of photos) {
    /* The website is a source of extra ADDRESSES for people already found,
       and of people in their own right: its staff page is the Letting
       Experts' own list of who works there. */
    for (const e of p.emails) touch(p.name, e, "website");
    if (!p.emails.length) touch(p.name, null, "website");
  }

  for (const h of hub) {
    if (h.status !== "Duplicate") continue;
    const d = drafts.get(nameKey(h.name ?? ""));
    if (d) {
      d.emails.add(normaliseEmail(h.email));
      byEmail.set(normaliseEmail(h.email), d);
    }
  }

  /* ── Who already has an account ─────────────────────────────────────── */
  const userByEmail = new Map(users.map((u) => [normaliseEmail(u.email), u]));
  const userByName = new Map(users.filter((u) => nameKey(u.name)).map((u) => [nameKey(u.name), u] as const));
  /* And on REX id: Kirstie Mulholland's account carries REX user 61046,
     which REX and the Hub both call Kirstie Wallington. Same person. */
  const userByRex = new Map(users.filter((u) => u.rex_user_id).map((u) => [String(u.rex_user_id), u] as const));
  const accountFor = (d: { key: string; emails: Iterable<string>; rexIds?: Iterable<string> }) => {
    for (const e of d.emails) {
      const u = userByEmail.get(e);
      if (u) return u;
    }
    for (const id of d.rexIds ?? []) {
      const u = userByRex.get(id);
      if (u) return u;
    }
    return userByName.get(d.key) ?? null;
  };

  const savedBy = new Map(saved.map((s) => [normaliseEmail(s.email), s]));
  const inviteBy = new Map(invites.map((i) => [normaliseEmail(i.email), i]));
  const toInvite: LaunchPerson[] = [];
  const claimed = new Set<string>();

  for (const d of drafts.values()) {
    if (accountFor(d)) continue;
    /* A row James already touched wins: it holds the address the invite went
       to, and that must not move under it. */
    const keep = [...d.emails].map((e) => savedBy.get(e)).find(Boolean);
    const email = keep ? normaliseEmail(keep.email) : pickEmail(d);
    if (!email) continue;
    d.emails.forEach((e) => claimed.add(e));
    claimed.add(email);
    const inv = inviteBy.get(email);
    const left = departed.has(d.key) || [...d.emails].some((e) => departed.has(e));
    if (left) d.sources.add("departed");
    toInvite.push({
      email,
      name: keep?.name || d.name,
      emails: [...new Set([email, ...d.emails])],
      rexId: d.rexId ?? inv?.rex_user_id ?? null,
      role: keep?.role ?? inv?.role ?? "agent",
      sources: [...d.sources],
      custom: false,
      included: keep ? !keep.excluded : !left,
      sendable: isInternalAddress(email),
      sentAt: keep?.sent_at ? new Date(keep.sent_at).toISOString() : null,
      lastError: keep?.last_error ?? null,
      linkExpiresAt: null,
    });
  }

  /* Added by hand, and pilot invites nobody ever redeemed. A pilot invite
     starts UNTICKED: it was a decision made for the pilot, not for launch,
     and it includes test addresses. */
  for (const s of saved) {
    const e = normaliseEmail(s.email);
    if (claimed.has(e) || userByEmail.has(e)) continue;
    claimed.add(e);
    toInvite.push({
      email: e, name: s.name || e.split("@")[0], emails: [e], rexId: null,
      role: s.role ?? "agent", sources: [s.custom ? "added" : "invite"], custom: s.custom,
      included: !s.excluded, sendable: isInternalAddress(e),
      sentAt: s.sent_at ? new Date(s.sent_at).toISOString() : null, lastError: s.last_error, linkExpiresAt: null,
    });
  }
  for (const i of invites) {
    const e = normaliseEmail(i.email);
    if (claimed.has(e) || userByEmail.has(e) || i.accepted_at) continue;
    if (accountFor({ key: nameKey(i.name), emails: [e] })) continue;
    claimed.add(e);
    toInvite.push({
      email: e, name: i.name || e.split("@")[0], emails: [e], rexId: i.rex_user_id,
      role: i.role ?? "agent", sources: ["invite"], custom: false,
      included: false, sendable: isInternalAddress(e),
      sentAt: null, lastError: null, linkExpiresAt: null,
    });
  }

  const links = await latestJoinLinks(toInvite.map((p) => p.email));
  for (const p of toInvite) p.linkExpiresAt = links.get(p.email) ?? null;
  toInvite.sort((a, b) => a.name.localeCompare(b.name));

  /* ── Already on: where each is up to ────────────────────────────────── */
  const ready = await readinessFor(users.map((u) => u.id));
  const on: OnPerson[] = users
    .map((u) => ({
      userId: u.id,
      name: u.name || u.email,
      email: u.email,
      role: u.role,
      createdAt: u.created_at ? new Date(u.created_at).toISOString() : null,
      ready: {
        ...(ready.get(u.id) ?? { rex: "none" as const, email: false, setup: false, tour: false }),
        photo: u.has_photo,
        lastSeenAt: u.last_seen_at ? new Date(u.last_seen_at).toISOString() : null,
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { toInvite, on };
}

/**
 * The checklist answers that are not on os_users, for many people at once.
 * Read live from the connection tables, the same truth the setup wizard and
 * the Connections tab use - never a stored "done" flag that can drift.
 */
export async function readinessFor(
  userIds: string[]
): Promise<Map<string, Omit<Readiness, "photo" | "lastSeenAt">>> {
  const out = new Map<string, Omit<Readiness, "photo" | "lastSeenAt">>();
  if (!hasDb() || !userIds.length) return out;
  const [rex, ms, prefs] = await Promise.all([
    q<{ user_id: string; live: boolean }>(
      `select user_id, expires_at > now() as live from os_rex_tokens where user_id = any($1)`,
      [userIds]
    ).catch(() => []),
    q<{ user_id: string }>(`select user_id from os_ms_tokens where user_id = any($1)`, [userIds]).catch(() => []),
    q<{ user_id: string; key: string; value: Record<string, unknown> }>(
      `select user_id, key, value from os_user_prefs where user_id = any($1) and key = any($2)`,
      [userIds, ["os-setup", READY_PREF]]
    ).catch(() => []),
  ]);
  const rexBy = new Map(rex.map((r) => [r.user_id, r.live]));
  const msBy = new Set(ms.map((r) => r.user_id));
  for (const id of userIds) {
    const setup = prefs.find((p) => p.user_id === id && p.key === "os-setup")?.value;
    const mine = prefs.find((p) => p.user_id === id && p.key === READY_PREF)?.value;
    out.set(id, {
      rex: rexBy.has(id) ? (rexBy.get(id) ? "live" : "lapsed") : "none",
      email: msBy.has(id),
      setup: typeof setup?.finishedAt === "string",
      tour: typeof mine?.tourAt === "string",
    });
  }
  return out;
}

/* ── What James decides ─────────────────────────────────────────────────── */

export async function saveLaunchRow(p: {
  email: string; name?: string; role?: string | null; excluded?: boolean; custom?: boolean; by: string;
}): Promise<void> {
  if (!hasDb()) return;
  await q(
    `insert into os_launch_list (email, name, role, excluded, custom, added_by)
     values ($1, $2, $3, coalesce($4, false), coalesce($5, false), $6)
     on conflict (email) do update set
       name = case when $2 <> '' then $2 else os_launch_list.name end,
       role = coalesce($3, os_launch_list.role),
       excluded = coalesce($4, os_launch_list.excluded),
       custom = os_launch_list.custom or coalesce($5, false)`,
    [normaliseEmail(p.email), p.name?.trim() ?? "", p.role ?? null, p.excluded ?? null, p.custom ?? null, p.by]
  );
}

export async function removeLaunchRow(email: string): Promise<void> {
  if (!hasDb()) return;
  await q(`delete from os_launch_list where email = $1 and custom`, [normaliseEmail(email)]);
}

export async function markLaunchSent(email: string, error: string | null): Promise<void> {
  if (!hasDb()) return;
  await q(
    error
      ? `update os_launch_list set last_error = $2 where email = $1`
      : `update os_launch_list set sent_at = now(), last_error = null where email = $1`,
    error ? [normaliseEmail(email), error.slice(0, 300)] : [normaliseEmail(email)]
  );
}
