/**
 * The chase for a REX e-sign request that hasn't come back: a short note from
 * the agent pointing at the DocuSign email already in the landlord's inbox
 * (see app/api/esign/remind for why it is a note and not a resend). Shared by
 * that route and the dashboard's Nudge (app/api/dashboard/front/nudge).
 * Hyphens rather than dashes: a customer reads it.
 */
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
    subject: `Your terms of business - ${where}`,
    text: `Hi ${o.landlordFirst},

Just a quick note - the terms of business for ${where} are still waiting on your signature.

They went out${when ? ` on ${when}` : ""} from DocuSign, so the email will be in your inbox under "The Letting Experts". It's worth a look in your junk folder too; that is where it usually is.

If you can't find it, reply to this and I'll send it straight out again. And if there's anything in it you'd like to talk through first, ring me on ${o.agentPhone} - that's often quicker than email.

Kind regards,
${o.agentName}
The Letting Experts`,
  };
}

