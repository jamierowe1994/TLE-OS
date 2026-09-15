import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Answers } from "@/lib/property-questions";

/**
 * What a landlord has told us about their property, kept against the appraisal
 * the contract was signed on.
 *
 * ── It goes in os_case_state, not a table of its own ──────────────────────
 *
 * The questions are going to move - Michael will want another certificate,
 * Kirstie another access field - and a new key should not be a migration. The
 * generic (kind, record_id, payload jsonb) store exists for exactly this shape
 * and gives the upsert for free.
 *
 * ── Saved a field at a time, MERGED never replaced ────────────────────────
 *
 * `payload || $2::jsonb` is the whole trick: two tabs, a flaky train
 * connection, or a landlord who answers three questions and comes back on
 * Sunday all end up with everything they typed. A replace would let the last
 * writer quietly delete the other's answers, and the landlord would never know
 * which ones went.
 */

const KIND = "property-answers";

export async function readAnswers(appraisalId: string): Promise<Answers> {
  if (!hasDb() || !appraisalId) return {};
  const rows = await q<{ payload: Answers | null }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, appraisalId]
  ).catch(() => []);
  return rows[0]?.payload ?? {};
}

export async function saveAnswers(appraisalId: string, patch: Answers, by: string): Promise<Answers> {
  if (!hasDb() || !appraisalId) return {};
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE
       SET payload = os_case_state.payload || $3::jsonb, updated_at = NOW(), updated_by = $4`,
    [KIND, appraisalId, JSON.stringify(patch), by]
  ).catch(() => null);
  return readAnswers(appraisalId);
}

/** One property's answers, with enough around them to show on any file. */
export interface AnsweredProperty {
  appraisalId: string;
  landlord: string;
  address: string;
  propertyId: string | null;
  answers: Answers;
  updatedAt: string | null;
}

/* Only appraisals that HAVE answers: an inner join, so a file with nothing to
   show gets an empty list rather than a panel full of blanks. */
const JOINED = `
  SELECT m.id, m.landlord, m.address, m.rex_property_id, c.payload, c.updated_at
    FROM os_market_appraisals m
    JOIN os_case_state c
      ON c.kind = 'property-answers' AND c.record_id = m.id`;

type JoinRow = {
  id: string;
  landlord: string;
  address: string;
  rex_property_id: string | null;
  payload: Answers | null;
  updated_at: Date | string | null;
};

const shape = (r: JoinRow): AnsweredProperty => ({
  appraisalId: r.id,
  landlord: r.landlord,
  address: r.address,
  propertyId: r.rex_property_id ?? null,
  answers: r.payload ?? {},
  updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
});

/** By REX property - what the portfolio and the compliance drawer hold. */
export async function answersForProperties(propertyIds: string[]): Promise<AnsweredProperty[]> {
  const ids = propertyIds.map((s) => s.trim()).filter(Boolean);
  if (!hasDb() || !ids.length) return [];
  const rows = await q<JoinRow>(`${JOINED} WHERE m.rex_property_id = ANY($1)`, [ids]).catch(() => []);
  return rows.map(shape);
}

/**
 * By address, for a home REX has no property for yet - an appraisal that has
 * not become a listing. Matched both ways round because the callers spell it
 * differently: some pass the address alone, some with the postcode appended.
 */
export async function answersForAddress(address: string): Promise<AnsweredProperty[]> {
  const a = address.trim();
  if (!hasDb() || !a) return [];
  const rows = await q<JoinRow>(
    `${JOINED} WHERE lower(m.address) = lower($1) OR lower($1) LIKE lower(m.address) || '%'`,
    [a]
  ).catch(() => []);
  return rows.map(shape);
}

export async function answersForAppraisal(id: string): Promise<AnsweredProperty | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<JoinRow>(`${JOINED} WHERE m.id = $1`, [id]).catch(() => []);
  return rows[0] ? shape(rows[0]) : null;
}
