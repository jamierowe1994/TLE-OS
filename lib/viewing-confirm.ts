import "server-only";
import type { OsUser } from "@/lib/users";
import { createPassport, findPassportByEmail, markInvited } from "@/lib/passport";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { renderPlain } from "@/lib/campaign-mail";
import { icsFile } from "@/lib/outlook-calendar";

/**
 * THE VIEWING CONFIRMATIONS ARE OURS (James, 15 Sep 2026).
 *
 * "We don't want REX sending the confirmations. We want to send the
 * confirmations ... to both the tenant and to the agent." So booking a viewing
 * sends two emails from the OS, and REX's are never asked for:
 *
 *   the applicant   the catalogue's Viewing Booked email (tenant-passport-invite)
 *                   on the public sender, reply-to the agent, with the passport
 *                   link and a calendar file attached
 *   the agent       a short note of what they booked, from the OS sender, with
 *                   the calendar file only when their Outlook did not take it
 *
 * Texts come later, once James has set SMS up. The landlord is told through
 * their portal, not by email.
 *
 * Each send answers in words and neither can fail the booking.
 */

export interface ConfirmOutcome {
  applicant: { sent: boolean; detail: string };
  agent: { sent: boolean; detail: string };
}

export async function sendViewingConfirmations(p: {
  me: OsUser;
  applicant: { name: string; email: string | null };
  address: string;
  startsAt: string;
  minutes: number;
  origin: string;
  /** True when the agent's own Outlook already has it, so their note needs no file. */
  inAgentsCalendar: boolean;
  /** Nobody from us is going: the email must not promise them an agent. */
  unaccompanied?: boolean;
}): Promise<ConfirmOutcome> {
  const whenPretty = new Date(p.startsAt).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
  const agentName = p.me.name || "Your agent";
  const ics = icsFile({
    uid: `viewing-${new Date(p.startsAt).getTime()}-${p.address.replace(/\W+/g, "").slice(0, 40)}`,
    summary: `Viewing - ${p.address}`,
    description: `With ${agentName}, The Letting Experts.`,
    location: p.address,
    startsAt: p.startsAt,
    minutes: p.minutes,
  });
  const attachment = { filename: "viewing.ics", content: Buffer.from(ics, "utf8").toString("base64") };

  const out: ConfirmOutcome = {
    applicant: { sent: false, detail: "" },
    agent: { sent: false, detail: "" },
  };

  const to = (p.applicant.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    out.applicant.detail = `${p.applicant.name || "The applicant"} has no email address on their record, so nobody could be told. Ring them.`;
  } else {
    try {
      const existing = await findPassportByEmail(to, p.me.id).catch(() => null);
      const token = existing?.token ?? (await createPassport({ name: p.applicant.name, email: to, agentId: p.me.id })).token;
      const { subject, html } = renderTleEmail("tenant-passport-invite", {
        firstName: p.applicant.name.trim().split(/\s+/)[0] || "there",
        address: p.address || "the property",
        whenPretty,
        agentName,
        meetLine: p.unaccompanied
          ? `This is an unaccompanied viewing, so nobody from us will be there - ${agentName} will send you how to get in.`
          : `${agentName} will meet you there.`,
        link: `${p.origin}/tenant/passport/${token}`,
      });
      await sendEmail({ to, subject, html, audience: "customer", replyTo: p.me.email || undefined, attachments: [attachment] });
      await markInvited(token, agentName).catch(() => null);
      out.applicant = { sent: true, detail: `Confirmation sent to ${to}.` };
    } catch (e) {
      out.applicant.detail = `The applicant's confirmation did not send: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}.`;
    }
  }

  try {
    const subject = `Viewing booked: ${p.address}, ${whenPretty}`;
    const text = [
      `You booked a viewing.`,
      ``,
      `Where: ${p.address}`,
      `When: ${whenPretty}`,
      `Who: ${p.applicant.name}${to ? ` (${to})` : ""}`,
      ...(p.unaccompanied ? ["Unaccompanied - nobody from us is going. Send them how to get in."] : []),
      ``,
      p.inAgentsCalendar ? "It is in your Outlook calendar." : "It is NOT in your Outlook calendar - the file attached adds it.",
      out.applicant.sent ? "They have been sent a confirmation." : "They have NOT been sent a confirmation.",
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
