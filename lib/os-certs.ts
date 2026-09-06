import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Cert, CertKey } from "@/lib/compliance";

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then - today.getTime()) / 86400000);
}

/** Every certificate row the OS holds for these property ids, newest expiry first. */
export async function osCertRows(propertyIds: string[]): Promise<OsCertRow[]> {
  if (!hasDb() || !propertyIds.length) return [];
  return q<OsCertRow>(
    `SELECT property_id, type_id, expiry::text AS expiry, issue::text AS issue, name, r2_key
       FROM os_certificates WHERE property_id = ANY($1) ORDER BY expiry DESC`,
    [propertyIds]
  ).catch(() => []);
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
