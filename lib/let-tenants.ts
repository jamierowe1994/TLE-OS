import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";

/**
 * A TENANT ADDED TO A LET IN PROGRESS (Kirstie, ticket 6a2dc73c, 19 Oct 2026).
 *
 * The offer was accepted for two and a third person is joining before the
 * move-in. A guarantor can already be added on the let (lib/guarantors); a
 * tenant now can too, the same way. Kept in the OS, against the let.
 *
 * Into Propoly: while the deal hasn't been pushed, an added tenant goes onto
 * the let's Push to Propoly with everyone else (lib/deal-handoff handoffFor) -
 * but only once James switches on tenant_changes_live. Until then, and
 * always once the deal is already in Propoly, the agent adds them in Propoly
 * by hand; the let says so. (Adding to a deal already pushed would be a new
 * Propoly write, POST /tenants on that deal - not built, James's question.)
 */

export interface LetTenant {
  id: string;
  letRef: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Referenced like the rest of the applicants. Off: added with no references. */
  reference: boolean;
  by: string;
  at: string;
}

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_let_tenants (
      id TEXT PRIMARY KEY,
      let_ref TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      reference BOOLEAN NOT NULL DEFAULT TRUE,
      by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removed_at TIMESTAMPTZ
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_let_tenants_let ON os_let_tenants (let_ref)`))
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

type Row = { id: string; let_ref: string; name: string; email: string | null; phone: string | null; reference: boolean; by_name: string; created_at: Date };
const shape = (r: Row): LetTenant => ({ id: r.id, letRef: r.let_ref, name: r.name, email: r.email, phone: r.phone, reference: r.reference, by: r.by_name, at: new Date(r.created_at).toISOString() });

export async function letTenants(letRef: string): Promise<LetTenant[]> {
  if (!hasDb() || !letRef) return [];
  const rows = await tq<Row>(`SELECT * FROM os_let_tenants WHERE let_ref = $1 AND removed_at IS NULL ORDER BY created_at`, [letRef]);
  return rows.map(shape);
}

export async function addLetTenant(t: Omit<LetTenant, "id" | "at">): Promise<LetTenant> {
  const id = randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  const rows = await tq<Row>(
    `INSERT INTO os_let_tenants (id, let_ref, name, email, phone, reference, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, t.letRef, t.name, t.email, t.phone, t.reference, t.by]
  );
  return shape(rows[0]);
}

export async function removeLetTenant(id: string): Promise<LetTenant | null> {
  const rows = await tq<Row>(`UPDATE os_let_tenants SET removed_at = NOW() WHERE id = $1 AND removed_at IS NULL RETURNING *`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

/** What the let's push carries: nothing until tenant_changes_live is on. */
export async function addedTenantsForPush(letRef: string): Promise<LetTenant[]> {
  if (!hasDb() || !(await switchOn("tenant_changes_live").catch(() => false))) return [];
  return letTenants(letRef);
}
