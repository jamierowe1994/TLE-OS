import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Competitor stock: who manages what in the patch.
 *
 * Every let the sweep has seen with another agent is a property that agent
 * has on their books, whether it is tenanted now or waiting for a tenant.
 * Spectre shows this as "competitor-managed stock: property, tenanted?,
 * managed by"; ours comes straight from the capture, with the tenancy
 * estimate and the next anniversary from the predictor alongside, which is
 * the bit that makes it a prospecting list rather than a league table.
 *
 * Tenanted means the latest lettings listing went let agreed, or left the
 * feed without being withdrawn. On market means it is still advertised.
 * Withdrawn listings are shown as withdrawn: the agent may still manage it,
 * or may have lost it, and the sweep cannot tell which.
 *
 * Our own stock and the private listers are left out: the first is not a
 * competitor, the second is the self-managing signal's business.
 */

export interface CompetitorAgent {
  agent: string;
  stock: number;
  tenanted: number;
  on_market: number;
  anniversaries_90: number;
}

export interface CompetitorDoor {
  property_key: string;
  address: string;
  postcode: string;
  district: string | null;
  agent: string;
  state: "tenanted" | "on_market" | "withdrawn" | "other";
  status: string;
  rent: number | null;
  beds: number | null;
  listed_on: string | null;
  let_agreed_at: string | null;
  tenancy_start: string | null;
  next_anniversary: string | null;
  tenancy_basis: string | null;
  photo: string | null;
  flagged_score: number;
}

const OURS = "letting(s)?\\s*experts";
const PRIVATE = "openrent|private\\s*landlord|gumtree|spareroom|lettingaproperty|upad|\\bprivate\\b";

const LATEST_LET = `
  SELECT DISTINCT ON (c.property_key)
         c.property_key, c.address, c.street, c.postcode, c.district, c.agent, c.status, c.rent, c.beds,
         c.listed_on, c.let_agreed_at, c.gone_at, c.image_url, c.image_key
    FROM os_listing_capture c
   WHERE c.market = 'let' AND c.property_key IS NOT NULL AND c.agent IS NOT NULL
     AND c.agent !~* '${OURS}' AND c.agent !~* '${PRIVATE}'
     AND coalesce(c.listed_on, c.first_seen::date) > CURRENT_DATE - INTERVAL '24 months'
     AND ($1::text[] = '{}' OR c.district = ANY($1::text[]))
   ORDER BY c.property_key, coalesce(c.listed_on, c.first_seen::date) DESC, c.first_seen DESC`;

const STATE = `
  CASE
    WHEN l.status = 'let agreed' THEN 'tenanted'
    WHEN l.gone_at IS NOT NULL AND l.status NOT IN ('withdrawn', 'fallen through') THEN 'tenanted'
    WHEN l.status = 'on market' AND l.gone_at IS NULL THEN 'on_market'
    WHEN l.status = 'withdrawn' THEN 'withdrawn'
    ELSE 'other'
  END`;

export async function competitorAgents(districts: string[]): Promise<CompetitorAgent[]> {
  if (!hasDb()) return [];
  const rows = await q<CompetitorAgent & Record<string, unknown>>(
    `WITH l AS (${LATEST_LET}),
     s AS (
       SELECT l.*, ${STATE} AS state, p.next_anniversary
         FROM l LEFT JOIN os_radar_prospects p ON p.property_key = l.property_key
     )
     SELECT agent,
            count(*)::int AS stock,
            count(*) FILTER (WHERE state = 'tenanted')::int AS tenanted,
            count(*) FILTER (WHERE state = 'on_market')::int AS on_market,
            count(*) FILTER (WHERE next_anniversary BETWEEN CURRENT_DATE AND CURRENT_DATE + 90)::int AS anniversaries_90
       FROM s
      GROUP BY agent
      ORDER BY stock DESC, agent
      LIMIT 200`,
    [districts]
  );
  return rows.map((r) => ({ agent: r.agent, stock: r.stock, tenanted: r.tenanted, on_market: r.on_market, anniversaries_90: r.anniversaries_90 }));
}

export async function competitorDoors(districts: string[], agent?: string): Promise<CompetitorDoor[]> {
  if (!hasDb()) return [];
  const rows = await q<Record<string, unknown>>(
    `WITH l AS (${LATEST_LET})
     SELECT l.property_key, coalesce(nullif(l.address, ''), l.street, '') AS address, l.postcode, l.district, l.agent, l.status,
            l.rent, l.beds, l.listed_on::text AS listed_on, l.let_agreed_at::text AS let_agreed_at,
            ${STATE} AS state,
            p.tenancy_start::text AS tenancy_start, p.next_anniversary::text AS next_anniversary, p.tenancy_basis,
            coalesce(p.image_key, l.image_key) AS image_key, coalesce(p.image_url, l.image_url) AS image_url,
            coalesce(p.score, 0) AS flagged_score
       FROM l LEFT JOIN os_radar_prospects p ON p.property_key = l.property_key
      WHERE ($2::text = '' OR l.agent = $2)
      ORDER BY (p.next_anniversary IS NULL), p.next_anniversary, l.agent, l.postcode
      LIMIT 3000`,
    [districts, agent ?? ""]
  );
  return rows.map((r) => ({
    property_key: String(r.property_key),
    address: String(r.address ?? ""),
    postcode: String(r.postcode ?? ""),
    district: (r.district as string) ?? null,
    agent: String(r.agent),
    state: (r.state as CompetitorDoor["state"]) ?? "other",
    status: String(r.status ?? ""),
    rent: (r.rent as number) ?? null,
    beds: (r.beds as number) ?? null,
    listed_on: (r.listed_on as string) ?? null,
    let_agreed_at: (r.let_agreed_at as string) ?? null,
    tenancy_start: (r.tenancy_start as string) ?? null,
    next_anniversary: (r.next_anniversary as string) ?? null,
    tenancy_basis: (r.tenancy_basis as string) ?? null,
    photo: r.image_key ? `/api/bond/photo/${encodeURIComponent(String(r.image_key))}` : ((r.image_url as string) ?? null),
    flagged_score: Number(r.flagged_score ?? 0),
  }));
}
