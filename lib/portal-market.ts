import "server-only";
import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { portalStatsFor, type PortalStats } from "@/lib/rex-portal-stats";

/**
 * A listing's portal figures against the market (James, 12 Oct 2026: "show
 * what it's doing compared to other properties on the market at the moment
 * ... build up historical records").
 *
 * The market is the widest ring first: every home we have live on the
 * portals now, across the business. Each is read once a day (REX's
 * PortalStats, campaign to date) and kept in os_portal_stats_daily, so the
 * comparison is like for like and a trend builds up day by day.
 *
 * Campaign-to-date totals favour whatever has been up longest, so homes are
 * compared PER DAY LIVE: views a day, appearances a day, and the click-through
 * (views over appearances), which does not depend on time at all.
 */

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export type ListingMeta = { id: string; name: string; locality: string; rentMonthly: number | null; publishedAt: string | null };

function daysLive(publishedAt: string | null): number | null {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt.length === 10 ? `${publishedAt}T12:00:00Z` : publishedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(1, Math.round((Date.now() - t) / 86_400_000));
}

/** Keep today's figures for one listing: a row a portal, and 'all'. */
export async function recordStats(meta: ListingMeta, stats: PortalStats): Promise<void> {
  if (!hasDb() || stats.empty) return;
  const day = today();
  const live = daysLive(meta.publishedAt);
  const rows = [
    ...stats.portals.map((p) => ({ portal: p.portal, detail: p.detail.total, summary: p.summary.total, mobile: p.detail.mobile })),
    {
      portal: "all",
      detail: stats.totals.detail,
      summary: stats.totals.summary,
      mobile: stats.portals.reduce<number | null>((a, p) => (p.detail.mobile == null ? a : (a ?? 0) + p.detail.mobile), null),
    },
  ];
  for (const r of rows) {
    await q(
      `INSERT INTO os_portal_stats_daily (listing_id, portal, read_on, detail, summary, mobile_detail, days_live, rent_monthly, name, locality, read_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (listing_id, portal, read_on) DO UPDATE SET
         detail = EXCLUDED.detail, summary = EXCLUDED.summary, mobile_detail = EXCLUDED.mobile_detail,
         days_live = EXCLUDED.days_live, rent_monthly = EXCLUDED.rent_monthly, name = EXCLUDED.name,
         locality = EXCLUDED.locality, read_at = NOW()`,
      [meta.id, r.portal, day, r.detail, r.summary, r.mobile, live, meta.rentMonthly, meta.name, meta.locality]
    ).catch(() => null);
  }
}

/* ── the daily sweep of the market ─────────────────────────────────────── */

let sweeping: Promise<number> | null = null;

/** How many live homes already have today's figures. */
async function readToday(): Promise<number> {
  const r = await q<{ n: string }>(`SELECT COUNT(DISTINCT listing_id) AS n FROM os_portal_stats_daily WHERE read_on = $1 AND portal = 'all'`, [today()]).catch(() => []);
  return Number(r[0]?.n ?? 0);
}

/**
 * Read every live listing's figures once today, four at a time. Single
 * flight per process, and skipped when most of today's are already in, so
 * opening the panel twenty times reads the market once.
 */
export function sweepMarket(): Promise<number> {
  if (sweeping) return sweeping;
  sweeping = (async () => {
    if (!hasDb()) return 0;
    const book = await bookFor(null);
    const live = book.listings.filter((l) => l.publicationStatus === "published" && !l.letAgreed && Number(l.id) > 0);
    if ((await readToday()) >= Math.floor(live.length * 0.8)) return 0;
    let done = 0;
    const queue = [...live];
    const work = async () => {
      for (let l = queue.shift(); l; l = queue.shift()) {
        const stats = await portalStatsFor(String(l.id)).catch(() => null);
        if (stats) {
          await recordStats({ id: String(l.id), name: l.name, locality: l.locality, rentMonthly: l.rentMonthly, publishedAt: l.publishedAt }, stats);
          done += 1;
        }
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    return done;
  })().finally(() => {
    sweeping = null;
  });
  return sweeping;
}

/* ── the comparison ────────────────────────────────────────────────────── */

export type MarketHome = { id: string; name: string; viewsPerDay: number; appearancesPerDay: number | null; ctr: number | null; rentMonthly: number | null };
export type PortalLine = { portal: string; viewsPerDay: number | null; marketViewsPerDay: number | null; ctr: number | null; marketCtr: number | null; homes: number };
export type Market = {
  /** The day the market was read. */
  asOf: string | null;
  homes: number;
  /** This listing, per day live. Null when it isn't live or has no figures. */
  me: { viewsPerDay: number; appearancesPerDay: number | null; ctr: number | null; daysLive: number } | null;
  average: { viewsPerDay: number; appearancesPerDay: number | null; ctr: number | null };
  median: { viewsPerDay: number };
  /** 1 = most viewed a day. */
  rank: number | null;
  /** Every live home, for the strip - this one marked by id. */
  spread: MarketHome[];
  portals: PortalLine[];
  /** Homes within 20% of this one's rent, when there are enough to mean anything. */
  similarRent: { homes: number; viewsPerDay: number; ctr: number | null } | null;
};
export type HistoryPoint = { on: string; detail: number | null; summary: number | null };

type Row = { listing_id: string; portal: string; read_on: string; detail: number | null; summary: number | null; days_live: number | null; rent_monthly: number | null; name: string };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const ctrOf = (d: number | null, s: number | null) => (d != null && s ? r1((d / s) * 100) : null);

export async function marketFor(listingId: string): Promise<Market | null> {
  if (!hasDb()) return null;
  /* Each live home's most recent read in the last three days. */
  const rows = await q<Row>(
    `SELECT DISTINCT ON (listing_id, portal) listing_id, portal, to_char(read_on, 'YYYY-MM-DD') AS read_on, detail, summary, days_live, rent_monthly, name
       FROM os_portal_stats_daily
      WHERE read_on >= (CURRENT_DATE - INTERVAL '3 days')
      ORDER BY listing_id, portal, read_on DESC`
  ).catch(() => [] as Row[]);
  if (!rows.length) return null;

  const all = rows.filter((r) => r.portal === "all" && r.detail != null && (r.days_live ?? 0) > 0);
  const spread: MarketHome[] = all.map((r) => ({
    id: r.listing_id,
    name: r.name,
    viewsPerDay: r1((r.detail ?? 0) / (r.days_live as number)),
    appearancesPerDay: r.summary != null ? r1(r.summary / (r.days_live as number)) : null,
    ctr: ctrOf(r.detail, r.summary),
    rentMonthly: r.rent_monthly,
  }));
  const mine = all.find((r) => r.listing_id === listingId) ?? null;
  const vpd = spread.map((h) => h.viewsPerDay);
  const apd = spread.map((h) => h.appearancesPerDay).filter((v): v is number => v != null);
  const ctrs = spread.map((h) => h.ctr).filter((v): v is number => v != null);
  const meHome = spread.find((h) => h.id === listingId) ?? null;
  const rank = meHome ? [...vpd].sort((a, b) => b - a).indexOf(meHome.viewsPerDay) + 1 : null;

  const portalNames = [...new Set(rows.filter((r) => r.portal !== "all").map((r) => r.portal))];
  const portals: PortalLine[] = portalNames.map((portal) => {
    const pr = rows.filter((r) => r.portal === portal && r.detail != null && (r.days_live ?? 0) > 0);
    const myRow = pr.find((r) => r.listing_id === listingId) ?? null;
    const perDay = pr.map((r) => (r.detail as number) / (r.days_live as number));
    const pctr = pr.map((r) => ctrOf(r.detail, r.summary)).filter((v): v is number => v != null);
    return {
      portal,
      viewsPerDay: myRow ? r1((myRow.detail as number) / (myRow.days_live as number)) : null,
      marketViewsPerDay: perDay.length ? r1(mean(perDay)) : null,
      ctr: myRow ? ctrOf(myRow.detail, myRow.summary) : null,
      marketCtr: pctr.length ? r1(mean(pctr)) : null,
      homes: pr.length,
    };
  });

  let similarRent: Market["similarRent"] = null;
  if (mine?.rent_monthly) {
    const lo = mine.rent_monthly * 0.8;
    const hi = mine.rent_monthly * 1.2;
    const near = spread.filter((h) => h.id !== listingId && h.rentMonthly != null && h.rentMonthly >= lo && h.rentMonthly <= hi);
    if (near.length >= 5) {
      const c = near.map((h) => h.ctr).filter((v): v is number => v != null);
      similarRent = { homes: near.length, viewsPerDay: r1(mean(near.map((h) => h.viewsPerDay))), ctr: c.length ? r1(mean(c)) : null };
    }
  }

  return {
    asOf: all.map((r) => r.read_on).sort().at(-1) ?? null,
    homes: spread.length,
    me: meHome && mine ? { viewsPerDay: meHome.viewsPerDay, appearancesPerDay: meHome.appearancesPerDay, ctr: meHome.ctr, daysLive: mine.days_live as number } : null,
    average: { viewsPerDay: r1(mean(vpd)), appearancesPerDay: apd.length ? r1(mean(apd)) : null, ctr: ctrs.length ? r1(mean(ctrs)) : null },
    median: { viewsPerDay: r1(median(vpd)) },
    rank,
    spread: spread.sort((a, b) => b.viewsPerDay - a.viewsPerDay),
    portals: portals.sort((a, b) => (b.marketViewsPerDay ?? 0) - (a.marketViewsPerDay ?? 0)),
    similarRent,
  };
}

/** This listing's own reads, oldest first: the trend. */
export async function historyFor(listingId: string): Promise<HistoryPoint[]> {
  if (!hasDb()) return [];
  const rows = await q<{ day: string; detail: number | null; summary: number | null }>(
    `SELECT to_char(read_on, 'YYYY-MM-DD') AS day, detail, summary FROM os_portal_stats_daily
      WHERE listing_id = $1 AND portal = 'all' ORDER BY read_on ASC LIMIT 400`,
    [listingId]
  ).catch(() => []);
  return rows.map((r) => ({ on: r.day, detail: r.detail, summary: r.summary }));
}
