import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * A LANDLORD WHO OPTED OUT OF ZERO DEPOSIT (21 Oct 2026).
 *
 * Decided on the "PLC Checks and OS Updates" call: every landlord is opted in
 * to Flatfair's zero deposit under the terms of business, and the tenant
 * chooses. A few landlords say no. The agent records that on the landlord's
 * file - never the landlord, so it is on no portal and not in the signing
 * flow - and it is kept low-key, so opting out is not made to look easy.
 *
 * One row a person in os_zero_deposit_optouts, found by email or contact ref
 * ("os:<id>" | "rex:<id>"), the same way as their home address
 * (lib/landlord-home), so a tick on a lead, a listing or a home on Portfolio
 * is the same tick. A let finds it from its landlord's email (Propoly's deal
 * holds no REX id) or REX contact.
 *
 * What it changes, for that landlord's lets:
 *   - Push to Propoly starts the deal with a deposit, never zero deposit, and
 *     asks for Propoly's Flatfair clause to come off (lib/handover)
 *   - a Flatfair draft goes as a traditional deposit (pretenancy/flatfair)
 *   - pre-tenancy shows it by the deposit scheme, and a Flatfair clause on
 *     the deal is no longer read as "no cash deposit"
 */

export interface OptOut {
  reason: string | null;
  by: string;
  at: string;
}

export interface OptOutKey {
  email?: string | null;
  ref?: string | null;
}

type Row = { email: string; person_ref: string; opted_out: boolean; reason: string; set_by_name: string; set_by: string; set_at: string | Date };

const lower = (s?: string | null) => (s ?? "").trim().toLowerCase();
const toOptOut = (r: Row): OptOut => ({ reason: r.reason || null, by: r.set_by_name || r.set_by, at: new Date(r.set_at).toISOString() });

/** A REX contact id ("12345"), as the book and the handover carry it, as a ref. */
export function refOfContact(contactId: string | null | undefined): string | null {
  const id = String(contactId ?? "").trim();
  return /^\d+$/.test(id) ? `rex:${id}` : id.startsWith("rex:") || id.startsWith("os:") ? id : null;
}

/** One landlord's opt-out, or null: opted in, as the terms of business have it. */
export async function optOutFor(k: OptOutKey): Promise<OptOut | null> {
  if (!hasDb()) return null;
  const email = lower(k.email);
  const ref = (k.ref ?? "").trim();
  if (!email && !ref) return null;
  const rows = await q<Row>(
    `SELECT email, person_ref, opted_out, reason, set_by, set_by_name, set_at FROM os_zero_deposit_optouts
      WHERE ($1 <> '' AND email = $1) OR ($2 <> '' AND person_ref = $2)
      ORDER BY set_at DESC LIMIT 1`,
    [email, ref]
  );
  const r = rows[0];
  return r?.opted_out ? toOptOut(r) : null;
}

/**
 * Every landlord who opted out, for a board that asks about many lets at
 * once. A handful of rows, so it is read whole; match with `optOutIn`.
 */
export async function allOptOuts(): Promise<Row[]> {
  if (!hasDb()) return [];
  return q<Row>(
    `SELECT email, person_ref, opted_out, reason, set_by, set_by_name, set_at FROM os_zero_deposit_optouts ORDER BY set_at DESC`
  ).catch(() => []);
}

export function optOutIn(rows: Row[], k: OptOutKey): OptOut | null {
  const email = lower(k.email);
  const ref = (k.ref ?? "").trim();
  if (!email && !ref) return null;
  /* Newest first, so a tick taken back wins over the one before it. */
  const r = rows.find((x) => (email && x.email === email) || (ref && x.person_ref === ref));
  return r?.opted_out ? toOptOut(r) : null;
}

export async function saveOptOut(p: OptOutKey & {
  name?: string | null;
  optedOut: boolean;
  reason?: string | null;
  by: { email: string; name: string };
}): Promise<OptOut | null> {
  const email = lower(p.email);
  const ref = (p.ref ?? "").trim();
  if (!email && !ref) throw new Error("Which landlord? There is no email or contact to keep it against.");
  const id = email ? `email:${email}` : ref;
  const reason = p.optedOut ? (p.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 300) : "";
  const byName = (p.by.name || p.by.email).slice(0, 120);
  await q(
    `INSERT INTO os_zero_deposit_optouts (id, email, person_ref, name, opted_out, reason, set_by, set_by_name, set_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       person_ref = CASE WHEN EXCLUDED.person_ref <> '' THEN EXCLUDED.person_ref ELSE os_zero_deposit_optouts.person_ref END,
       name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE os_zero_deposit_optouts.name END,
       opted_out = EXCLUDED.opted_out, reason = EXCLUDED.reason,
       set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name, set_at = NOW()`,
    [id, email, ref, (p.name ?? "").trim().slice(0, 160), p.optedOut, reason, p.by.email, byName]
  );
  /* The same person kept under their ref before an email was known: bring it into line. */
  if (email && ref) {
    await q(
      `UPDATE os_zero_deposit_optouts SET opted_out = $2, reason = $3, set_by = $4, set_by_name = $5, set_at = NOW() WHERE person_ref = $1 AND id <> $6`,
      [ref, p.optedOut, reason, p.by.email, byName, id]
    ).catch(() => undefined);
  }
  return p.optedOut ? { reason: reason || null, by: byName, at: new Date().toISOString() } : null;
}
