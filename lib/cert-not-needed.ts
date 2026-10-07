import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Certificates marked not needed on a home (James, 7 Oct 2026).
 *
 * "Attach an NA button on every one that's missing, because there might just
 * be some exceptions to the rule, which is fairly complicated." The rule in
 * requiredCerts stays the rule; this is the exception, made by a person, with
 * their name and reason on it, and undoable.
 */

export type NotNeeded = { propertyId: string; cert: string; reason: string; by: string; at: string };

export async function notNeededAll(): Promise<NotNeeded[]> {
  if (!hasDb()) return [];
  const rows = await q<{ property_id: string; cert: string; reason: string; by_name: string; at: Date }>(
    `SELECT property_id, cert, reason, by_name, at FROM os_cert_not_needed`
  ).catch(() => []);
  return rows.map((r) => ({ propertyId: r.property_id, cert: r.cert, reason: r.reason, by: r.by_name, at: new Date(r.at).toISOString() }));
}

export async function markNotNeeded(propertyId: string, cert: string, reason: string, by: string): Promise<NotNeeded> {
  const rows = await q<{ at: Date }>(
    `INSERT INTO os_cert_not_needed (property_id, cert, reason, by_name, at) VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (property_id, cert) DO UPDATE SET reason = EXCLUDED.reason, by_name = EXCLUDED.by_name, at = NOW()
     RETURNING at`,
    [propertyId, cert, reason, by]
  );
  return { propertyId, cert, reason, by, at: new Date(rows[0]?.at ?? Date.now()).toISOString() };
}

export async function clearNotNeeded(propertyId: string, cert: string): Promise<boolean> {
  const rows = await q(`DELETE FROM os_cert_not_needed WHERE property_id = $1 AND cert = $2 RETURNING cert`, [propertyId, cert]);
  return rows.length > 0;
}
