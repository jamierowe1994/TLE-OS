import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { isLandlordKind, type ChangedLandlord, type Director, type LandlordKind } from "@/lib/landlord-kinds";
import type { Landlord } from "@/lib/rex-landlord";
import type { ManagedBook, Party } from "@/lib/portfolio-types";
import { currentLets } from "@/lib/current-lets";
import { countsOf, landlordsOf } from "@/lib/managed-book";

/**
 * CHANGE LANDLORD (Dan Richards, 17 Oct 2026, ticket 083d7752).
 *
 * "I have 2 properties that are actually in company names so I need to change
 * the landlord record from a private person to a company." The landlord on a
 * listing is REX's owner, and REX is hands-off (James: no REX data writes
 * without his yes for that specific change), so the change is kept here and
 * laid over REX's answer wherever the OS shows or writes to the landlord:
 *
 *   - the listing's Landlord box and everything that asks landlordForListing
 *     (offer emails to the landlord, viewing confirmations, a let's people)
 *   - the home's page on Portfolio and the Landlords list (managedBookFor)
 *
 * The newest change not undone wins, matched by the listing it was made on or
 * the home's property id, so a change made on Portfolio holds on the home's
 * next listing too. Undo puts REX's owner back. Every change and undo is
 * audited by the route.
 *
 * A changed landlord has no REX contact behind it: its contactId is
 * "changed:<id>", never numeric, so ContactBlock stays read-only and no REX
 * write path takes it.
 */

type Row = {
  id: string; listing_id: string | null; property_id: string | null; kind: string; name: string;
  company_number: string | null; contact_name: string | null; email: string | null; phone: string | null;
  directors: Director[] | null; late_owner: string | null; previous: ChangedLandlord["previous"];
  changed_by: string; changed_at: Date | string;
};

const COLS = `id, listing_id, property_id, kind, name, company_number, contact_name, email, phone, directors, late_owner, previous, changed_by, changed_at`;

const shape = (r: Row): ChangedLandlord => ({
  id: r.id,
  kind: isLandlordKind(r.kind) ? r.kind : "private",
  name: r.name,
  companyNumber: r.company_number,
  contactName: r.contact_name,
  email: r.email,
  phone: r.phone,
  directors: Array.isArray(r.directors) ? r.directors : [],
  lateOwner: r.late_owner,
  previous: r.previous ?? null,
  changedBy: r.changed_by,
  changedAt: new Date(r.changed_at).toISOString(),
});

export const isChangedLandlord = (contactId: string | null | undefined) => String(contactId ?? "").startsWith("changed:");

/** The landlord now, for a listing and/or its home; null when nobody has changed it. */
export async function changedLandlordFor(p: { listingId?: string | null; propertyId?: string | null }): Promise<ChangedLandlord | null> {
  if (!hasDb()) return null;
  const listingId = String(p.listingId ?? "").trim();
  const propertyId = String(p.propertyId ?? "").trim();
  if (!listingId && !propertyId) return null;
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_landlord_changes
      WHERE undone_at IS NULL AND (($1 <> '' AND listing_id = $1) OR ($2 <> '' AND property_id = $2))
      ORDER BY changed_at DESC LIMIT 1`,
    [listingId, propertyId]
  );
  return rows[0] ? shape(rows[0]) : null;
}

/** Who the OS writes to: the company's or executor's contact details, else the owner's. */
export function asLandlord(c: ChangedLandlord): Landlord & { kind: LandlordKind; changeId: string } {
  return { contactId: null, name: c.name, email: c.email, phone: c.phone, from: "os", kind: c.kind, changeId: c.id };
}

export function asParty(c: ChangedLandlord): Party {
  return { contactId: `changed:${c.id}`, name: c.name, email: c.email, phone: c.phone };
}

export type ChangeInput = {
  kind: LandlordKind;
  name: string;
  companyNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  directors: Director[];
  lateOwner: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{6,}$/;
const tidy = (v: unknown, max = 160) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** The typed steps, tidied, or the sentence that says what is wrong. */
export function cleanChange(b: Record<string, unknown> | null): { ok: true; value: ChangeInput } | { ok: false; error: string } {
  if (!isLandlordKind(b?.kind)) return { ok: false, error: "Pick what kind of landlord it is now." };
  const kind = b.kind;
  const email = tidy(b?.email).toLowerCase() || null;
  const phone = tidy(b?.phone, 40) || null;
  if (email && !EMAIL.test(email)) return { ok: false, error: "That email address doesn't look right." };
  if (phone && !PHONE.test(phone)) return { ok: false, error: "That phone number doesn't look right." };
  const directors: Director[] = (Array.isArray(b?.directors) ? (b!.directors as Record<string, unknown>[]) : [])
    .map((d) => ({ name: tidy(d?.name, 120), email: tidy(d?.email).toLowerCase() || null, phone: tidy(d?.phone, 40) || null }))
    .filter((d) => d.name)
    .slice(0, 6);
  for (const d of directors) {
    if (d.email && !EMAIL.test(d.email)) return { ok: false, error: `${d.name}'s email address doesn't look right.` };
    if (d.phone && !PHONE.test(d.phone)) return { ok: false, error: `${d.name}'s phone number doesn't look right.` };
  }
  let name = tidy(b?.name, 120);
  const contactName = tidy(b?.contactName, 120) || null;
  const lateOwner = tidy(b?.lateOwner, 120) || null;
  let companyNumber = tidy(b?.companyNumber, 12).toUpperCase().replace(/\s/g, "") || null;

  if (kind === "company") {
    if (name.length < 2) return { ok: false, error: "Put the company's name in." };
    if (companyNumber && !/^[A-Z]{0,2}\d{6,8}$/.test(companyNumber)) return { ok: false, error: "A Companies House number is eight characters, like 01234567 or SC123456." };
    if (!directors.length) return { ok: false, error: "Put at least one director in." };
  } else if (kind === "executor") {
    companyNumber = null;
    if (!contactName || contactName.length < 2) return { ok: false, error: "Put the executor's name in." };
    if (!lateOwner) return { ok: false, error: "Put the name of the owner who has died." };
    name = name.length >= 2 ? name : `Estate of ${lateOwner}`;
  } else {
    companyNumber = null;
    if (name.length < 2) return { ok: false, error: "Put the new owner's name in." };
  }
  if (!email && !phone) return { ok: false, error: "Put an email or a phone number in, so the OS knows how to reach them." };
  return {
    ok: true,
    value: { kind, name, companyNumber, contactName: kind === "private" ? null : contactName, email, phone, directors: kind === "company" ? directors : [], lateOwner: kind === "executor" ? lateOwner : null },
  };
}

export async function saveChange(p: {
  listingId: string | null;
  propertyId: string | null;
  address: string;
  value: ChangeInput;
  previous: ChangedLandlord["previous"];
  by: { id: string; name: string };
}): Promise<ChangedLandlord> {
  const v = p.value;
  const rows = await q<Row>(
    `INSERT INTO os_landlord_changes
       (id, listing_id, property_id, address, kind, name, company_number, contact_name, email, phone, directors, late_owner, previous, changed_by_id, changed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14,$15)
     RETURNING ${COLS}`,
    [
      randomUUID(), p.listingId, p.propertyId, p.address.slice(0, 300), v.kind, v.name, v.companyNumber, v.contactName,
      v.email, v.phone, JSON.stringify(v.directors), v.lateOwner, p.previous ? JSON.stringify(p.previous) : null, p.by.id, p.by.name,
    ]
  );
  return shape(rows[0]);
}

export async function undoChange(id: string, by: string): Promise<ChangedLandlord | null> {
  const rows = await q<Row>(
    `UPDATE os_landlord_changes SET undone_at = NOW(), undone_by = $2 WHERE id = $1 AND undone_at IS NULL RETURNING ${COLS}`,
    [id, by]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function changeById(id: string): Promise<(ChangedLandlord & { listingId: string | null; propertyId: string | null }) | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<Row>(`SELECT ${COLS} FROM os_landlord_changes WHERE id = $1 AND undone_at IS NULL`, [id]);
  return rows[0] ? { ...shape(rows[0]), listingId: rows[0].listing_id, propertyId: rows[0].property_id } : null;
}

/** Every live change, for laying over the managed book in one read. */
async function allChanges(): Promise<{ byListing: Map<string, ChangedLandlord>; byProperty: Map<string, ChangedLandlord> }> {
  const byListing = new Map<string, ChangedLandlord>();
  const byProperty = new Map<string, ChangedLandlord>();
  if (!hasDb()) return { byListing, byProperty };
  const rows = await q<Row>(`SELECT ${COLS} FROM os_landlord_changes WHERE undone_at IS NULL ORDER BY changed_at`);
  /* Oldest first, so the newest for each key is the one left standing. */
  for (const r of rows) {
    const c = shape(r);
    if (r.listing_id) byListing.set(r.listing_id, c);
    if (r.property_id) byProperty.set(r.property_id, c);
  }
  return { byListing, byProperty };
}

/** The changed landlords laid over Portfolio's book, current lets only, as record landlords are. */
export async function withChangedLandlords(book: ManagedBook): Promise<ManagedBook> {
  let held: Awaited<ReturnType<typeof allChanges>>;
  try {
    held = await allChanges();
  } catch {
    return book;
  }
  if (!held.byListing.size && !held.byProperty.size) return book;
  const current = new Set(currentLets(book.properties).map((p) => p.listingId));
  let changed = 0;
  const properties = book.properties.map((p) => {
    if (!current.has(p.listingId)) return p;
    const a = held.byListing.get(p.listingId);
    const b = p.propertyId ? held.byProperty.get(p.propertyId) : undefined;
    const c = a && b ? (a.changedAt > b.changedAt ? a : b) : a ?? b;
    if (!c) return p;
    changed++;
    return { ...p, landlord: asParty(c) };
  });
  if (!changed) return book;
  const landlords = landlordsOf(currentLets(properties));
  const counts = { ...book.counts, ...countsOf(properties, landlords), rentsFromPayProp: book.counts.rentsFromPayProp };
  return { ...book, properties, landlords, counts };
}
