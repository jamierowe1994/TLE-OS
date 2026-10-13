import "server-only";
import { hasDb, q } from "@/lib/db";
import { isTestFile } from "@/lib/test-guard";
import type { TermsParty } from "@/lib/docuseal";

/**
 * A TEST FILE'S TERMS ARE SIGNED IN THE OS ALONE (James, 13 Oct 2026: a
 * tester walks landlord lead -> appraisal -> decks -> terms signed -> new
 * listing "without anything refusing or slowing them").
 *
 * Draw up and sign on a test file used to open a REAL DocuSeal contract.
 * Now it opens the stand-in the Showroom uses (components/landlord/
 * DocusealEmbed, a "demo:test:<appraisal id>" address): read, type a name,
 * sign. Signing files the same row a reset to "Terms signed" files - a
 * negative id, so it can never be taken for DocuSeal's - and that one row is
 * what every screen reads: both halves signed (termsParties below), the
 * file's stage (lib/appraisal-stage), the property questions. Send records
 * the send and emails nobody. A reset or a delete takes the row away with
 * the appraisal (lib/test-files unwind, os_signed_documents by appraisal).
 */

/** The stand-in signing address for a test file's contract. */
export const TEST_SIGN_PREFIX = "demo:test:";
export const testSignSrc = (appraisalId: string) => `${TEST_SIGN_PREFIX}${appraisalId}`;

/**
 * Signed by both sides, on our side only. The submitter id is NEGATIVE - the
 * column is DocuSeal's own bigint, and nothing real can ever collide with it -
 * and the r2_key is empty, so nothing ever tries to file it into REX.
 */
export async function fileTestSignature(appraisalId: string, landlord: { name: string; email: string }, at = new Date()): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_signed_documents
       (submitter_id, submission_id, appraisal_id, template_name, signer_name, signer_email, r2_key, completed_at)
     VALUES ($1, $2, $3, 'Terms of business (test)', $4, $5, '', $6)
     ON CONFLICT (submitter_id) DO NOTHING`,
    [-(Date.now() * 1000 + Math.floor(Math.random() * 1000)), -1, appraisalId, landlord.name, landlord.email, at.toISOString()]
  );
}

/**
 * Both halves of a test file's contract, from that row, in the shape DocuSeal's
 * are read in. Null when it is not a test file (the caller asks DocuSeal); an
 * empty list when it is one and nothing has been signed yet.
 */
export async function testTermsParties(appraisalId: string): Promise<TermsParty[] | null> {
  if (!hasDb() || !(await isTestFile({ appraisalId }).catch(() => false))) return null;
  const rows = await q<{ submitter_id: string; signer_name: string; signer_email: string; completed_at: Date | string | null; agent: string | null }>(
    `SELECT d.submitter_id, d.signer_name, d.signer_email, d.completed_at, a.agent
       FROM os_signed_documents d LEFT JOIN os_market_appraisals a ON a.id = d.appraisal_id
      WHERE d.appraisal_id = $1 AND d.completed_at IS NOT NULL
      ORDER BY d.completed_at DESC LIMIT 1`,
    [appraisalId]
  ).catch(() => []);
  const r = rows[0];
  if (!r?.completed_at) return [];
  const at = new Date(r.completed_at).toISOString();
  const src = testSignSrc(appraisalId);
  const base = { slug: "test", embedSrc: src, status: "completed", sentAt: null, openedAt: at, completedAt: at };
  return [
    { ...base, role: "agent", submitterId: Number(r.submitter_id), name: r.agent ?? null, email: "" },
    { ...base, role: "landlord", submitterId: Number(r.submitter_id), name: r.signer_name || null, email: r.signer_email || "" },
  ];
}

/**
 * Send, on a test file: written down as sent (the file's "sent to them"),
 * emailing nobody. The same record lib/contract-send keeps for a real one.
 */
export async function recordTestSend(appraisalId: string, to: string, by: string): Promise<void> {
  if (!hasDb()) return;
  const before = await q<{ payload: { firstSentAt?: string; count?: number } }>(
    `SELECT payload FROM os_case_state WHERE kind = 'contract-send' AND record_id = $1`,
    [appraisalId]
  ).catch(() => []);
  const now = new Date().toISOString();
  const record = { firstSentAt: before[0]?.payload?.firstSentAt ?? now, lastSentAt: now, count: (before[0]?.payload?.count ?? 0) + 1, to, test: true };
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ('contract-send', $1, $2::jsonb, NOW(), $3)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [appraisalId, JSON.stringify(record), by]
  );
}
