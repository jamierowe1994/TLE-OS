import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * MORE PEOPLE ON A HOME THAN THE ONE LANDLORD (agent call, 16 Oct 2026).
 *
 * A married couple own a home through their company. Only the husband is on
 * the record, and the wife does all the talking. So the home's page takes two
 * more kinds of person beside the landlord:
 *
 *   joint_landlord   "Add additional landlord" - a second owner
 *   contact          "Add point of contact" - somebody the agent deals with
 *                    who is not the landlord (a spouse, a son, a PA)
 *
 * Kept in os_property_people against the book's property id, and nowhere
 * else. James's hands-off REX rule: none of it is written to REX until he
 * says yes to that specific change. Removing one sets removed_at, so the
 * audit still reads who was there.
 *
 * Wherever the landlord's details are picked up to send something - Report a
 * repair, Plan a certificate - these come through /api/property/people beside
 * the landlord, and the agent picks who it goes to.
 */

export type PersonKind = "joint_landlord" | "contact";
export const KIND_LABEL: Record<PersonKind, string> = { joint_landlord: "Joint landlord", contact: "Point of contact" };
export const isKind = (k: unknown): k is PersonKind => k === "joint_landlord" || k === "contact";

export type PropertyPerson = {
  id: string;
  propertyId: string;
  kind: PersonKind;
  name: string;
  email: string | null;
  phone: string | null;
  /** In the agent's words: "Wife, does the talking", "Director". */
  relation: string;
  addedBy: string;
  addedAt: string;
};

type Row = {
  id: string; property_id: string; kind: string; name: string; email: string | null; phone: string | null;
  relation: string; added_by: string; added_at: Date | string;
};
const shape = (r: Row): PropertyPerson => ({
  id: r.id,
  propertyId: r.property_id,
  kind: isKind(r.kind) ? r.kind : "contact",
  name: r.name,
  email: r.email,
  phone: r.phone,
  relation: r.relation ?? "",
  addedBy: r.added_by,
  addedAt: new Date(r.added_at).toISOString(),
});

/** Everyone on one home, landlords first, oldest first within each. */
export async function peopleOn(propertyId: string): Promise<PropertyPerson[]> {
  if (!hasDb() || !propertyId) return [];
  const rows = await q<Row>(
    `SELECT id, property_id, kind, name, email, phone, relation, added_by, added_at FROM os_property_people
      WHERE property_id = $1 AND removed_at IS NULL
      ORDER BY (kind = 'joint_landlord') DESC, added_at`,
    [propertyId]
  );
  return rows.map(shape);
}

export async function personById(id: string): Promise<PropertyPerson | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<Row>(
    `SELECT id, property_id, kind, name, email, phone, relation, added_by, added_at FROM os_property_people WHERE id = $1 AND removed_at IS NULL`,
    [id]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export type PersonInput = { kind: PersonKind; name: string; email: string | null; phone: string | null; relation: string };

export async function addPerson(propertyId: string, p: PersonInput, by: string): Promise<PropertyPerson> {
  const rows = await q<Row>(
    `INSERT INTO os_property_people (id, property_id, kind, name, email, phone, relation, added_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, property_id, kind, name, email, phone, relation, added_by, added_at`,
    [randomUUID(), propertyId, p.kind, p.name, p.email, p.phone, p.relation, by]
  );
  return shape(rows[0]);
}

export async function updatePerson(id: string, p: Omit<PersonInput, "kind">): Promise<PropertyPerson | null> {
  const rows = await q<Row>(
    `UPDATE os_property_people SET name = $2, email = $3, phone = $4, relation = $5, updated_at = NOW()
      WHERE id = $1 AND removed_at IS NULL
      RETURNING id, property_id, kind, name, email, phone, relation, added_by, added_at`,
    [id, p.name, p.email, p.phone, p.relation]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function removePerson(id: string): Promise<boolean> {
  const rows = await q<{ id: string }>(`UPDATE os_property_people SET removed_at = NOW() WHERE id = $1 AND removed_at IS NULL RETURNING id`, [id]);
  return rows.length > 0;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The typed form, tidied, or the sentence that says what is wrong with it. */
export function cleanPerson(b: Record<string, unknown> | null): { ok: true; value: Omit<PersonInput, "kind"> } | { ok: false; error: string } {
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  const email = String(b?.email ?? "").trim().toLowerCase() || null;
  const phone = String(b?.phone ?? "").trim() || null;
  const relation = String(b?.relation ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Put their name in." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };
  if (email && !EMAIL.test(email)) return { ok: false, error: "That email address doesn't look right." };
  if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone)) return { ok: false, error: "That phone number doesn't look right." };
  return { ok: true, value: { name, email, phone, relation } };
}
