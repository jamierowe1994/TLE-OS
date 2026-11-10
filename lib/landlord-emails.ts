import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * A LANDLORD'S OTHER EMAIL ADDRESSES (Dan Richards, ticket 190230a3; James,
 * 10 Nov 2026: "Have the ability to add a second email, so you can click +,
 * and then you can select what type of email it is (work or personal).").
 *
 * The landlord's email stays the one REX holds: it is how their home address
 * and opt-out are found, and where the confirmation, the decks and the terms
 * go. This keeps what else they gave us, each with a type, and the type of
 * the main one (Personal until somebody says Work).
 *
 * One row a person in os_landlord_emails, found by email or contact ref
 * ("os:<id>" | "rex:<id>") exactly as their home address (lib/landlord-home)
 * and opt-out (lib/zero-deposit-optout), so the same person shows the same
 * addresses on every screen.
 *
 * OS only. Nothing here is written to REX, PayProp or Propoly, and no
 * automatic send reads it: it is for the agent to see and press Email on.
 */

export type EmailKind = "personal" | "work";
export interface OtherEmail { email: string; kind: EmailKind }
export interface LandlordEmails {
  /** The type of the main (REX) email. */
  mainKind: EmailKind;
  extras: OtherEmail[];
}
export interface EmailsKey { email?: string | null; ref?: string | null }

export const MAX_EXTRAS = 4;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = (s?: string | null) => (s ?? "").trim().toLowerCase();
export const kindOf = (v: unknown): EmailKind => (v === "work" ? "work" : "personal");

type Row = { main_kind: string; extras: unknown };

function cleanExtras(raw: unknown, main: string): OtherEmail[] {
  const seen = new Set<string>([main]);
  const out: OtherEmail[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const email = lower((x as { email?: unknown })?.email as string);
    if (!EMAIL.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email: email.slice(0, 200), kind: kindOf((x as { kind?: unknown })?.kind) });
    if (out.length >= MAX_EXTRAS) break;
  }
  return out;
}

/** Their other emails and the main one's type, or null when nobody has said. */
export async function emailsFor(k: EmailsKey): Promise<LandlordEmails | null> {
  if (!hasDb()) return null;
  const email = lower(k.email);
  const ref = (k.ref ?? "").trim();
  if (!email && !ref) return null;
  const rows = await q<Row>(
    `SELECT main_kind, extras FROM os_landlord_emails
      WHERE ($1 <> '' AND email = $1) OR ($2 <> '' AND person_ref = $2)
      ORDER BY set_at DESC LIMIT 1`,
    [email, ref]
  );
  const r = rows[0];
  if (!r) return null;
  return { mainKind: kindOf(r.main_kind), extras: cleanExtras(r.extras, email) };
}

/** Typed addresses checked before saving: the first one that isn't an email, or null. */
export function badEmail(extras: { email: string }[]): string | null {
  for (const x of extras) {
    const e = lower(x.email);
    if (e && !EMAIL.test(e)) return x.email.trim();
  }
  return null;
}

export async function saveEmails(p: EmailsKey & {
  /** The email they were kept under before it changed: that row goes. */
  was?: string | null;
  name?: string | null;
  mainKind: EmailKind;
  extras: { email: string; kind: EmailKind }[];
  by: string;
}): Promise<LandlordEmails> {
  const email = lower(p.email);
  const ref = (p.ref ?? "").trim();
  if (!email && !ref) throw new Error("Which landlord? There is no email or contact to keep it against.");
  const id = email ? `email:${email}` : ref;
  const extras = cleanExtras(p.extras, email);
  await q(
    `INSERT INTO os_landlord_emails (id, email, person_ref, name, main_kind, extras, set_by, set_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET
       person_ref = CASE WHEN EXCLUDED.person_ref <> '' THEN EXCLUDED.person_ref ELSE os_landlord_emails.person_ref END,
       name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE os_landlord_emails.name END,
       main_kind = EXCLUDED.main_kind, extras = EXCLUDED.extras, set_by = EXCLUDED.set_by, set_at = NOW()`,
    [id, email, ref, (p.name ?? "").trim().slice(0, 160), p.mainKind, JSON.stringify(extras), p.by]
  );
  /* Kept under their ref before their email was known, or under an email
     since changed: the older row stops answering for them. */
  if (ref) {
    await q(`DELETE FROM os_landlord_emails WHERE person_ref = $1 AND id <> $2`, [ref, id]).catch(() => undefined);
  }
  const was = lower(p.was);
  if (was && was !== email) {
    await q(`DELETE FROM os_landlord_emails WHERE id = $1 AND id <> $2`, [`email:${was}`, id]).catch(() => undefined);
  }
  return { mainKind: p.mainKind, extras };
}
