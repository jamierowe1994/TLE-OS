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
