import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { SERVICE_LEVELS } from "@/lib/market-appraisal";
import { presentationsFor } from "@/lib/present-store";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { startVerification } from "@/lib/verification";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { publicFromAddress, resendSendUnlocked, sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";
import { isInternalAddress } from "@/lib/email-policy";
import { markTermsSent } from "@/lib/appraisal-store";

/**
 * THE ONE SEND (Susan, 14 Sep 2026).
 *
 * "The landlord then gets one send: the post-appraisal presentation, the
 * pre-signed documents and the contract together." Before this, Send on
 * Prepare and send asked DocuSeal to email its own invite - DocuSeal's name and
 * layout, the contract and nothing else - and the presentation went on its own
 * through REX. Two emails from two senders about one decision.
 *
 * Now it is one email from the agent on our public sender (the catalogue's
 * landlord-contract-pack): a button to the presentation, which opens without
 * signing in, and a button that signs them into their property file, where the
 * contract waits under the deck. DocuSeal still holds the signature and its
 * audit trail; it just no longer does the emailing.
 *
 * ── Sent, and again ──────────────────────────────────────────────────────
 *
 * DocuSeal's sent_at never moves now, so the file's "sent to them 3 days ago"
 * reads from here: os_case_state kind 'contract-send', keyed by the appraisal.
 * A reminder is the same email with a fresh sign-in link - the old link may
 * already be spent, and a reminder whose button says "that link isn't valid"
 * is worse than no reminder.
 */

export class ContractSendRefused extends Error {}

export interface ContractSendRecord {
  firstSentAt: string;
  lastSentAt: string;
  count: number;
  to: string;
}

const KIND = "contract-send";

export async function contractSendRecord(appraisalId: string): Promise<ContractSendRecord | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: ContractSendRecord }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, appraisalId]
  ).catch(() => []);
  const p = rows[0]?.payload;
  return p && p.lastSentAt ? p : null;
}

/** Can this email actually leave from here, to this address? The button says so before it is pressed. */
export async function contractSendReady(to: string | null | undefined): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || !publicFromAddress() || !resendSendUnlocked()) return false;
  if (to && isInternalAddress(to)) return true;
  return switchOn("customer_email");
}

function money(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export async function sendContractPack(p: {
  ma: MarketAppraisal;
  me: OsUser;
  origin: string;
}): Promise<{ again: boolean; to: string }> {
  const { ma, me, origin } = p;
  const to = (ma.landlordEmail ?? "").trim().toLowerCase();
  if (!to.includes("@")) throw new ContractSendRefused(`No email address on ${ma.landlord}. Add one to their contact first.`);
  if (ma.valuation == null) throw new ContractSendRefused("Record the valuation first - the presentation and the contract both state it.");

  /* The deck, under both references - see the send page for why. */
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const decks = (await Promise.all(refs.map((r) => presentationsFor(r)))).flat();
  const post = decks.filter((d) => d.kind === "post-appraisal").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!post) throw new ContractSendRefused("There is no post-appraisal presentation on this file yet. Build it first - it goes in the same email.");

  /* Their way in. The portal recognises a landlord by an appraisal carrying
     their email, so this appraisal is enough. */
  const match = await landlordByEmail(to);
  if (!match) throw new ContractSendRefused(`${ma.landlord}'s property file could not be opened, so there is nowhere for the contract to wait.`);
  await upsertLandlordAccount(match);
  const { token } = await startVerification(to, "landlord");

  const service = SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel)?.label ?? "the service we discussed";
  const { subject, html } = renderTleEmail("landlord-contract-pack", {
    firstName: ma.landlord.trim().split(/\s+/)[0] || "there",
    address: [ma.address, ma.postcode].filter((x) => x && !ma.address.includes(x)).join(", ") || ma.address,
    rent: money(ma.valuation),
    serviceLevel: service,
    agentName: me.name || ma.agent || "Your agent",
    deckLink: `${origin}/present/${post.token}`,
    link: `${origin}/landlord/enter?token=${encodeURIComponent(token)}`,
  });

  await sendEmail({ to, subject, html, audience: "customer", replyTo: me.email || undefined });

  const before = await contractSendRecord(ma.id);
  const now = new Date().toISOString();
  const record: ContractSendRecord = {
    firstSentAt: before?.firstSentAt ?? now,
    lastSentAt: now,
    count: (before?.count ?? 0) + 1,
    to,
  };
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KIND, ma.id, JSON.stringify(record), me.email]
  ).catch(() => null);
  await markTermsSent(ma.id);
  return { again: Boolean(before), to };
}
