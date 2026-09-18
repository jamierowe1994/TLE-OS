import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";
import { readAnswers } from "@/lib/property-answers-store";
import { allDone, progress } from "@/lib/property-questions";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { startVerification } from "@/lib/verification";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";

/**
 * CHASING THE PROPERTY QUESTIONS (15 Sep 2026).
 *
 * Susan, 14 Sep: the questionnaire "keeps emailing them until it is finished,
 * and the property does not move through the process until it is done". James,
 * 15 Sep: it comes AFTER the contract is signed. So: from the day both
 * signatures are on the contract (os_signed_documents only ever holds a
 * contract everybody has signed), a landlord whose answers are not complete is
 * emailed at two, five and nine days - three times at most - and never again
 * once the last screen is done. The stage gate is in lib/appraisal-stage.
 *
 * Run once a day from os-cron-daily. Every chase is written down against the
 * appraisal (os_case_state 'property-answers-chase'), so a second run on the
 * same day, or a cron that fires twice, sends nothing twice.
 */

const KIND = "property-answers-chase";
/** Days after signing each chase is due. */
export const CHASE_DAYS = [2, 5, 9];
/** Signed longer ago than this and we stop looking: somebody will have rung them. */
const WINDOW_DAYS = 45;

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
function partsLeft(n: number): string {
  const w = WORDS[n] ?? String(n);
  return `${w} short part${n === 1 ? "" : "s"}`;
}

interface ChaseState {
  count: number;
  lastAt: string | null;
}

export interface ChaseOutcome {
  appraisalId: string;
  result: "sent" | "done" | "not-due" | "finished-chasing" | "skipped" | "failed";
  detail?: string;
}

export async function runQuestionsChase(origin: string, now = new Date()): Promise<ChaseOutcome[]> {
  if (!hasDb()) return [];
  const signed = await q<{ appraisal_id: string; signed_at: Date }>(
    `SELECT appraisal_id, MIN(completed_at) AS signed_at
       FROM os_signed_documents
      WHERE completed_at IS NOT NULL AND appraisal_id <> ''
        AND completed_at > NOW() - INTERVAL '${WINDOW_DAYS} days'
      GROUP BY appraisal_id`
  );

  const out: ChaseOutcome[] = [];
  for (const row of signed) {
    const id = row.appraisal_id;
    try {
      const answers = await readAnswers(id);
      if (allDone(answers)) {
        out.push({ appraisalId: id, result: "done" });
        continue;
      }
      const stateRows = await q<{ payload: ChaseState }>(
        `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
        [KIND, id]
      );
      const state: ChaseState = stateRows[0]?.payload ?? { count: 0, lastAt: null };
      if (state.count >= CHASE_DAYS.length) {
        out.push({ appraisalId: id, result: "finished-chasing" });
        continue;
      }
      const due = new Date(new Date(row.signed_at).getTime() + CHASE_DAYS[state.count] * 86400000);
      /* One a day at most, whatever the schedule says - a run that missed two
         days must not fire two chases in one morning. */
      const sameDay = state.lastAt && now.getTime() - new Date(state.lastAt).getTime() < 20 * 3600000;
      if (now < due || sameDay) {
        out.push({ appraisalId: id, result: "not-due", detail: due.toISOString().slice(0, 10) });
        continue;
      }

      const ma = await getAppraisal(id);
      const to = (ma?.landlordEmail ?? "").trim().toLowerCase();
      if (!ma || ma.stage === "lost" || !to.includes("@")) {
        out.push({ appraisalId: id, result: "skipped", detail: !ma ? "no appraisal" : ma.stage === "lost" ? "marked lost" : "no email" });
        continue;
      }

      const match = await landlordByEmail(to);
      if (!match) {
        out.push({ appraisalId: id, result: "skipped", detail: "no landlord account" });
        continue;
      }
      await upsertLandlordAccount(match);
      const { token } = await startVerification(to, "landlord", { keepOthers: true });
      const asked = progress(answers);
      const { subject, html } = renderTleEmail("landlord-questions-chase", {
        firstName: ma.landlord.trim().split(/\s+/)[0] || "there",
        address: [ma.address, ma.postcode].filter((x) => x && !ma.address.includes(x)).join(", ") || ma.address,
        left: partsLeft(asked.of - asked.done),
        leftCap: partsLeft(asked.of - asked.done).replace(/^./, (c) => c.toUpperCase()),
        link: `${origin}/landlord/enter?token=${encodeURIComponent(token)}&next=/landlord/questions`,
      });
      await sendEmail({ to, subject, html, audience: "customer" });

      await q(
        `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, NOW(), 'questions-chase')
         ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [KIND, id, JSON.stringify({ count: state.count + 1, lastAt: now.toISOString() })]
      );
      out.push({ appraisalId: id, result: "sent", detail: `chase ${state.count + 1} of ${CHASE_DAYS.length}` });
    } catch (e) {
      out.push({ appraisalId: id, result: "failed", detail: e instanceof Error ? e.message : "unknown" });
    }
  }
  return out;
}
