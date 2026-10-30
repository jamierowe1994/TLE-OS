import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { LandlordDetails, TermsValues } from "@/lib/terms/types";

/**
 * os_terms: one row per Terms of Business sent from the OS (lib/terms).
 *
 * The words are code (lib/terms/catalogue, by version); this row holds what
 * was filled in, who signs, and how far each of them has got. DocuSeal is the
 * record of every signature - `parties` mirrors it so a page can answer
 * without asking DocuSeal once per person, and the webhook and the signed
 * calls keep the two in step.
 */

export type PartyStatus = "waiting" | "emailed" | "opened" | "signed";

export interface Party {
  /** "l1", "l2"... in the order the agent listed them. */
  key: string;
  name: string;
  email: string;
  phone: string;
  /** Their own link: /sign/<token>. Never guessable, never reused. */
  token: string;
  details: Partial<LandlordDetails>;
  submitterId: number | null;
  embedSrc: string | null;
  status: PartyStatus;
  emailedAt: string | null;
  emailError: string | null;
  openedAt: string | null;
  signedAt: string | null;
}

export type TermsStatus = "agent" | "sent" | "signed" | "cancelled";

export interface TermsRow {
  id: string;
  version: string;
  listingId: string | null;
  propertyId: string | null;
  appraisalId: string | null;
  propertyAddress: string;
  values: TermsValues;
  parties: Party[];
  agentId: string;
  agentName: string;
  agentEmail: string;
  submissionId: number | null;
  agentSubmitterId: number | null;
  agentEmbedSrc: string | null;
  agentSignedAt: string | null;
  status: TermsStatus;
  signedR2Key: string | null;
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  /** Adjust contract: the set this one takes over from, withdrawn when the agent signs this one. */
  replaces: string | null;
}

type Raw = {
  id: string;
  version: string;
  listing_id: string | null;
  property_id: string | null;
  appraisal_id: string | null;
  property_address: string;
  terms_values: TermsValues;
  parties: Party[];
  agent_id: string;
  agent_name: string;
  agent_email: string;
  submission_id: string | number | null;
  agent_submitter_id: string | number | null;
  agent_embed_src: string | null;
  agent_signed_at: Date | string | null;
  status: TermsStatus;
  signed_r2_key: string | null;
  created_at: Date | string;
  sent_at: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
  replaces: string | null;
};

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const num = (n: string | number | null) => (n == null ? null : Number(n));

function shape(r: Raw): TermsRow {
  return {
    id: r.id,
    version: r.version,
    listingId: r.listing_id,
    propertyId: r.property_id,
    appraisalId: r.appraisal_id,
    propertyAddress: r.property_address,
    values: r.terms_values,
    parties: Array.isArray(r.parties) ? r.parties : [],
    agentId: r.agent_id,
    agentName: r.agent_name,
    agentEmail: r.agent_email,
    submissionId: num(r.submission_id),
    agentSubmitterId: num(r.agent_submitter_id),
    agentEmbedSrc: r.agent_embed_src,
    agentSignedAt: iso(r.agent_signed_at),
    status: r.status,
    signedR2Key: r.signed_r2_key,
    createdAt: iso(r.created_at)!,
    sentAt: iso(r.sent_at),
    completedAt: iso(r.completed_at),
    cancelledAt: iso(r.cancelled_at),
    replaces: r.replaces ?? null,
  };
}

export const newToken = () => randomBytes(24).toString("base64url");
export const newTermsId = () => `t_${randomBytes(10).toString("hex")}`;

export async function insertTerms(t: Omit<TermsRow, "createdAt" | "sentAt" | "completedAt" | "cancelledAt" | "agentSignedAt" | "signedR2Key">): Promise<void> {
  if (!hasDb()) throw new Error("No database on this environment, so terms can't be kept.");
  await q(
    `INSERT INTO os_terms (id, version, listing_id, property_id, appraisal_id, property_address, terms_values, parties,
       agent_id, agent_name, agent_email, submission_id, agent_submitter_id, agent_embed_src, status, replaces)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [t.id, t.version, t.listingId, t.propertyId, t.appraisalId, t.propertyAddress, JSON.stringify(t.values), JSON.stringify(t.parties),
      t.agentId, t.agentName, t.agentEmail, t.submissionId, t.agentSubmitterId, t.agentEmbedSrc, t.status, t.replaces]
  );
}

export async function getTerms(id: string): Promise<TermsRow | null> {
  if (!hasDb()) return null;
  const rows = await q<Raw>(`SELECT * FROM os_terms WHERE id = $1`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

/** The contract a link belongs to, and which person on it the link is. */
export async function byToken(token: string): Promise<{ terms: TermsRow; party: Party } | null> {
  if (!hasDb() || !/^[\w-]{20,}$/.test(token)) return null;
  const rows = await q<Raw>(`SELECT * FROM os_terms WHERE parties @> $1::jsonb LIMIT 1`, [JSON.stringify([{ token }])]);
  if (!rows[0]) return null;
  const terms = shape(rows[0]);
  const party = terms.parties.find((p) => p.token === token);
  return party ? { terms, party } : null;
}

/** Every set of terms for a home, newest first: by listing, property or appraisal. */
export async function termsForHome(h: { listingId?: string | null; propertyId?: string | null; appraisalId?: string | null }): Promise<TermsRow[]> {
  if (!hasDb()) return [];
  const rows = await q<Raw>(
    `SELECT * FROM os_terms
      WHERE ($1::text IS NOT NULL AND listing_id = $1)
         OR ($2::text IS NOT NULL AND property_id = $2)
         OR ($3::text IS NOT NULL AND appraisal_id = $3)
      ORDER BY created_at DESC LIMIT 20`,
    [h.listingId ?? null, h.propertyId ?? null, h.appraisalId ?? null]
  );
  return rows.map(shape);
}

/** An agent's own, for the bell. */
export async function termsForAgent(agentId: string, limit = 20): Promise<TermsRow[]> {
  if (!hasDb()) return [];
  const rows = await q<Raw>(`SELECT * FROM os_terms WHERE agent_id = $1 AND cancelled_at IS NULL ORDER BY created_at DESC LIMIT $2`, [agentId, limit]);
  return rows.map(shape);
}

export async function saveParties(id: string, parties: Party[]): Promise<void> {
  await q(`UPDATE os_terms SET parties = $2::jsonb WHERE id = $1`, [id, JSON.stringify(parties)]);
}

export async function markAgentSigned(id: string): Promise<void> {
  await q(`UPDATE os_terms SET agent_signed_at = COALESCE(agent_signed_at, NOW()) WHERE id = $1`, [id]);
}

/**
 * Moves agent-signed terms to sent, once. True for the one caller that moved
 * them: the agent's screen and DocuSeal's webhook both arrive on the agent's
 * signature, and each emailed the landlord (68 Main Street, 29 Oct 2026: two
 * copies 0.4s apart). Only the caller this returns true for sends.
 */
export async function markSent(id: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_terms SET status = 'sent', sent_at = COALESCE(sent_at, NOW()) WHERE id = $1 AND status = 'agent' RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function markSigned(id: string, r2Key: string | null): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_terms SET status = 'signed', completed_at = COALESCE(completed_at, NOW()), signed_r2_key = COALESCE($2, signed_r2_key)
      WHERE id = $1 AND status <> 'cancelled' AND completed_at IS NULL RETURNING id`,
    [id, r2Key]
  );
  return rows.length > 0;
}

export async function markCancelled(id: string): Promise<void> {
  await q(`UPDATE os_terms SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 AND status <> 'signed'`, [id]);
}
