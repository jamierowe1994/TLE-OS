import "server-only";
import type { OsUser } from "@/lib/users";
import { findPassportByEmail, getPassport } from "@/lib/passport";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { sendAsAgent } from "@/lib/send-as-agent";
import { renderPlain } from "@/lib/campaign-mail";
import { icsFile } from "@/lib/outlook-calendar";
import { calendarLinks, LINK } from "@/lib/calendar-links";
import { cleanEmailHtml, isRepeat, lastSent, recordSent, sentWords } from "@/lib/confirmations";

/**
 * THE VIEWING CONFIRMATIONS ARE OURS (James, 15 Sep 2026).
 *
 * "We don't want REX sending the confirmations. We want to send the
 * confirmations ... to both the tenant and to the agent." REX's are never
 * asked for. Since 17 Sep 2026 booking sends nothing: the agent sees the
 * applicant's email, can rewrite it, and sends it (lib/confirmations). Then:
 *
 *   the applicant   the catalogue's Viewing Booked email (tenant-viewing-booked)
 *                   with the calendar buttons. No passport in it: since 1 Oct
 *                   2026 (James) the passport only ever goes when the agent
 *                   presses Send passport, so a booking never mints one or
 *                   asks for one. It thanks them if theirs is already done. From
 *                   the agent's OWN Outlook where that is armed and connected
 *                   so the reply comes back to them (lib/send-as-agent), and
 *                   from our sender with their address to reply to otherwise
 *   the agent       a short note of what they booked, from the OS sender, with
 *                   the calendar file only when their Outlook did not take it
 *
 * Texts come later, once James has set SMS up. The landlord is told through
 * their portal, not by email.
 *
 * Each send answers in words and neither can fail the booking.
 */

export interface ConfirmOutcome {
  applicant: { sent: boolean; detail: string; alreadySent?: boolean };
  agent: { sent: boolean; detail: string };
}

export interface ViewingBooking {
  leadId: string;
  listingId: string | null;
  applicant: { name: string; email: string | null };
  address: string;
  startsAt: string;
  minutes: number;
  /** Nobody from us is going: the email must not promise them an agent. */
  unaccompanied?: boolean;
}

export interface ViewingDraft {
  ok: true;
  to: string | null;
  toName: string;
  subject: string;
  html: string;
  blocked?: string;
  alreadySent?: { at: string; to: string; subject: string };
  attachment: string | null;
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const viewingKey = (b: ViewingBooking) => `viewing|${b.leadId}|${b.listingId ?? "-"}|${new Date(b.startsAt).toISOString()}`;

function whenOf(startsAt: string) {
  return new Date(startsAt).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
}

function icsFor(b: ViewingBooking, agentName: string) {
  const ics = icsFile({
    uid: `viewing-${new Date(b.startsAt).getTime()}-${b.address.replace(/\W+/g, "").slice(0, 40)}`,
    summary: `Viewing - ${b.address}`,
    description: `With ${agentName}, The Letting Experts.`,
    location: b.address,
    startsAt: b.startsAt,
    minutes: b.minutes,
  });
  return { filename: "viewing.ics", content: Buffer.from(ics, "utf8").toString("base64"), contentType: "text/calendar" };
}

/**
 * Has the applicant already filled their passport in? Read only: a booking
 * never creates a passport (James, 1 Oct 2026: the agent decides when it
 * goes, by pressing Send passport).
 */
async function passportDone(to: string, me: OsUser): Promise<boolean> {
  if (!emailOk(to)) return false;
  const existing = await findPassportByEmail(to, me.id).catch(() => null);
  if (!existing) return false;
  const p = await getPassport(existing.token).catch(() => null);
  return Boolean(p?.submittedAt);
}

function render(b: ViewingBooking, me: OsUser, origin: string, done: boolean) {
  const agentName = me.name || "Your agent";
  /* Add to my calendar, in the body where it is seen, rather than a file
     attached that people miss (James, 17 Sep 2026). */
  const cal = calendarLinks({
    title: `Viewing - ${b.address}`,
    startsAt: b.startsAt,
    minutes: b.minutes,
    location: b.address,
    details: b.unaccompanied ? "Unaccompanied viewing, The Letting Experts." : `With ${agentName}, The Letting Experts.`,
    uid: `viewing-${new Date(b.startsAt).getTime()}-${b.address.replace(/\W+/g, "").slice(0, 40)}`,
  }, origin);
  const extra = {
    after: "tp2",
    blocks: [
      { type: "button", id: "tpcal", text: "Add to my calendar", url: cal.ics, color: "", align: "left", pad: { t: 16, r: 22, b: 16, l: 22 } },
      { type: "text", id: "tpcal2", text: `Using Google or Outlook on the web? <a href="${cal.google}" style="${LINK}">Add it to Google Calendar</a> or <a href="${cal.outlook}" style="${LINK}">Outlook</a>.`, bg: "" },
    ],
  };
  return renderTleEmail("tenant-viewing-booked", {
    firstName: b.applicant.name.trim().split(/\s+/)[0] || "there",
    address: b.address || "the property",
    whenPretty: whenOf(b.startsAt),
    agentName,
    meetLine: b.unaccompanied
      ? `This is an unaccompanied viewing, so nobody from us will be there - ${agentName} will send you how to get in.`
      : `${agentName} will meet you there.`,
    nextLine: done
      ? `Thank you for completing your tenant passport. If this is the one, tell ${agentName} and your application can go in the same day.`
      : `If this is the one, tell ${agentName} and we will get your application started.`,
  }, extra);
}

/** What the agent sees before the applicant is told. */
export async function draftViewingConfirmation(b: ViewingBooking, me: OsUser, origin: string): Promise<ViewingDraft> {
  const to = (b.applicant.email ?? "").trim();
  const prev = await lastSent(viewingKey(b));
  const { subject, html } = render(b, me, origin, await passportDone(to, me));
  return {
    ok: true,
    to: emailOk(to) ? to : null,
    toName: b.applicant.name,
    subject,
    html,
    blocked: emailOk(to) ? undefined : `${b.applicant.name || "The applicant"} has no email address on their record, so this cannot go. Ring them.`,
    alreadySent: prev && isRepeat(prev, b.startsAt) ? { at: prev.sentAt, to: prev.to, subject: prev.subject } : undefined,
    attachment: null,
  };
}

/**
 * Send the applicant's confirmation (the agent's edit when given), then the
 * agent's own copy. Refuses the same viewing twice unless `again`.
 */
export async function sendViewingConfirmation(p: {
  me: OsUser;
  booking: ViewingBooking;
  origin: string;
  /** True when the agent's own Outlook already has it, so their note needs no file. */
  inAgentsCalendar: boolean;
  subject?: string;
  html?: string;
  again?: boolean;
}): Promise<ConfirmOutcome> {
  const b = p.booking;
  const agentName = p.me.name || "Your agent";
  const whenPretty = whenOf(b.startsAt);
  const attachment = icsFor(b, agentName);
  const out: ConfirmOutcome = {
    applicant: { sent: false, detail: "" },
    agent: { sent: false, detail: "" },
  };

  const to = (b.applicant.email ?? "").trim();
  const key = viewingKey(b);
  const prev = await lastSent(key);
  if (!emailOk(to)) {
    out.applicant.detail = `${b.applicant.name || "The applicant"} has no email address on their record, so nobody could be told. Ring them.`;
    return out;
  }
  if (isRepeat(prev, b.startsAt) && !p.again) {
    out.applicant = { sent: false, alreadySent: true, detail: `Already sent to ${prev!.to} on ${sentWords(prev!.sentAt)}.` };
    return out;
  }
  try {
    const templ = render(b, p.me, p.origin, await passportDone(to, p.me));
    const subject = (p.subject ?? "").trim() || templ.subject;
    const html = p.html ? cleanEmailHtml(p.html) : templ.html;
    const r = await sendAsAgent({ me: p.me, to, toName: b.applicant.name, subject, html });
    if (r.sent) {
      await recordSent(key, { sentAt: new Date().toISOString(), startsAt: b.startsAt, to, subject, by: p.me.email });
    }
    out.applicant = { sent: r.sent, detail: r.detail };
  } catch (e) {
    out.applicant.detail = `The applicant's confirmation did not send: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}.`;
  }
  if (!out.applicant.sent) return out;

  try {
    const subject = `Viewing booked: ${b.address}, ${whenPretty}`;
    const text = [
      `You sent a viewing confirmation.`,
      ``,
      `Where: ${b.address}`,
      `When: ${whenPretty}`,
      `Who: ${b.applicant.name} (${to})`,
      ...(b.unaccompanied ? ["Unaccompanied - nobody from us is going. Send them how to get in."] : []),
      ``,
      p.inAgentsCalendar ? "It is in your Outlook calendar." : "It is NOT in your Outlook calendar - the file attached adds it.",
    ].join("\n");
    await sendEmail({
      to: p.me.email,
      subject,
      html: renderPlain(subject, text).html,
      text,
      ...(p.inAgentsCalendar ? {} : { attachments: [attachment] }),
    });
    out.agent = { sent: true, detail: "Your copy is in your inbox." };
  } catch (e) {
    out.agent.detail = `Your copy did not send: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}.`;
  }
  return out;
}
