import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * Guarantors (Lorna Fieldson, 15 Oct 2026). Steve told her, rightly, that
 * there was nowhere in the OS to put one: the passport asks yes or no, and
 * the details only ever existed in Propoly's deal once referencing began.
 *
 * Now each applicant can have one or more guarantors - name, email, phone,
 * how they know the applicant, their address - kept in the OS only.
 *
 * ── How one guarantor shows in three places ───────────────────────────────
 *
 * A guarantor belongs to an applicant, and the applicant's EMAIL is what
 * stays the same as they move from the lead to the let in Applications to the
 * tenant on the home in Portfolio (each of those reads them from a different
 * system). So a guarantor is found by the applicant's email, and also by the
 * lead or let it was typed in on, for an applicant with no email yet.
 *
 * Not sent anywhere: nothing here writes to REX, Propoly or PayProp.
 */

export interface Guarantor {
  id: string;
  applicantName: string;
  applicantEmail: string | null;
  leadId: string | null;
  letRef: string | null;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  address: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuarantorInput {
  applicantName: string;
  applicantEmail: string | null;
  name: string;
  email?: string;
  phone?: string;
  relationship?: string;
  address?: string;
}

interface Row extends Record<string, unknown> {
  id: string;
  applicant_name: string;
  applicant_email: string | null;
  lead_id: string | null;
  let_ref: string | null;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  address: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const toGuarantor = (r: Row): Guarantor => ({
  id: r.id,
  applicantName: r.applicant_name,
  applicantEmail: r.applicant_email,
  leadId: r.lead_id,
  letRef: r.let_ref,
  name: r.name,
  email: r.email,
  phone: r.phone,
  relationship: r.relationship,
  address: r.address,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

const lowerEmail = (e: string | null | undefined) => {
  const t = (e ?? "").trim().toLowerCase();
  return t.includes("@") ? t : null;
};

export const RELATIONSHIPS = ["Parent", "Family member", "Partner", "Friend", "Employer", "Other"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with a guarantor as typed, in words, or null. */
export function problemWith(g: GuarantorInput): string | null {
  if (!g.name?.trim()) return "A guarantor needs a name.";
  if (!g.applicantName?.trim()) return "Say whose guarantor they are.";
  if (g.email?.trim() && !EMAIL.test(g.email.trim())) return "That doesn't look like an email address.";
  if (g.phone?.trim() && g.phone.replace(/\D/g, "").length < 7) return "That doesn't look like a phone number.";
  return null;
}

/** Every guarantor for these applicants, or added on this lead or let. */
export async function guarantorsFor(p: { emails: (string | null | undefined)[]; leadId?: string | null; letRef?: string | null }): Promise<Guarantor[]> {
  if (!hasDb()) return [];
  const emails = [...new Set(p.emails.map(lowerEmail).filter((e): e is string => Boolean(e)))];
  if (!emails.length && !p.leadId && !p.letRef) return [];
  const rows = await q<Row>(
    `SELECT * FROM os_guarantors
      WHERE removed_at IS NULL
        AND (lower(applicant_email) = ANY($1::text[]) OR ($2::text IS NOT NULL AND lead_id = $2) OR ($3::text IS NOT NULL AND let_ref = $3))
      ORDER BY created_at`,
    [emails, p.leadId ?? null, p.letRef ?? null]
  );
  return rows.map(toGuarantor);
}

export async function guarantorById(id: string): Promise<Guarantor | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT * FROM os_guarantors WHERE id = $1 AND removed_at IS NULL`, [id]);
  return rows[0] ? toGuarantor(rows[0]) : null;
}

export async function addGuarantor(g: GuarantorInput, where: { leadId?: string | null; letRef?: string | null }, by: string): Promise<Guarantor> {
  const rows = await q<Row>(
    `INSERT INTO os_guarantors (id, applicant_name, applicant_email, lead_id, let_ref, name, email, phone, relationship, address, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      randomUUID(),
      g.applicantName.trim().slice(0, 120),
      lowerEmail(g.applicantEmail),
      where.leadId ?? null,
      where.letRef ?? null,
      g.name.trim().slice(0, 120),
      (g.email ?? "").trim().toLowerCase().slice(0, 200),
      (g.phone ?? "").trim().slice(0, 40),
      (g.relationship ?? "").trim().slice(0, 60),
      (g.address ?? "").trim().slice(0, 300),
      by,
    ]
  );
  return toGuarantor(rows[0]);
}

export async function updateGuarantor(id: string, g: GuarantorInput, by: string): Promise<Guarantor | null> {
  const rows = await q<Row>(
    `UPDATE os_guarantors SET applicant_name = $2, applicant_email = $3, name = $4, email = $5, phone = $6,
            relationship = $7, address = $8, updated_by = $9, updated_at = NOW()
      WHERE id = $1 AND removed_at IS NULL RETURNING *`,
    [
      id,
      g.applicantName.trim().slice(0, 120),
      lowerEmail(g.applicantEmail),
      g.name.trim().slice(0, 120),
      (g.email ?? "").trim().toLowerCase().slice(0, 200),
      (g.phone ?? "").trim().slice(0, 40),
      (g.relationship ?? "").trim().slice(0, 60),
      (g.address ?? "").trim().slice(0, 300),
      by,
    ]
  );
  return rows[0] ? toGuarantor(rows[0]) : null;
}

export async function removeGuarantor(id: string, by: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_guarantors SET removed_at = NOW(), removed_by = $2 WHERE id = $1 AND removed_at IS NULL RETURNING id`,
    [id, by]
  );
  return rows.length > 0;
}
