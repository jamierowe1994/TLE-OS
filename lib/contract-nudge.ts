import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";
import { contractSendRecord } from "@/lib/contract-send";
import { signedFor } from "@/lib/signed-documents";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { startVerification } from "@/lib/verification";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { recipientFor } from "@/lib/agent-recipient";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * NUDGING A LANDLORD TO SIGN (James, 17 Sep 2026).
 *
 * "Give the agent the ability to send a nudge, which will send an email out
 * reminding them to sign the contract again. That should then automate, and
 * we'll have a link to it. It'll open straight into the landlord portal,
 * straight into the contracts."
 *
 *   By hand   Nudge to sign on the appraisal (components/appraisal/TermsCard).
 *   On its own two, five and nine days after the terms first went, from the
 *             scheduled-sends cron, 9am to 7pm UK time, never twice inside a
 *             day - a hand nudge this morning holds back this afternoon's.
 *   Stops     the moment the contract is signed, or the file is won or lost.
 *
 * The button signs them in (single use, 24 hours) and lands on their file
 * with the contract already open (/landlord?p=a:<id>&sign=1, see SignTile).
 *
 * Kept in os_case_state 'contract-nudge', keyed by the appraisal.
 */

const KIND = "contract-nudge";
export const NUDGE_DAYS = [2, 5, 9];

export class NudgeRefused extends Error {}

export interface NudgeRecord {
  count: number;
  autoCount: number;
  lastAt: string | null;
  lastBy: string | null;
}

export async function nudgeRecord(appraisalId: string): Promise<NudgeRecord | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: NudgeRecord }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [KIND, appraisalId]).catch(() => []);
  return rows[0]?.payload ?? null;
}

/** When the next automatic one goes, or null when none will. */
export function nextAutoNudge(firstSentAt: string, rec: NudgeRecord | null): Date | null {
  const n = rec?.autoCount ?? 0;
  if (n >= NUDGE_DAYS.length) return null;
  return new Date(new Date(firstSentAt).getTime() + NUDGE_DAYS[n] * 86400000);
}

export async function sendContractNudge(p: {
  ma: MarketAppraisal;
  origin: string;
  by: string;
  auto?: boolean;
}): Promise<{ to: string; count: number }> {
  const { ma, origin } = p;
  const to = (ma.landlordEmail ?? "").trim().toLowerCase();
  if (!to.includes("@")) throw new NudgeRefused(`No email address on ${ma.landlord}.`);
  const sent = await contractSendRecord(ma.id);
  if (!sent) throw new NudgeRefused("The contract hasn't been sent to them yet, so there is nothing to nudge. Send it from Prepare and send first.");
  if ((await signedFor(ma.id)).some((r) => r.completed_at)) throw new NudgeRefused(`${ma.landlord} has already signed.`);

  const match = await landlordByEmail(to);
  if (!match) throw new NudgeRefused(`${ma.landlord}'s property file could not be opened.`);
  await upsertLandlordAccount(match);
  const { token } = await startVerification(to, "landlord");
  const agent = await recipientFor(ma.agent, { email: "", name: ma.agent ?? "" });
  const agentFirst = (agent.name || ma.agent || "your agent").split(/\s+/)[0];

  const next = `/landlord?p=a:${ma.id}&sign=1`;
  const { subject, html } = renderTleEmail("landlord-contract-nudge", {
    firstName: ma.landlord.trim().split(/\s+/)[0] || "there",
    address: ma.address.split(",")[0].trim() || ma.address,
    agentFirst,
    link: `${origin.replace(/\/+$/, "")}/landlord/enter?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`,
  });
  await sendEmail({ to, subject, html, audience: "customer", replyTo: agent.email || undefined });

  const before = await nudgeRecord(ma.id);
  const rec: NudgeRecord = {
    count: (before?.count ?? 0) + 1,
    autoCount: (before?.autoCount ?? 0) + (p.auto ? 1 : 0),
    lastAt: new Date().toISOString(),
    lastBy: p.by,
  };
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KIND, ma.id, JSON.stringify(rec), p.by]
  ).catch(() => null);
  return { to, count: rec.count };
}

function londonHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** The automatic ones. Run every few minutes; sends only what is due. */
export async function runContractNudges(origin: string, now = new Date()): Promise<{ sent: number; failed: string[] }> {
  const out = { sent: 0, failed: [] as string[] };
  if (!hasDb()) return out;
  const hour = londonHour(now);
  if (hour < 9 || hour >= 19) return out;
  const rows = await q<{ record_id: string }>(
    `SELECT record_id FROM os_case_state WHERE kind = 'contract-send' AND updated_at > NOW() - INTERVAL '30 days'`
  ).catch(() => []);
  for (const { record_id: id } of rows) {
    try {
      const sent = await contractSendRecord(id);
      if (!sent) continue;
      const rec = await nudgeRecord(id);
      const due = nextAutoNudge(sent.firstSentAt, rec);
      if (!due || now < due) continue;
      /* Never two in a day, whoever sent the last one. */
      if (rec?.lastAt && now.getTime() - new Date(rec.lastAt).getTime() < 20 * 3600000) continue;
      if ((await signedFor(id)).some((r) => r.completed_at)) continue;
      const ma = await getAppraisal(id);
      if (!ma || ma.stage === "won" || ma.stage === "lost") continue;
      await sendContractNudge({ ma, origin, by: "automatic", auto: true });
      out.sent++;
    } catch (e) {
      out.failed.push(`${id}: ${e instanceof Error ? e.message : "nudge failed"}`);
    }
  }
  return out;
}

/** How many times the landlord has opened their presentation and their contract, in their own file. */
export async function viewCounts(appraisalId: string, deckToken: string | null): Promise<{ presentation: number; contract: number }> {
  if (!hasDb()) return { presentation: 0, contract: 0 };
  const rows = await q<{ kind: string; payload: { count?: number } }>(
    `SELECT kind, payload FROM os_case_state
      WHERE (kind = 'landlord-contract-views' AND record_id = $1)
         OR (kind = 'landlord-deck-views' AND record_id = $2)`,
    [appraisalId, deckToken ?? ""]
  ).catch(() => []);
  const n = (k: string) => Number(rows.find((r) => r.kind === k)?.payload?.count ?? 0);
  return { presentation: n("landlord-deck-views"), contract: n("landlord-contract-views") };
}
