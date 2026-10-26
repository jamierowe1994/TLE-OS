/**
 * The chase for a REX e-sign request that hasn't come back: a short note from
 * the agent pointing at the DocuSign email already in the landlord's inbox
 * (see app/api/esign/remind for why it is a note and not a resend). Shared by
 * that route and the dashboard's Nudge (app/api/dashboard/front/nudge), and
 * shown in Admin > Emails (terms-chase). Hyphens rather than dashes: a
 * customer reads it. The marks are renderPlain's: "# " title, **bold**.
 */

/** The label on the landlord letterhead, the same as the terms request's. */
export const ESIGN_REMIND_KICKER = "Terms of business";

export function esignRemindWording(o: {
  landlordFirst: string;
  address: string;
  sentAt: string | null;
  agentName: string;
  agentPhone: string;
}): { subject: string; text: string } {
  const when = o.sentAt
    ? new Date(o.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;
  const where = o.address || "your property";
  return {
    /* Not "Your terms of business for ...": that is the email asking them to
       sign in the first place, and a chase should not look like a resend. */
    subject: `Still to sign - your terms of business for ${where}`,
    text: `# Your Terms, Ready When You Are

Hi ${o.landlordFirst},

Just a quick note. The terms of business for ${o.address ? `**${o.address}**` : where} are still waiting on your signature.

They went out${when ? ` on ${when}` : ""} from DocuSign, so the email will be in your inbox under "The Letting Experts". It's worth a look in your junk folder too, as that's usually where it ends up.

Can't find it? Reply to this and I'll send it straight out again.

If there's anything in it you'd like to talk through first, ring me on ${o.agentPhone}. That's often quicker than email.

Kind regards,
${o.agentName}
The Letting Experts`,
  };
}
