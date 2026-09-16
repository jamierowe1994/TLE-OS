import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * THE LANDLORD SAYING YES TO AN APPLICANT.
 *
 * James, 16 Sep 2026: "at the bottom, they'll have an Approve button. We won't
 * give them a decline button, and the simple reason why is that if they
 * decline someone and they want to come back to it, it's going to be really
 * difficult."
 *
 * ── What approving actually does, and what it does not ─────────────────────
 *
 * It tells the AGENT. It does not accept the offer: REX and Propoly are
 * read-only from the OS, so nothing here can move an application's status in
 * either, and pretending otherwise would be the most expensive lie on the
 * portal - a landlord who believes a tenancy is agreed and stops answering the
 * phone. So the record is ours, the agent is emailed, and the screen says so
 * in those words.
 *
 * ── Append-only ────────────────────────────────────────────────────────────
 *
 * Changing your mind about which applicant you want is an ordinary thing to
 * do, and the agent needs to SEE that it happened rather than find yesterday's
 * row quietly overwritten. Every press is a row; the newest is the one that
 * counts, and the rest are how the decision was reached.
 */

export interface OfferApproval {
  id: string;
  applicationId: string;
  amount: string;
  applicants: string;
  property: string;
  approvedAt: string;
}

type Row = {
  id: string;
  application_id: string;
  amount: string;
  applicants: string;
  property: string;
  approved_at: Date | string;
};

const shape = (r: Row): OfferApproval => ({
  id: r.id,
  applicationId: r.application_id,
  amount: r.amount,
  applicants: r.applicants,
  property: r.property,
  approvedAt: new Date(r.approved_at).toISOString(),
});

/**
 * The one that stands, or null. Newest wins - see the note above about
 * changing your mind.
 */
export async function currentApproval(accountId: string): Promise<OfferApproval | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, application_id, amount, applicants, property, approved_at
       FROM os_landlord_offer_approvals
      WHERE account_id = $1
      ORDER BY approved_at DESC
      LIMIT 1`,
    [accountId]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function recordApproval(a: {
  accountId: string;
  appraisalId: string | null;
  applicationId: string;
  amount: string;
  applicants: string;
  property: string;
}): Promise<OfferApproval> {
  const rows = await q<Row>(
    `INSERT INTO os_landlord_offer_approvals
       (id, account_id, appraisal_id, application_id, amount, applicants, property)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, application_id, amount, applicants, property, approved_at`,
    [uid(), a.accountId, a.appraisalId, a.applicationId, a.amount, a.applicants, a.property]
  );
  return shape(rows[0]);
}

export async function markApprovalEmailed(id: string, error: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `UPDATE os_landlord_offer_approvals
        SET emailed_at = CASE WHEN $2 = '' THEN NOW() ELSE emailed_at END, email_error = $2
      WHERE id = $1`,
    [id, error]
  );
}
