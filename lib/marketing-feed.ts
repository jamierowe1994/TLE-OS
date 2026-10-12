import { hasDb, q } from "@/lib/db";

/**
 * The lead figures for marketing, as counts only (James, 12 Oct 2026: "Hayley
 * in marketing needs access to all the leads data - how many leads, where the
 * leads come from ... we might need to send her an API/webhook to her Base44
 * app"). He chose counts and sources only: no name, email or phone leaves the
 * OS this way, and nothing here can be added back up into a contact list.
 *
 * What counts as a lead
 *   - every lead in the ledger (os_leads): portal and website enquiries off
 *     REX, Letting = tenant, Valuation = landlord;
 *   - people added by hand in the OS (os_contacts), test ones left out;
 *   - NOT the leads taken off the board by hand (os_hidden_leads);
 *   - NOT, unless asked, the "REX diary" rows: viewers the scan filed from a
 *     booked viewing with no enquiry behind them, so no source to credit.
 *
 * Periods and the month are Europe/London. With no dates the window is this
 * month so far, worked out at the moment of asking, so it rolls over on the
 * 1st by itself.
 */

export type Group = "day" | "week" | "month";

export interface FeedQuery {
  /** YYYY-MM-DD, London. Default: the 1st of this month. */
  from?: string | null;
  /** YYYY-MM-DD, London, inclusive. Default: now. */
  to?: string | null;
  group?: Group | null;
  includeDiary?: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readFeedQuery(sp: URLSearchParams): FeedQuery | { error: string } {
  const from = sp.get("from");
  const to = sp.get("to");
  const group = sp.get("group");
  if (from && !DAY.test(from)) return { error: "from must be a date, YYYY-MM-DD." };
  if (to && !DAY.test(to)) return { error: "to must be a date, YYYY-MM-DD." };
  if (from && to && from > to) return { error: "from must be on or before to." };
  if (group && group !== "day" && group !== "week" && group !== "month") return { error: "group must be day, week or month." };
  return { from, to, group: (group as Group | null) ?? null, includeDiary: sp.get("includeDiary") === "1" || sp.get("includeDiary") === "true" };
}

type Num = string | number | null;
const n = (v: Num) => Number(v ?? 0);

export async function leadFeed(f: FeedQuery) {
  if (!hasDb()) throw new Error("The lead figures are not connected on this environment.");

  /* The window as two instants, both worked out by Postgres in London time.
     `to` is inclusive of the whole day; no `to` means right now. */
  const [w] = await q<{ start: Date; finish: Date; from_day: string; to_day: string; days: Num }>(
    `WITH b AS (
       SELECT
         COALESCE($1::date, date_trunc('month', NOW() AT TIME ZONE 'Europe/London')::date) AS d1,
         $2::date AS d2
     )
     SELECT
       (d1::timestamp AT TIME ZONE 'Europe/London') AS start,
       CASE WHEN d2 IS NULL THEN NOW() ELSE ((d2 + 1)::timestamp AT TIME ZONE 'Europe/London') END AS finish,
       to_char(d1, 'YYYY-MM-DD') AS from_day,
       to_char(COALESCE(d2, (NOW() AT TIME ZONE 'Europe/London')::date), 'YYYY-MM-DD') AS to_day,
       (COALESCE(d2, (NOW() AT TIME ZONE 'Europe/London')::date) - d1 + 1) AS days
     FROM b`,
    [f.from ?? null, f.to ?? null]
  );
  const days = n(w.days);
  if (days > 1200) throw new RangeError("Ask for three years at most.");
  const group: Group = f.group ?? (days <= 62 ? "day" : days <= 200 ? "week" : "month");
  const diary = Boolean(f.includeDiary);

  /* One shape for both sources of leads; everything below reads it. */
  const LEADS = `
    WITH l AS (
      SELECT received_at AS at,
             COALESCE(NULLIF(TRIM(source), ''), 'Not recorded') AS source,
             CASE WHEN enquiry = 'Valuation' THEN 'landlord' ELSE 'tenant' END AS type,
             COALESCE(NULLIF(stage, ''), 'New') AS stage,
             NULLIF(NULLIF(TRIM(payload->>'area'), ''), '—') AS area,
             NULLIF(listing_id, '') AS listing_id,
             NULLIF(address, '') AS address,
             LOWER(NULLIF(TRIM(email), '')) AS who,
             id
        FROM os_leads
       WHERE received_at >= $1 AND received_at < $2
         AND id NOT IN (SELECT id FROM os_hidden_leads)
         AND ($3::boolean OR source IS DISTINCT FROM 'REX diary')
      UNION ALL
      SELECT created_at,
             COALESCE(NULLIF(TRIM(source), ''), 'Not recorded'),
             CASE WHEN kind = 'landlord' THEN 'landlord' ELSE 'tenant' END,
             'Added in the OS',
             NULL, NULL, NULL,
             LOWER(NULLIF(TRIM(email), '')),
             'os-' || id
        FROM os_contacts
       WHERE NOT COALESCE(is_test, false)
         AND created_at >= $1 AND created_at < $2
    )`;
  const args = [w.start, w.finish, diary];

  const [totals, bySource, byPeriod, byStage, byArea, topProperties, notCounted, previous] = await Promise.all([
    q<{ enquiries: Num; people: Num; tenant: Num; landlord: Num }>(
      `${LEADS}
       SELECT COUNT(*) AS enquiries,
              COUNT(DISTINCT COALESCE(who, id)) AS people,
              COUNT(*) FILTER (WHERE type = 'tenant') AS tenant,
              COUNT(*) FILTER (WHERE type = 'landlord') AS landlord
         FROM l`,
      args
    ),
    q<{ source: string; enquiries: Num; tenant: Num; landlord: Num }>(
      `${LEADS}
       SELECT source, COUNT(*) AS enquiries,
              COUNT(*) FILTER (WHERE type = 'tenant') AS tenant,
              COUNT(*) FILTER (WHERE type = 'landlord') AS landlord
         FROM l GROUP BY source ORDER BY COUNT(*) DESC, source`,
      args
    ),
    q<{ period: string; source: string; type: string; enquiries: Num }>(
      `${LEADS}
       SELECT to_char(date_trunc('${group}', at AT TIME ZONE 'Europe/London'), 'YYYY-MM-DD') AS period,
              source, type, COUNT(*) AS enquiries
         FROM l GROUP BY 1, 2, 3 ORDER BY 1`,
      args
    ),
    q<{ stage: string; enquiries: Num }>(`${LEADS} SELECT stage, COUNT(*) AS enquiries FROM l GROUP BY 1 ORDER BY 2 DESC`, args),
    q<{ area: string; enquiries: Num }>(
      `${LEADS} SELECT COALESCE(area, 'Not linked to a property') AS area, COUNT(*) AS enquiries FROM l GROUP BY 1 ORDER BY 2 DESC LIMIT 40`,
      args
    ),
    /* Advertised homes only: an address here is the public advert's, never a person's. */
    q<{ listing_id: string; address: string; enquiries: Num }>(
      `${LEADS}
       SELECT listing_id, MAX(address) AS address, COUNT(*) AS enquiries
         FROM l WHERE listing_id IS NOT NULL AND type = 'tenant'
        GROUP BY 1 ORDER BY 3 DESC LIMIT 25`,
      args
    ),
    q<{ diary: Num; hidden: Num }>(
      `SELECT
         (SELECT COUNT(*) FROM os_leads WHERE received_at >= $1 AND received_at < $2 AND source = 'REX diary') AS diary,
         (SELECT COUNT(*) FROM os_leads WHERE received_at >= $1 AND received_at < $2 AND id IN (SELECT id FROM os_hidden_leads)) AS hidden`,
      [w.start, w.finish]
    ),
    /* The same length of time just before, for "up or down". */
    q<{ enquiries: Num }>(
      `${LEADS.replace("received_at >= $1 AND received_at < $2", "received_at >= $1::timestamptz - ($2::timestamptz - $1::timestamptz) AND received_at < $1").replace(
        "created_at >= $1 AND created_at < $2",
        "created_at >= $1::timestamptz - ($2::timestamptz - $1::timestamptz) AND created_at < $1"
      )}
       SELECT COUNT(*) AS enquiries FROM l`,
      args
    ),
  ]);

  const t = totals[0];
  const total = n(t?.enquiries);
  const periods = new Map<string, { period: string; enquiries: number; tenant: number; landlord: number; bySource: Record<string, number> }>();
  for (const r of byPeriod) {
    const p = periods.get(r.period) ?? { period: r.period, enquiries: 0, tenant: 0, landlord: 0, bySource: {} };
    const c = n(r.enquiries);
    p.enquiries += c;
    if (r.type === "landlord") p.landlord += c;
    else p.tenant += c;
    p.bySource[r.source] = (p.bySource[r.source] ?? 0) + c;
    periods.set(r.period, p);
  }

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    timezone: "Europe/London",
    range: { from: w.from_day, to: w.to_day, group, includesDiaryViewers: diary, thisMonthSoFar: !f.from && !f.to },
    totals: {
      enquiries: total,
      people: n(t?.people),
      tenant: n(t?.tenant),
      landlord: n(t?.landlord),
      previousPeriod: n(previous[0]?.enquiries),
    },
    bySource: bySource.map((r) => ({
      source: r.source,
      enquiries: n(r.enquiries),
      tenant: n(r.tenant),
      landlord: n(r.landlord),
      share: total ? Math.round((n(r.enquiries) / total) * 1000) / 10 : 0,
    })),
    byPeriod: [...periods.values()],
    byStage: byStage.map((r) => ({ stage: r.stage, enquiries: n(r.enquiries) })),
    byArea: byArea.map((r) => ({ area: r.area, enquiries: n(r.enquiries) })),
    topProperties: topProperties.map((r) => ({ listingId: r.listing_id, address: r.address, enquiries: n(r.enquiries) })),
    notCounted: { diaryViewers: diary ? 0 : n(notCounted[0]?.diary), removedByHand: n(notCounted[0]?.hidden) },
  };
}
