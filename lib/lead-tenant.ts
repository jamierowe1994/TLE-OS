import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The lead tenant, as changed in the OS (Lianna, 16 Oct 2026).
 *
 * A let with several applicants has one lead: the person Propoly, the PLC
 * check and the board treat as the main tenant. REX sets it when the
 * application is made and swaps and OS offers set it from who joined first,
 * and until now nobody could change it afterwards. An agent's choice is held
 * here (os_lead_tenants) and laid over every application as it is read, so
 * the board, the let's page and the PLC check all follow it. REX's own
 * application is left as it was: changing it there would be a REX write.
 */

type Person = { name: string; email: string | null; contactId: string | null; isPrimary: boolean };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

import { applicantKey } from "@/lib/lead-tenant-key";
export { applicantKey };

/** Does this stored key point at this applicant? A contact id first, then the email, then the name. */
function isThem(key: string, p: Person): boolean {
  return key === applicantKey(p) || key === `e:${norm(p.email)}` || key === `n:${norm(p.name)}`;
}

type Held = { at: number; map: Map<string, string> };
const g = globalThis as unknown as { __leadTenants?: Held };

/** Every changed lead: application id -> applicant key. Held for 30 seconds. */
export async function leadOverrides(): Promise<Map<string, string>> {
  if (!hasDb()) return new Map();
  if (g.__leadTenants && Date.now() - g.__leadTenants.at < 30_000) return g.__leadTenants.map;
  const rows = await q<{ application_id: string; applicant_key: string }>(`SELECT application_id, applicant_key FROM os_lead_tenants`);
  const map = new Map(rows.map((r) => [r.application_id, r.applicant_key]));
  g.__leadTenants = { at: Date.now(), map };
  return map;
}

/** Lay a changed lead over one application's applicants, in place. Only when the key still matches somebody. */
export function applyLead<T extends { id: string; applicants: Person[] }>(app: T, overrides: Map<string, string>): T {
  const key = overrides.get(String(app.id));
  if (!key || app.applicants.length < 2) return app;
  const at = app.applicants.findIndex((p) => isThem(key, p));
  if (at < 0) return app;
  app.applicants.forEach((p, i) => { p.isPrimary = i === at; });
  /* The lead reads first wherever a list is shown. */
  if (at > 0) app.applicants.unshift(...app.applicants.splice(at, 1));
  return app;
}

/** Record the change. The caller has checked the person may open the let and the applicant is on it. */
export async function setLead(applicationId: string, p: { name: string; email: string | null; contactId: string | null }, by: string): Promise<void> {
  await q(
    `INSERT INTO os_lead_tenants (application_id, applicant_key, applicant_name, set_by, set_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (application_id) DO UPDATE SET applicant_key = EXCLUDED.applicant_key, applicant_name = EXCLUDED.applicant_name, set_by = EXCLUDED.set_by, set_at = NOW()`,
    [applicationId, applicantKey(p), p.name, by]
  );
  g.__leadTenants = undefined;
}
