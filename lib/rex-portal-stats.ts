import { rexCall } from "./rex";

/**
 * What the portals did with a listing.
 *
 * REX exposes this at PortalStats/getListingStats, per listing, and it is the
 * only honest answer to "is this advert working". Two numbers matter and they
 * mean different things:
 *
 *   summary views — how often it APPEARED in a search result. That's reach,
 *                   and it's mostly a function of price and portal ranking.
 *   detail views  — how often somebody then CLICKED IT. That's the photos,
 *                   the headline and the price working together.
 *
 * A listing with reach and no clicks has a presentation problem. One with
 * neither has a price or a portal problem. Reporting only "views" collapses
 * those into one number that can't tell you which — so both are kept, and the
 * ratio between them is the thing worth reading.
 *
 * Shaped after the same call in the F&C pipeline: stats arrive split across
 * primary_stats and nested secondary_stats groups, so they're flattened into
 * one map before anything is picked out.
 */

const PORTAL_NAMES: Record<string, string> = {
  uk_rightmove: "Rightmove",
  uk_zoopla: "Zoopla",
  uk_onthemarket: "OnTheMarket",
  uk_primelocation: "PrimeLocation",
  uk_boomin: "Boomin",
};

/** Fixed order, so columns never reshuffle between listings. */
const ORDER = ["uk_rightmove", "uk_zoopla", "uk_onthemarket", "uk_primelocation", "uk_boomin"];

const DETAIL = {
  total: "detail_views.total_detail_views",
  desktop: "detail_views.desktop_detail_views",
  mobile: "detail_views.mobile_detail_views",
};
const SUMMARY = {
  total: "summary_views.total_summary_views",
  desktop: "summary_views.desktop_summary_views",
  mobile: "summary_views.mobile_summary_views",
};

/**
 * Portal feeds lag by a day as a matter of course, and REX logs a sync error
 * on every transient retry (Rightmove 503s often). So an error alone is not
 * worth alarming anyone about — only silence is.
 */
const STALE_AFTER_DAYS = 3;

export type PortalStat = {
  id: string;
  portal: string;
  branch: string | null;
  lastUpdated: string | null;
  staleDays: number | null;
  isStale: boolean;
  /** Clicks onto the property's own page. */
  detail: { total: number | null; desktop: number | null; mobile: number | null };
  /** Appearances in a list of results. */
  summary: { total: number | null; desktop: number | null; mobile: number | null };
  /** Detail ÷ summary, as a percentage. Null when it never appeared. */
  ctr: number | null;
};

export type PortalStats = {
  listingId: string;
  portals: PortalStat[];
  totals: { detail: number | null; summary: number | null; ctr: number | null };
  /** True when REX answered but had nothing recorded for this listing. */
  empty: boolean;
};

type RexStat = { id?: string; value?: unknown };
type RexCampaign = {
  id?: string;
  source_title?: string;
  last_updated?: string | null;
  primary_stats?: RexStat[];
  secondary_stats?: { data?: RexStat[] }[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso || !DATE.test(iso)) return null;
  const then = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(then) ? null : Math.floor((Date.now() - then) / 86_400_000);
}

/** Primary and nested secondary stats, in one flat map keyed by REX's stat id. */
function flatten(c: RexCampaign): Map<string, RexStat> {
  const m = new Map<string, RexStat>();
  for (const s of c.primary_stats ?? []) if (s.id) m.set(s.id, s);
  for (const g of c.secondary_stats ?? []) for (const s of g.data ?? []) if (s.id) m.set(s.id, s);
  return m;
}

function pick(m: Map<string, RexStat>, ids: Record<string, string>) {
  const out: Record<string, number | null> = {};
  for (const [key, id] of Object.entries(ids)) {
    const v = m.get(id)?.value;
    out[key] = v == null ? null : Number(v);
  }
  return out as { total: number | null; desktop: number | null; mobile: number | null };
}

/** "Rightmove - The Lettings Expert" → portal name + which branch fed it. */
function splitTitle(title: string | undefined, id: string) {
  const t = title ?? "";
  const at = t.indexOf(" - ");
  return {
    portal: PORTAL_NAMES[id] ?? (at > -1 ? t.slice(0, at) : t) ?? id,
    branch: at > -1 ? t.slice(at + 3) : null,
  };
}

function rate(clicks: number | null, appearances: number | null): number | null {
  if (!appearances || clicks == null) return null;
  return Number(((clicks / appearances) * 100).toFixed(1));
}

export async function portalStatsFor(listingId: string): Promise<PortalStats | null> {
  const res = await rexCall("PortalStats", "getListingStats", {
    listing_id: Number(listingId) || listingId,
    // No dates: the whole campaign to date, which is REX's own default view
    // and the only figure that means anything on a listing that's been up
    // for a fortnight.
    most_recent: true,
  });
  if (!res.ok) return null;

  const campaigns = ((res.result as { campaigns?: RexCampaign[] } | null)?.campaigns ?? []) as RexCampaign[];

  const portals: PortalStat[] = campaigns.map((c) => {
    const id = c.id ?? "unknown";
    const m = flatten(c);
    const detail = pick(m, DETAIL);
    const summary = pick(m, SUMMARY);
    const staleDays = daysSince(c.last_updated);
    const { portal, branch } = splitTitle(c.source_title, id);
    return {
      id,
      portal,
      branch,
      lastUpdated: c.last_updated ?? null,
      staleDays,
      isStale: staleDays != null && staleDays > STALE_AFTER_DAYS,
      detail,
      summary,
      ctr: rate(detail.total, summary.total),
    };
  });

  // Portals REX knows about but has no numbers for are dropped: a row of
  // dashes reads as a broken feed when it usually means the advert only went
  // up yesterday.
  const withData = portals.filter((p) => p.detail.total != null || p.summary.total != null);
  withData.sort((a, b) => {
    const ai = ORDER.indexOf(a.id);
    const bi = ORDER.indexOf(b.id);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.portal.localeCompare(b.portal);
  });

  const sum = (f: (p: PortalStat) => number | null) => {
    const vals = withData.map(f).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const detailTotal = sum((p) => p.detail.total);
  const summaryTotal = sum((p) => p.summary.total);

  return {
    listingId,
    portals: withData,
    totals: { detail: detailTotal, summary: summaryTotal, ctr: rate(detailTotal, summaryTotal) },
    empty: withData.length === 0,
  };
}
