import "server-only";
import { q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * Forms started on a home's page and not sent (James, 7 Oct 2026): "if we
 * started building one, we should have latest activity started but not
 * finished", with a bin to drop it and a click to pick up where they left
 * off. One row per draft, keyed on the listing the page is about; the form's
 * answers are kept as they were typed, and the row goes when the form is
 * sent or binned. Nothing here is sent anywhere.
 */

export const DRAFT_KINDS = ["repair", "planned", "tenant-notice"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export interface PropertyDraft {
  id: string;
  listingId: string;
  propertyId: string | null;
  kind: DraftKind;
  data: Record<string, unknown>;
  startedBy: string;
  createdAt: string;
  updatedAt: string;
}

type Row = { id: string; listing_id: string; property_id: string | null; kind: string; data: Record<string, unknown>; started_by: string; created_at: Date; updated_at: Date };
const toDraft = (r: Row): PropertyDraft => ({
  id: r.id,
  listingId: r.listing_id,
  propertyId: r.property_id,
  kind: r.kind as DraftKind,
  data: r.data ?? {},
  startedBy: r.started_by,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function draftsFor(listingId: string): Promise<PropertyDraft[]> {
  const rows = await q<Row>(`SELECT * FROM os_property_drafts WHERE listing_id = $1 ORDER BY updated_at DESC LIMIT 20`, [listingId]);
  return rows.map(toDraft);
}

/** Create, or update the one with this id. */
export async function saveDraft(
  input: { id?: string | null; listingId: string; propertyId: string | null; kind: DraftKind; data: Record<string, unknown> },
  who: { id: string; name: string }
): Promise<PropertyDraft> {
  if (input.id) {
    const [r] = await q<Row>(
      `UPDATE os_property_drafts SET data = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [input.id, JSON.stringify(input.data)]
    );
    if (r) return toDraft(r);
  }
  const [r] = await q<Row>(
    `INSERT INTO os_property_drafts (id, listing_id, property_id, kind, data, started_by, started_by_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [input.id || uid(), input.listingId, input.propertyId, input.kind, JSON.stringify(input.data), who.name, who.id]
  );
  return toDraft(r);
}

export async function dropDraft(id: string): Promise<void> {
  await q(`DELETE FROM os_property_drafts WHERE id = $1`, [id]);
}
