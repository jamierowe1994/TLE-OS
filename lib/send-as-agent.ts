import "server-only";
import type { OsUser } from "@/lib/users";
import { MailboxNotConnected, msConnectionFor, msSendMail } from "@/lib/microsoft";
import { archiveSentCopy, sendEmail } from "@/lib/resend";
import { isInternalAddress } from "@/lib/email-policy";
import { sendingLocked, switchOn } from "@/lib/switches";

/**
 * FROM THE AGENT, NOT FROM THE SYSTEM (James, 16 Sep 2026 - scoped pilot i078).
 *
 * A viewing confirmation is one half of a conversation. Sent on our own
 * Letting Experts address, the tenant's "sorry, can we make it half four?"
 * goes to a shared inbox with a reply-to header on it, and the agent finds out
 * when somebody forwards it. Sent from the agent's own Outlook, the reply lands
 * in their inbox, threads onto the message in their Sent Items, and shows on
 * the lead beside everything else (components/MailThread).
 *
 * ── The same two brakes, whichever road it takes ──────────────────────────
 *
 * Microsoft Graph is subject to neither of Resend's locks, so this applies them
 * itself rather than inheriting a loophole:
 *
 *   "Send from the agent's own   arms the mailbox road at all. Off, or the
 *   Outlook" (assistant_email)  mailbox not connected, and it goes on our
 *                               sender exactly as it did before - so shipping
 *                               this changes nothing until somebody arms it.
 *   "Email to landlords and     decides whether a REAL customer may be
 *   tenants" (customer_email)   written to, the same test lib/resend makes,
 *                               with the same exception for one of our own
 *                               addresses so Admin, Testing still works.
 *
 * SENDING_LOCKED reaches both, because both go through switchOn().
 *
 * ── It falls back rather than failing ────────────────────────────────────
 *
 * A mailbox that is not connected, or that Microsoft refuses, must not mean a
 * tenant is never told where to turn up. So it drops to our own sender and says
 * which road it took, in a sentence for the agent's screen.
 *
 * Not wired here yet: works orders and inspections (lib/works-emails,
 * lib/inspection-emails) already choose the mailbox this way but without the
 * customer brake. Left alone deliberately - tightening a contractor send nobody
 * asked about, mid-pilot, is how a repair stops being reported.
 */

export interface AgentSend {
  me: OsUser;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /** Base64, as Resend wants it. A viewing's calendar file. */
  attachments?: { filename: string; content: string; contentType?: string }[];
}

export interface AgentSendResult {
  sent: boolean;
  /** "mailbox" their own Outlook, "ours" the Letting Experts sender. */
  via: "mailbox" | "ours" | null;
  /** One sentence, written for the agent reading the screen. */
  detail: string;
}

export async function sendAsAgent(p: AgentSend): Promise<AgentSendResult> {
  const to = p.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, via: null, detail: "There is no usable email address on their record, so nobody was written to." };
  }

  /* Our own address is a test (Admin, Testing): the tester stands in for the
     tenant, so it goes whether or not customer email is armed. It cannot reach
     a customer - the address is ours - and SENDING_LOCKED still stops it. */
  const toStaff = isInternalAddress(to) && !sendingLocked();
  if (!toStaff && !(await switchOn("customer_email"))) {
    return {
      sent: false,
      via: null,
      detail: "Email to landlords and tenants is switched off on Admin, Switches, so nothing was sent.",
    };
  }

  if (await switchOn("assistant_email")) {
    try {
      const conn = await msConnectionFor(p.me.id).catch(() => null);
      if (conn?.connected) {
        await msSendMail(p.me.id, {
          to: { email: to, name: p.toName },
          subject: p.subject,
          body: p.html,
          rexUserId: p.me.rexUserId,
          attachments: p.attachments,
        });
        await archiveSentCopy(to, p.subject, p.html).catch(() => null);
        return { sent: true, via: "mailbox", detail: `Sent to ${to} from your Outlook, so their reply comes back to you.` };
      }
    } catch (e) {
      /* Their mailbox refused, or the token has gone stale. Say nothing here:
         the fall-back below is about to send it, and one email must not
         produce two verdicts on the same screen. */
      if (!(e instanceof MailboxNotConnected)) {
        /* Nothing to do but carry on - the fall-back is the point. */
      }
    }
  }

  try {
    await sendEmail({ to, subject: p.subject, html: p.html, audience: "customer", replyTo: p.me.email || undefined, attachments: p.attachments });
    return { sent: true, via: "ours", detail: `Sent to ${to} from The Letting Experts, with your address to reply to.` };
  } catch (e) {
    return {
      sent: false,
      via: null,
      detail: `It did not send: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}. Tell them yourself.`,
    };
  }
}
