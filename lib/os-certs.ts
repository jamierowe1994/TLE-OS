import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Cert, CertKey } from "@/lib/compliance";
import type { CertChecking } from "@/lib/cert-hold";

/**
 * Certificates the OS holds itself, read as the compliance book reads REX's:
 * latest expiry per type wins, `expires` is days from today. For a home REX
 * CRM has no property for, this IS its compliance record (6 Sep 2026).
 */

const KEY: Record<string, CertKey> = {
  gas_safety: "gas",
  eicr: "eicr",
  epc: "epc",
  mandatory_hmo_license: "licence",
  additional_hmo_license: "licence",
  selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella",
  portable_appliance_testing: "pat",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
  emergency_lighting_fire_exit: "fire",
};

export type OsCertRow = {
  property_id: string;
  type_id: string;
  expiry: string;
  issue: string | null;
  name: string;
  r2_key: string;
};

function daysUntil(iso: string): number | null {
  const then = new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();
  if (!Number.isFinite(then)) return null;
  /* Same 2000-2045 window as the intake and the REX reader: a date outside
     it is a typo, and counts as no valid date rather than as decades over. */
  if (then < new Date("2000-01-01T00:00:00").getTime() || then > new Date("2045-12-31T23:59:59").getTime()) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then - today.getTime()) / 86400000);
}

/** Every certificate row the OS holds for these property ids, newest expiry
 *  first. Not one still waiting for compliance's check (lib/cert-hold): that
 *  is not live until they verify it. */
export async function osCertRows(propertyIds: string[]): Promise<OsCertRow[]> {
  if (!hasDb() || !propertyIds.length) return [];
  return q<OsCertRow>(
    `SELECT property_id, type_id, expiry::text AS expiry, issue::text AS issue, name, r2_key
       FROM os_certificates WHERE property_id = ANY($1) AND NOT awaiting_check ORDER BY expiry DESC`,
    [propertyIds]
  ).catch(() => []);
}

/**
 * The certificates waiting for compliance's check, per property id and book
 * key: what every screen shows as "Being processed by the compliance team".
 * The newest filing per type; a query rides along so the agent can see it.
 */
export async function checkingFor(propertyIds: string[]): Promise<Map<string, Partial<Record<CertKey, CertChecking>>>> {
  const out = new Map<string, Partial<Record<CertKey, CertChecking>>>();
  if (!hasDb() || !propertyIds.length) return out;
  const rows = await q<{ id: string; property_id: string; type_id: string; expiry: string; added_at: Date; added_by: string; state: string | null; note: string | null }>(
    `SELECT c.id, c.property_id, c.type_id, c.expiry::text AS expiry, c.added_at, c.added_by, k.state, k.note
       FROM os_certificates c
       LEFT JOIN os_compliance_checks k ON k.kind = 'certificate' AND k.subject_id = c.id
      WHERE c.property_id = ANY($1) AND c.awaiting_check
      ORDER BY c.added_at DESC`,
    [propertyIds]
  ).catch(() => []);
  for (const r of rows) {
    const key = KEY[r.type_id];
    if (!key) continue;
    const certs = out.get(r.property_id) ?? {};
    if (certs[key]) continue; // newest only
    certs[key] = {
      id: r.id,
      expiry: String(r.expiry).slice(0, 10),
      at: new Date(r.added_at).toISOString(),
      by: r.added_by,
      queried: r.state === "queried" ? (r.note ?? "").trim() || "Compliance has a question about it." : null,
    };
    out.set(r.property_id, certs);
  }
  return out;
}

/** The book's shape - {gas: {expires, attached}, ...} - per property id. */
export async function osCertsFor(propertyIds: string[]): Promise<Map<string, Partial<Record<CertKey, Cert>>>> {
  const out = new Map<string, Partial<Record<CertKey, Cert>>>();
  for (const r of await osCertRows(propertyIds)) {
    const key = KEY[r.type_id];
    if (!key) continue;
    const certs = out.get(r.property_id) ?? {};
    const expires = daysUntil(r.expiry);
    const held = certs[key];
    if (!held || (expires != null && (held.expires == null || expires > held.expires))) certs[key] = { expires, attached: true };
    out.set(r.property_id, certs);
  }
  return out;
}
