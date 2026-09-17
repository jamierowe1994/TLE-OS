import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";
import { confirmBodyFor, confirmSubjectFor, icsFor, type AppraisalInvite } from "@/lib/appraisal-email";
import { renderPlain } from "@/lib/campaign-mail";
import { sendAsAgent } from "@/lib/send-as-agent";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import type { OsUser } from "@/lib/users";
import { cleanEmailHtml, hasMoved, isRepeat, lastSent, recordSent, sentWords } from "@/lib/confirmations";

/**
 * The booking confirmation for an appraisal.
 *
 * NO LONGER SENT ON BOOKING (17 Sep 2026). The agent sees it, can rewrite it,
 * and sends it (lib/confirmations, components/ConfirmSheet). What follows is
 * the history of why it was wired at all.
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
  /** Refused because this exact appointment was already confirmed. */
  alreadySent?: boolean;
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

/** "Sunday 20 September at 1:30pm" - how a person says it, in UK time. */
function londonWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "").toLowerCase();
  return `${day} at ${time}`;
}

export function inviteFor(ma: MarketAppraisal, agent: { name: string; phone: string }, minutes = 45): AppraisalInvite {
  return {
    landlordName: ma.landlord,
    address: [ma.address, ma.postcode].filter((s) => s && !ma.address.includes(s)).join(", ") || ma.address,
    whenPretty: ma.appointmentAt
      ? londonWhen(ma.appointmentAt)
      : "",
    startsAt: ma.appointmentAt,
    minutes,
    agentName: agent.name,
    agentPhone: agent.phone,
  };
}

/** What the agent is shown before the confirmation goes: everything, editable. */
export interface ConfirmationDraft {
  ok: true;
  to: string | null;
  toName: string;
  subject: string;
  html: string;
  /** Why nothing can go, when nothing can. */
  blocked?: string;
  /** The same appointment, at the same time, has already been confirmed. */
  alreadySent?: { at: string; to: string; subject: string };
  /** Confirmed before at another time, so this one says it has moved. */
  moved?: { from: string };
  attachment: string | null;
}

const recordKey = (ma: MarketAppraisal) => `appraisal|${ma.id}`;

async function prepare(ma: MarketAppraisal, me: OsUser, minutes?: number, unsaved = false) {
  /* The landlord's address is derived from the contact on read, never stored
     on the appraisal - so read it back. An appointment being booked right now
     (the booker's email column) is not saved yet: its time, place and email
     are the ones on screen, and a record from an earlier booking only
     supplies what was sent before. */
  const stored = await getAppraisal(ma.id).catch(() => null);
  const full: MarketAppraisal = unsaved
    ? { ...(stored ?? ma), landlord: ma.landlord, address: ma.address, postcode: ma.postcode, appointmentAt: ma.appointmentAt, landlordEmail: ma.landlordEmail || stored?.landlordEmail || null }
    : stored ?? ma;
  const invite = inviteFor(full, { name: me.name || "The Letting Experts", phone: await phoneOf(me.id) }, minutes && minutes > 0 ? minutes : 45);
  const prev = await lastSent(recordKey(full));
  const moved = hasMoved(prev, full.appointmentAt);
  let subject = confirmSubjectFor(invite);
  let text = confirmBodyFor(invite);
  if (moved) {
    /* A second "Confirmed" with a different time and nothing else reads as
       two appointments. Say it moved. Wording for James to approve. */
    subject = subject.replace(/^Confirmed - /, "Moved - ");
    text = text.replace("Thanks for booking in. Putting this in writing so you have it:", "Your market appraisal has moved. Here are the new details, so you have them in writing:");
  }
  return { full, invite, prev, moved, subject, text };
}

export async function draftBookingConfirmation(input: { ma: MarketAppraisal; me: OsUser; minutes?: number; unsaved?: boolean }): Promise<ConfirmationDraft> {
  const { full, prev, moved, subject, text } = await prepare(input.ma, input.me, input.minutes, input.unsaved);
  const to = (full.landlordEmail ?? "").trim();
  return {
    ok: true,
    to: to.includes("@") ? to : null,
    toName: full.landlord,
    subject,
    html: renderPlain(subject, text).html,
    blocked: !full.appointmentAt
      ? "There is no time on this appraisal, so there is nothing to confirm yet."
      : !to.includes("@")
        ? "The landlord has no email address on the file, so this cannot go. Ring them, or add their email."
        : undefined,
    alreadySent: prev && isRepeat(prev, full.appointmentAt) ? { at: prev.sentAt, to: prev.to, subject: prev.subject } : undefined,
    moved: moved && prev?.startsAt ? { from: prev.startsAt } : undefined,
    attachment: full.appointmentAt ? "market-appraisal.ics" : null,
  };
}

/**
 * Send it. With `subject` and `html` it sends the agent's edit; without, the
 * template as it stands (lib/test-kits). The same appointment at the same time
 * is refused unless `again` says the agent means it.
 */
export async function sendBookingConfirmation(input: {
  ma: MarketAppraisal;
  me: OsUser;
  subject?: string;
  html?: string;
  again?: boolean;
  /** How long was booked, for the calendar file. */
  minutes?: number;
}): Promise<ConfirmationResult> {
  const { me } = input;
  const { full, invite, prev, subject: templSubject, text } = await prepare(input.ma, me, input.minutes);
  if (!full.appointmentAt) return { sent: false, reason: "No time booked yet, so nothing to confirm." };
  const to = (full.landlordEmail ?? "").trim();
  if (!to.includes("@")) return { sent: false, reason: "The landlord has no email address on their record." };
  if (isRepeat(prev, full.appointmentAt) && !input.again) {
    return { sent: false, to, reason: `Already sent to ${prev!.to} on ${sentWords(prev!.sentAt)}.`, alreadySent: true };
  }

  const subject = (input.subject ?? "").trim() || templSubject;
  const html = input.html ? cleanEmailHtml(input.html) : renderPlain(subject, text).html;
  const ics = icsFor(invite, new Date().toISOString());

  /* From the agent's own Outlook where that is armed, our sender otherwise:
     the same road as the appraisal emails that follow it, so the landlord's
     reply reaches the person who is turning up (lib/send-as-agent). */
  const out = await sendAsAgent({
    me,
    to,
    toName: full.landlord,
    subject,
    html,
    attachments: ics
      ? [{ filename: "market-appraisal.ics", content: Buffer.from(ics, "utf8").toString("base64"), contentType: "text/calendar" }]
      : undefined,
  });
  if (!out.sent) return { sent: false, to, reason: out.detail };

  await recordSent(recordKey(full), { sentAt: new Date().toISOString(), startsAt: full.appointmentAt, to, subject, by: me.email });
  await markConfirmed(full.leadId, me.email);
  return { sent: true, to };
}
