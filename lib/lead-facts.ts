import { hasDb, q } from "@/lib/db";
import type { LeadFacts, PropertyFactsData } from "@/lib/lead-facts-shape";

export { EMPTY_PROPERTY, defaultTags } from "@/lib/lead-facts-shape";
export type { LeadFacts, PropertyFactsData } from "@/lib/lead-facts-shape";

/**
 * What the OS holds about a lead that REX does not: tags, and on a landlord
 * lead the property (James, 11 Sep 2026: tags you can filter on, and a page
 * that fills itself in). One row per lead id. The reads and writes; the
 * shape lives in lead-facts-shape so the browser can share it.
 */
export async function readFacts(leadId: string): Promise<LeadFacts> {
  if (!hasDb()) return { tags: null, property: null };
  const rows = await q<{ tags: string[] | null; property: PropertyFactsData | null }>(
    `SELECT tags, property FROM os_lead_facts WHERE lead_id = $1`, [leadId]
  ).catch(() => []);
  return rows[0] ?? { tags: null, property: null };
}

export async function readAllTags(): Promise<Record<string, string[]>> {
  if (!hasDb()) return {};
  const rows = await q<{ lead_id: string; tags: string[] }>(`SELECT lead_id, tags FROM os_lead_facts WHERE tags IS NOT NULL`).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.lead_id, r.tags]));
}

export async function writeFacts(leadId: string, patch: Partial<LeadFacts>): Promise<void> {
  await q(
    `INSERT INTO os_lead_facts (lead_id, tags, property)
     VALUES ($1, $2::jsonb, $3::jsonb)
     ON CONFLICT (lead_id) DO UPDATE SET
       tags = COALESCE(EXCLUDED.tags, os_lead_facts.tags),
       property = COALESCE(EXCLUDED.property, os_lead_facts.property),
       updated_at = NOW()`,
    [leadId, patch.tags === undefined ? null : JSON.stringify(patch.tags), patch.property === undefined ? null : JSON.stringify(patch.property)]
  );
}
