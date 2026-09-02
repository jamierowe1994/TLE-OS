import "server-only";
import { cookies } from "next/headers";
import { hasDb, q } from "@/lib/db";
import { LANDLORD_COOKIE, uid, verifyPortalToken } from "@/lib/auth";
import { managedBookFor } from "@/lib/managed-book-cache";
import { normaliseEmail } from "@/lib/users";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * Who a landlord is, and what is theirs.
 *
 * ── Identity comes from REX, not from a form ──────────────────────────────
 *
 * A landlord is the owner contact on a managed listing. That relationship is
 * already read for the Portfolio screen (lib/managed-book.ts), with the
 * contact's email inline, so "which landlord is this email" is answered from
 * the book we hold rather than from a REX search. Measured 2 Sep 2026: REX's
 * Contacts service refuses every email field as a search criterion
 * (email_address, contact_emails.email_address, email, system_search_key),
 * so a search was never an option anyway.
 *
 * The consequence, stated plainly: an address gets a link only if it is the
 * owner contact on a property we manage. 328 of the 449 managed properties
 * carry one. A landlord whose only property is still on the market is not
 * found yet, and the sign-in page says the same thing to them as to a
 * stranger - which is the right answer to give a stranger.
 *
 * ── The account row is a record of a visit, not a credential ─────────────
 *
 * os_portal_accounts holds the email, the name REX had, the contact ids the
 * email matched, and when they first came in. No password: the link is the
 * sign-in. The row exists so the OS can say who has been in and when, and so
 * a session cookie has an id to carry rather than an email.
 */

export interface LandlordMatch {
  email: string;
  name: string;
  contactIds: string[];
  properties: ManagedProperty[];
}

export interface LandlordAccount {
  id: string;
  email: string;
  name: string;
  contactIds: string[];
  activatedAt: string | null;
}

type Row = {
  id: string;
  email: string;
  name: string;
  rex_contact_id: string | null;
  activated_at: Date | string | null;
  profile: { contactIds?: string[] } | null;
};

const shape = (r: Row): LandlordAccount => ({
  id: r.id,
  email: r.email,
  name: r.name,
  contactIds: [
    ...new Set([...(r.profile?.contactIds ?? []), ...(r.rex_contact_id ? [r.rex_contact_id] : [])]),
  ],
  activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
});

/** The properties whose owner contact carries this email. */
export async function landlordByEmail(rawEmail: string): Promise<LandlordMatch | null> {
  const email = normaliseEmail(rawEmail);
  if (!email.includes("@")) return null;
  const { book } = await managedBookFor(null);
  const mine = book.properties.filter(
    (p) => p.landlord?.email && normaliseEmail(p.landlord.email) === email
  );
  if (!mine.length) return null;
  const contactIds = [...new Set(mine.map((p) => p.landlord!.contactId))];
  return { email, name: mine[0].landlord!.name, contactIds, properties: mine };
}

export async function upsertLandlordAccount(m: LandlordMatch): Promise<LandlordAccount> {
  const rows = await q<Row>(
    `INSERT INTO os_portal_accounts (id, kind, email, name, rex_contact_id, profile)
     VALUES ($1, 'landlord', $2, $3, $4, $5)
     ON CONFLICT (email, kind) DO UPDATE
       SET name = EXCLUDED.name,
           rex_contact_id = EXCLUDED.rex_contact_id,
           profile = os_portal_accounts.profile || EXCLUDED.profile
     RETURNING id, email, name, rex_contact_id, activated_at, profile`,
    [uid(), m.email, m.name, m.contactIds[0] ?? null, JSON.stringify({ contactIds: m.contactIds })]
  );
  return shape(rows[0]);
}

export async function landlordAccountByEmail(rawEmail: string): Promise<LandlordAccount | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, rex_contact_id, activated_at, profile
       FROM os_portal_accounts WHERE kind = 'landlord' AND email = $1`,
    [normaliseEmail(rawEmail)]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function landlordAccountById(id: string): Promise<LandlordAccount | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, rex_contact_id, activated_at, profile
       FROM os_portal_accounts WHERE kind = 'landlord' AND id = $1`,
    [id]
  );
  return rows[0] ? shape(rows[0]) : null;
}

/** First time through the door. Returns true if this visit was the first. */
export async function activateLandlord(id: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_portal_accounts SET activated_at = NOW()
      WHERE kind = 'landlord' AND id = $1 AND activated_at IS NULL RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

/** The signed-in landlord for this request, or null. Server components and routes. */
export async function currentLandlord(): Promise<LandlordAccount | null> {
  const jar = await cookies();
  const id = verifyPortalToken(jar.get(LANDLORD_COOKIE)?.value, "landlord");
  if (!id) return null;
  return landlordAccountById(id);
}

/**
 * Their properties, live from the managed book. Matched on the contact ids
 * the email resolved to AND on the email itself, so a second REX contact
 * for the same person that appeared after they first signed in is still
 * theirs.
 */
export async function landlordProperties(a: LandlordAccount): Promise<ManagedProperty[]> {
  const { book } = await managedBookFor(null);
  const ids = new Set(a.contactIds);
  const email = normaliseEmail(a.email);
  return book.properties.filter(
    (p) =>
      p.landlord &&
      (ids.has(p.landlord.contactId) || (p.landlord.email && normaliseEmail(p.landlord.email) === email))
  );
}
