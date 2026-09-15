import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The advert facts the OS keeps for itself (15 Sep 2026).
 *
 * Everything the Marketing tab asks for is saved HERE first, then sent on to
 * the listing where there is a field for it. Two reasons, both from James:
 * the OS owns its data (tle-os-owns-the-data), and some facts the portals
 * want - heating, furnishing, pets, outside space - have no field to go to at
 * all, so they would otherwise live only inside a paragraph of the description.
 *
 * Also where "Fill it in for me" records what it found and where from, so a
 * figure can be traced back ("Homesearch said FTTP") after the agent has
 * accepted it.
 *
 * The table is created on first use rather than in lib/db.ts's schema, the
 * same as lib/sandbox-store, so it can ship without touching the shared file.
 */

const TABLE = "os_listing_marketing";

export type FactSource = "homesearch" | "epc" | "landlord" | "last-listing" | "appraisal" | "market" | "photos" | "agent";

export interface MarketingFacts {
  councilTaxBand?: string | null;
  parking?: string | null;
  electricity?: string | null;
  water?: string | null;
  sewerage?: string | null;
  broadband?: string | null;
  heating?: string | null;
  furnishing?: string | null;
  pets?: string | null;
  outsideSpace?: string | null;
  floorAreaSqft?: number | null;
  /** Where each value came from, when the OS filled it in. */
  sources?: Partial<Record<string, FactSource>>;
}

let ready: Promise<boolean> | null = null;
function ensure(): Promise<boolean> {
  if (!hasDb()) return Promise.resolve(false);
  ready ??= q(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      listing_id  TEXT PRIMARY KEY,
      facts       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by  TEXT NOT NULL DEFAULT '',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
    .then(() => true)
    .catch(() => {
      ready = null;
      return false;
    });
  return ready;
}

export async function readMarketingFacts(listingId: string): Promise<MarketingFacts> {
  if (!(await ensure())) return {};
  const rows = await q<{ facts: MarketingFacts }>(`SELECT facts FROM ${TABLE} WHERE listing_id = $1`, [listingId]).catch(() => []);
  return rows[0]?.facts ?? {};
}

/** Merge, never replace: a save of three fields leaves the other seven alone. */
export async function saveMarketingFacts(listingId: string, patch: MarketingFacts, by: string): Promise<MarketingFacts> {
  if (!(await ensure())) throw new Error("No database on this environment.");
  const now = await readMarketingFacts(listingId);
  const next: MarketingFacts = { ...now, ...patch, sources: { ...(now.sources ?? {}), ...(patch.sources ?? {}) } };
  await q(
    `INSERT INTO ${TABLE} (listing_id, facts, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (listing_id) DO UPDATE SET facts = EXCLUDED.facts, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [listingId, JSON.stringify(next), by]
  );
  return next;
}
