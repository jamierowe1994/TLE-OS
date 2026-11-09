import { hasDb, q } from "@/lib/db";
import { launchBoard } from "@/lib/launch";

/**
 * Who is on TLE OS and how they use it, for the TEG Marketing Hub
 * (James, 9 Nov 2026: "we need to be able to pull down on who's actually
 * using it, what information we've got on them so far").
 *
 * READ ONLY. Built on launchBoard() - the same roster Admin > Launch shows -
 * plus counts from os_page_views. What leaves the OS is deliberately narrow:
 * name, work email, role, the set-up checklist, the Hub's job title / type /
 * package / status, and page counts. NEVER the home address, mobile, bio
 * text, REX tokens or the read log.
 *
 * "This month" is London's calendar month, worked out by Postgres at the
 * moment of asking, so it rolls over on the 1st by itself.
 */

type Num = number | string | null;
const n = (v: Num) => Number(v ?? 0);
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export interface PeopleFeed {
  generatedAt: string;
  monthStart: string;
  on: {
    name: string;
    email: string;
    role: string;
    joinedAt: string | null;
    lastSeenAt: string | null;
    setup: {
      photo: boolean;
      rex: "live" | "lapsed" | "none";
      email: boolean;
      finished: boolean;
      tour: boolean;
      app: { kind: string; at: string } | null;
    };
    hub: { jobTitle: string | null; personType: string | null; partnerPackage: string | null; status: string | null; hasBio: boolean; hasPhoto: boolean } | null;
    usage: {
      monthViews: number;
      monthDays: number;
      monthMinutes: number;
      last30Views: number;
      last30Days: number;
      areas: { area: string; views: number }[];
      lastPage: { path: string; at: string } | null;
    };
  }[];
  notYet: { name: string; email: string; role: string; invitedAt: string | null; onLaunchList: boolean }[];
}

/** "/agent/listings/123" -> "agent/listings"; ids and long tokens dropped. */
function area(path: string): string {
  const parts = path.split("?")[0].split("/").filter(Boolean).filter((p) => !/\d/.test(p) && p.length < 30);
  return parts.slice(0, 2).join("/") || "home";
}

export async function peopleFeed(): Promise<PeopleFeed> {
  if (!hasDb()) throw new Error("The people list is not connected on this environment.");
  const board = await launchBoard();
  const ids = board.on.map((p) => p.userId);
  const emails = board.on.map((p) => p.email.toLowerCase());

  const [[m], usage, pages, last, hub] = await Promise.all([
    q<{ start: string }>(`select to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-DD') as start`),
    q<{ user_id: string; mv: Num; md: Num; ms: Num; lv: Num; ld: Num }>(
      `with b as (select date_trunc('month', now() at time zone 'Europe/London')::date as m,
                         (now() at time zone 'Europe/London')::date - 29 as d30)
       select v.user_id,
              sum(v.views) filter (where v.day >= b.m) as mv,
              count(distinct v.day) filter (where v.day >= b.m) as md,
              sum(v.seconds) filter (where v.day >= b.m) as ms,
              sum(v.views) filter (where v.day >= b.d30) as lv,
              count(distinct v.day) filter (where v.day >= b.d30) as ld
         from os_page_views v, b
        where v.user_id = any($1) and v.day >= least(b.m, b.d30)
        group by v.user_id`,
      [ids]
    ),
    q<{ user_id: string; path: string; views: Num }>(
      `select user_id, path, sum(views) as views
         from os_page_views
        where user_id = any($1) and day >= (now() at time zone 'Europe/London')::date - 29
        group by user_id, path`,
      [ids]
    ),
    q<{ user_id: string; path: string; last_at: Date }>(
      `select distinct on (user_id) user_id, path, last_at
         from os_page_views where user_id = any($1)
        order by user_id, last_at desc`,
      [ids]
    ),
    q<{ email: string; job_title: string | null; person_type: string | null; partner_package: string | null; status: string | null; has_bio: boolean; has_photo: boolean }>(
      `select lower(email) as email, job_title, person_type, partner_package, status,
              coalesce(bio, '') <> '' as has_bio, coalesce(photo_url, '') <> '' as has_photo
         from os_teg_people where lower(email) = any($1)`,
      [emails]
    ).catch(() => []),
  ]);

  const usageBy = new Map(usage.map((u) => [u.user_id, u]));
  const lastBy = new Map(last.map((l) => [l.user_id, l]));
  const hubBy = new Map(hub.map((h) => [h.email, h]));
  const areasBy = new Map<string, Map<string, number>>();
  for (const p of pages) {
    const a = areasBy.get(p.user_id) ?? new Map<string, number>();
    a.set(area(p.path), (a.get(area(p.path)) ?? 0) + n(p.views));
    areasBy.set(p.user_id, a);
  }

  return {
    generatedAt: new Date().toISOString(),
    monthStart: m.start,
    on: board.on.map((p) => {
      const u = usageBy.get(p.userId);
      const h = hubBy.get(p.email.toLowerCase());
      const l = lastBy.get(p.userId);
      return {
        name: p.name,
        email: p.email,
        role: p.role,
        joinedAt: p.createdAt,
        lastSeenAt: p.ready.lastSeenAt,
        setup: { photo: p.ready.photo, rex: p.ready.rex, email: p.ready.email, finished: p.ready.setup, tour: p.ready.tour, app: p.ready.app },
        hub: h
          ? { jobTitle: h.job_title, personType: h.person_type, partnerPackage: h.partner_package, status: h.status, hasBio: h.has_bio, hasPhoto: h.has_photo }
          : null,
        usage: {
          monthViews: n(u?.mv ?? 0),
          monthDays: n(u?.md ?? 0),
          monthMinutes: Math.round(n(u?.ms ?? 0) / 60),
          last30Views: n(u?.lv ?? 0),
          last30Days: n(u?.ld ?? 0),
          areas: [...(areasBy.get(p.userId) ?? new Map()).entries()]
            .map(([area, views]) => ({ area, views }))
            .sort((a, b) => b.views - a.views)
            .slice(0, 5),
          lastPage: l ? { path: area(l.path), at: iso(l.last_at)! } : null,
        },
      };
    }),
    notYet: board.toInvite.map((p) => ({ name: p.name, email: p.email, role: p.role, invitedAt: p.sentAt, onLaunchList: p.included })),
  };
}
