import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * LANDLORDS ADDED ON A LET, AND EDITS TO PEOPLE ONLY PROPOLY HOLDS
 * (James, 20 Oct 2026).
 *
 * "A home can be owned by several people, so there should always be an Add
 * landlord." His example was Apartment 30, 21 Wheatsheaf Court: opened as
 * its Propoly deal, the let said it held no landlord at all. A landlord
 * added here is kept against the let, the way a tenant added on the let is
 * (lib/let-tenants), and shown with the landlords REX and Propoly hold.
 *
 * An edit to somebody REX holds goes to REX as before (PATCH
 * /api/people/contact). Somebody only Propoly holds - the people on a let
 * opened as its deal - has no record of ours to change, so an edit to them
 * is kept here as the OS's own version of them, over what Propoly says.
 *
 * Into Propoly: lib/let-propoly-sync, behind propoly_people_live.
 */

export interface LetLandlord {
  id: string;
  letRef: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Their own home, one line - the contracts need it, Propoly asks for it. */
  address: string | null;
  by: string;
  at: string;
}

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
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_let_landlords (
      id TEXT PRIMARY KEY,
      let_ref TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removed_at TIMESTAMPTZ
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_let_landlords_let ON os_let_landlords (let_ref)`))
    .then(() =>
      q(`CREATE TABLE IF NOT EXISTS os_let_person_edits (
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
    )
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

type Row = { id: string; let_ref: string; name: string; email: string | null; phone: string | null; address: string | null; by_name: string; created_at: Date };
const shape = (r: Row): LetLandlord => ({
  id: r.id, letRef: r.let_ref, name: r.name, email: r.email, phone: r.phone, address: r.address, by: r.by_name, at: new Date(r.created_at).toISOString(),
});

export async function letLandlords(letRef: string): Promise<LetLandlord[]> {
  if (!hasDb() || !letRef) return [];
  const rows = await tq<Row>(`SELECT * FROM os_let_landlords WHERE let_ref = $1 AND removed_at IS NULL ORDER BY created_at`, [letRef]);
  return rows.map(shape);
}

export async function addLetLandlord(l: Omit<LetLandlord, "id" | "at">): Promise<LetLandlord> {
  const id = randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  const rows = await tq<Row>(
    `INSERT INTO os_let_landlords (id, let_ref, name, email, phone, address, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, l.letRef, l.name, l.email, l.phone, l.address, l.by]
  );
  return shape(rows[0]);
}

/** Change one added landlord. Only the fields given change. */
export async function updateLetLandlord(id: string, change: Partial<Pick<LetLandlord, "name" | "email" | "phone" | "address">>): Promise<LetLandlord | null> {
  const rows = await tq<Row>(
    `UPDATE os_let_landlords SET
       name = COALESCE($2, name),
       email = CASE WHEN $3::boolean THEN $4 ELSE email END,
       phone = CASE WHEN $5::boolean THEN $6 ELSE phone END,
       address = CASE WHEN $7::boolean THEN $8 ELSE address END,
       updated_at = NOW()
     WHERE id = $1 AND removed_at IS NULL RETURNING *`,
    [id, change.name ?? null, "email" in change, change.email ?? null, "phone" in change, change.phone ?? null, "address" in change, change.address ?? null]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function removeLetLandlord(id: string): Promise<LetLandlord | null> {
  const rows = await tq<Row>(`UPDATE os_let_landlords SET removed_at = NOW() WHERE id = $1 AND removed_at IS NULL RETURNING *`, [id]);
  return rows[0] ? shape(rows[0]) : null;
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
