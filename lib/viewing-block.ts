import "server-only";
import { hasDb, q } from "@/lib/db";
import { accessKeyFor } from "@/lib/access-key";

/**
 * A VIEWING BLOCK (James, 8 Oct 2026): "Add another viewing to this slot" -
 * more people booked in one after another while we still have access to the
 * property, without going through the whole booking each time.
 *
 * Each added viewing is an ordinary booking (POST /api/viewings/book). What
 * makes it part of a block is that it shares the first viewing's access: the
 * request the agent made for that viewing - who was asked, and whether they
 * said yes - is copied onto the new one, so a tenant's yes for 10:00 covers
 * 10:15 and 10:30 as well, and the listing doesn't show each one as "access
 * not asked". The copy says which viewing it came from.
 *
 * Access lives in os_case_state kind "access", against the property
 * (lib/access-key), with the requests keyed by viewing id.
 */

type AccessRequest = { viewingId: string; when: string; to: string; requestedAt: string; grantedAt: string | null; blockOf?: string };
type AccessPayload = { kind?: string | null; requests?: Record<string, AccessRequest> };

export type BlockAccess = "granted" | "asked" | "vacant" | "none";

export async function copyBlockAccess(p: {
  listingId: string | null;
  propertyId: string | null;
  fromViewingId: string;
  toViewingId: string;
  startsAt: string;
  by: string;
}): Promise<BlockAccess> {
  if (!hasDb()) return "none";
  const keys = [accessKeyFor({ listingId: p.listingId, propertyId: p.propertyId }), p.listingId].filter(Boolean) as string[];
  if (!keys.length) return "none";
  const rows = await q<{ record_id: string; payload: AccessPayload }>(
    `SELECT record_id, payload FROM os_case_state WHERE kind = 'access' AND record_id = ANY($1::text[])`,
    [keys]
  ).catch(() => []);
  const row = rows.find((r) => r.record_id === keys[0]) ?? rows[0];
  const a = row?.payload;
  if (!a?.kind) return "none";
  /* Empty and keyed: nobody to ask, the keys cover every viewing. */
  if (a.kind === "vacant") return "vacant";
  const from = a.requests?.[p.fromViewingId];
  if (!from) return "none";
  const copy: AccessRequest = { ...from, viewingId: p.toViewingId, when: new Date(p.startsAt).toISOString(), blockOf: p.fromViewingId };
  /* Merged in place, so an access change saved at the same moment is kept. */
  await q(
    `UPDATE os_case_state
        SET payload = payload || jsonb_build_object('requests', COALESCE(payload->'requests', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)),
            updated_at = NOW(), updated_by = $4
      WHERE kind = 'access' AND record_id = $1`,
    [row.record_id, p.toViewingId, JSON.stringify(copy), p.by]
  ).catch(() => null);
  return from.grantedAt ? "granted" : "asked";
}
