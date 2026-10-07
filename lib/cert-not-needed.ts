import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * A person's word on a certificate the rule asks for (James, 7 Oct 2026).
 *
 *   not_needed       "Attach an NA button on every one that's missing,
 *                    because there might just be some exceptions to the
 *                    rule, which is fairly complicated." Off every list.
 *   renewal_applied  Michael: an HMO licence that has run out with the
 *                    renewal already at the council, which can take six
 *                    months. Off the outstanding list for those six months,
 *                    then back on if no new licence has been filed.
 *
 * The rule in requiredCerts stays the rule; these are the exceptions, made by
 * a person, with their name on them, and undoable.
 */

export type MarkKind = "not_needed" | "renewal_applied";

export type NotNeeded = {
  propertyId: string;
  cert: string;
  kind: MarkKind;
  reason: string;
  by: string;
  at: string;
  /** renewal_applied: the day the application went to the council. */
  appliedOn?: string | null;
  /** renewal_applied: the council's reference, when there is one. */
  ref?: string;
};

type Row = { property_id: string; cert: string; kind: string | null; reason: string; by_name: string; at: Date; applied_on: string | null; ref: string | null };

const out = (r: Row): NotNeeded => ({
  propertyId: r.property_id,
  cert: r.cert,
  kind: r.kind === "renewal_applied" ? "renewal_applied" : "not_needed",
  reason: r.reason,
  by: r.by_name,
  at: new Date(r.at).toISOString(),
  appliedOn: r.applied_on ? String(r.applied_on).slice(0, 10) : null,
  ref: r.ref ?? "",
});

export async function notNeededAll(): Promise<NotNeeded[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT property_id, cert, kind, reason, by_name, at, applied_on::text AS applied_on, ref FROM os_cert_not_needed`
  ).catch(() => []);
  return rows.map(out);
}

export async function markNotNeeded(
  propertyId: string,
  cert: string,
  reason: string,
  by: string,
  extra: { kind?: MarkKind; appliedOn?: string | null; ref?: string } = {}
): Promise<NotNeeded> {
  const rows = await q<Row>(
    `INSERT INTO os_cert_not_needed (property_id, cert, reason, by_name, at, kind, applied_on, ref) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
     ON CONFLICT (property_id, cert) DO UPDATE SET reason = EXCLUDED.reason, by_name = EXCLUDED.by_name, at = NOW(),
       kind = EXCLUDED.kind, applied_on = EXCLUDED.applied_on, ref = EXCLUDED.ref
     RETURNING property_id, cert, kind, reason, by_name, at, applied_on::text AS applied_on, ref`,
    [propertyId, cert, reason, by, extra.kind ?? "not_needed", extra.appliedOn ?? null, extra.ref ?? ""]
  );
  return out(rows[0]);
}

export async function clearNotNeeded(propertyId: string, cert: string): Promise<boolean> {
  const rows = await q(`DELETE FROM os_cert_not_needed WHERE property_id = $1 AND cert = $2 RETURNING cert`, [propertyId, cert]);
  return rows.length > 0;
}
