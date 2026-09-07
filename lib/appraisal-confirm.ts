import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";
import { confirmBodyFor, confirmSubjectFor, icsFor, type AppraisalInvite } from "@/lib/appraisal-email";
import { renderPlain } from "@/lib/campaign-mail";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import type { OsUser } from "@/lib/users";

/**
 * The booking confirmation, sent the moment an appraisal is booked.
 *
 * James, 6 Sep 2026: the confirmation email and the calendar invite to the
 * landlord "are not connected" - the words and the .ics have existed since
 * August (lib/appraisal-email), and the file page has a Send button, but
 * nothing sent them on booking. Now booking does, on the public sender,
 * with the calendar file attached and the agent as reply-to, so a landlord
 * who says yes on the phone has it in writing before the call is over.
 *
 * ── Best effort, never in the way ─────────────────────────────────────────
 *
 * The booking is already saved when this runs. Whatever stops the email -
 * the customer switch off, no address on the landlord, Resend refusing - is
 * returned as a sentence for the screen, and the appointment stands. The
 * agent can still send it by hand from the file.
 *
 * ── Not through REX ───────────────────────────────────────────────────────
 *
 * The hand-sent version goes through REX's mail merge so it lands on the
 * landlord's timeline there. That path is a REX write and stays behind the
 * allowlist until James's supervised test. This one goes out on Resend,
 * which is unlocked, and is logged in os_sent_emails like every other send.
 */

export interface ConfirmationResult {
  sent: boolean;
  to?: string;
  reason?: string;
}

const PROFILE_KEY = "tle-profile-v1";

/** The agent's phone, from the profile they filled in. Empty when they did not. */
async function phoneOf(userId: string): Promise<string> {
  if (!hasDb()) return "";
  const rows = await q<{ value: { phone?: string } | null }>(
    `SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`,
    [userId, PROFILE_KEY]
  ).catch(() => []);
  return (rows[0]?.value?.phone ?? "").trim();
}

/** Tick "Send the confirmation" on the file, so the agent is not asked to send it twice. */
async function markConfirmed(leadId: string | null, by: string): Promise<void> {
  if (!hasDb() || !leadId) return;
  const now = new Date().toISOString();
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ('appraisal', $1, $2::jsonb, NOW(), $3)
     ON CONFLICT (kind, record_id) DO UPDATE
       SET payload = os_case_state.payload || $2::jsonb, updated_at = NOW(), updated_by = $3`,
    [leadId, JSON.stringify({ confirmationSentAt: now }), by]
  ).catch(() => null);
}

export function inviteFor(ma: MarketAppraisal, agent: { name: string; phone: string }): AppraisalInvite {
  return {
    landlordName: ma.landlord,
    address: [ma.address, ma.postcode].filter((s) => s && !ma.address.includes(s)).join(", ") || ma.address,
    whenPretty: ma.appointmentAt
      ? new Date(ma.appointmentAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
      : "",
    startsAt: ma.appointmentAt,
    minutes: 45,
    agentName: agent.name,
    agentPhone: agent.phone,
  };
}

export async function sendBookingConfirmation(input: { ma: MarketAppraisal; me: OsUser }): Promise<ConfirmationResult> {
  const { ma, me } = input;
  if (!ma.appointmentAt) return { sent: false, reason: "No time booked yet, so nothing to confirm." };

  /* The landlord's address is derived from the contact on read, never stored
     on the appraisal - so read it back. */
  const full = (await getAppraisal(ma.id).catch(() => null)) ?? ma;
  const to = (full.landlordEmail ?? "").trim();
  if (!to.includes("@")) return { sent: false, reason: "The landlord has no email address on their record." };

  const invite = inviteFor(full, { name: me.name || "The Letting Experts", phone: await phoneOf(me.id) });
  const subject = confirmSubjectFor(invite);
  const text = confirmBodyFor(invite);
  const ics = icsFor(invite, new Date().toISOString());

  try {
    await sendEmail({
      to,
      subject,
      html: renderPlain(subject, text).html,
      text,
      audience: "customer",
      replyTo: me.email,
      attachments: ics ? [{ filename: "market-appraisal.ics", content: Buffer.from(ics, "utf8").toString("base64") }] : undefined,
    });
  } catch (e) {
    return { sent: false, to, reason: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "The email did not send." };
  }

  await markConfirmed(full.leadId, me.email);
  return { sent: true, to };
}
