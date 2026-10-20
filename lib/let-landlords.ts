import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * EDITS TO PEOPLE ONLY PROPOLY HOLDS (James, 20 Oct 2026).
 *
 * An edit to somebody REX holds goes to REX (PATCH /api/people/contact); a
 * home's extra landlords and points of contact are lib/property-people. The
 * people on a let opened as its Propoly deal have no record of ours to
 * change, so an edit to them is kept here as the OS's own version of them,
 * over what Propoly says. Into Propoly: lib/let-propoly-sync.
 *
 * (Landlords added on a let were kept here too for the first hour of
 * 20 Oct; they now go onto the home with everyone else's.)
 */

export interface PersonEdit {
  letRef: string;
  /** Which person: lib/let-people's key ("propoly:tenant:<email>" and so on). */
  key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  by: string;
  at: string;
}

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_let_person_edits (
        let_ref TEXT NOT NULL,
        person_key TEXT NOT NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        by_name TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (let_ref, person_key)
      )`)
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

type EditRow = { let_ref: string; person_key: string; name: string | null; email: string | null; phone: string | null; address: string | null; by_name: string; updated_at: Date };

export async function personEdits(letRef: string): Promise<Map<string, PersonEdit>> {
  const out = new Map<string, PersonEdit>();
  if (!hasDb() || !letRef) return out;
  const rows = await tq<EditRow>(`SELECT * FROM os_let_person_edits WHERE let_ref = $1`, [letRef]);
  for (const r of rows) {
    out.set(r.person_key, { letRef: r.let_ref, key: r.person_key, name: r.name, email: r.email, phone: r.phone, address: r.address, by: r.by_name, at: new Date(r.updated_at).toISOString() });
  }
  return out;
}

/** The OS's own version of somebody only Propoly holds. Fields not given are kept. */
export async function savePersonEdit(letRef: string, key: string, change: Partial<Pick<PersonEdit, "name" | "email" | "phone" | "address">>, by: string): Promise<void> {
  await tq(
    `INSERT INTO os_let_person_edits (let_ref, person_key, name, email, phone, address, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (let_ref, person_key) DO UPDATE SET
       name = CASE WHEN $8::boolean THEN EXCLUDED.name ELSE os_let_person_edits.name END,
       email = CASE WHEN $9::boolean THEN EXCLUDED.email ELSE os_let_person_edits.email END,
       phone = CASE WHEN $10::boolean THEN EXCLUDED.phone ELSE os_let_person_edits.phone END,
       address = CASE WHEN $11::boolean THEN EXCLUDED.address ELSE os_let_person_edits.address END,
       by_name = EXCLUDED.by_name, updated_at = NOW()`,
    [letRef, key, change.name ?? null, change.email ?? null, change.phone ?? null, change.address ?? null, by, "name" in change, "email" in change, "phone" in change, "address" in change]
  );
}
