import { isInternalAddress } from "@/lib/email-policy";

/**
 * NOBODY OUTSIDE HEARS FROM JAMES (29 Oct 2026).
 *
 * James Rowe builds the OS. He is an owner here and nobody's letting agent,
 * yet on 28 Oct a contractor of Sean McMahon's got an "All done?" from James's
 * Recruitment Experts mailbox, signed by him: lib/works-agent fell back to
 * "the first owner" for a job a tenant had raised. That one is fixed, but
 * several other timers send as whoever set something up, so this is checked
 * at every door a person's email leaves by - their own Outlook
 * (lib/microsoft msSendMail), sendAsAgent, the works and inspection senders,
 * and Resend's reply-to. Whatever picked the sender, a landlord, tenant or
 * contractor never hears from his mailbox, in his name or with his reply-to.
 *
 * Our own addresses still get it, and so does his own test inbox: that is how
 * he tries things.
 */
const NOT_A_SENDER = ["james@therecruitmentexperts.co.uk"];
const THEIR_OWN_TEST_INBOXES = ["jamie.rowe.1994@hotmail.com"];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export class NotASender extends Error {}

/** One of the people who never write to a customer or contractor. */
export function neverSendsOut(email: string | null | undefined): boolean {
  return NOT_A_SENDER.includes(norm(email));
}

/** Why this person may not write to these addresses, or null when they may. */
export function refusedSender(sender: string | null | undefined, recipients: (string | null | undefined)[]): string | null {
  if (!neverSendsOut(sender)) return null;
  const outside = recipients.map(norm).filter((a) => a && !isInternalAddress(a) && !THEIR_OWN_TEST_INBOXES.includes(a));
  if (!outside.length) return null;
  return `Not sent: ${outside.join(", ")} would have heard from James Rowe, who doesn't email customers or contractors. The agent on the file needs to send it`;
}

/** Throws NotASender when the send would go out as somebody who never writes to customers. */
export function assertMaySendAs(sender: string | null | undefined, recipients: (string | null | undefined)[]): void {
  const why = refusedSender(sender, recipients);
  if (why) throw new NotASender(`${why}.`);
}
