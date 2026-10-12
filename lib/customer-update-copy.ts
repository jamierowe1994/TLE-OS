/**
 * The words for a customer update (lib/customer-updates), one pair per kind:
 * what the tenant reads and what the landlord reads. A first draft only - the
 * agent sees it, changes what they like, and sends it themselves, or rings.
 *
 * Plain, warm, UK English, no dashes standing in for commas, and never a
 * promise the agent has not made. Where a fact came from a check (a failed
 * reference, the PLC), the email says what happens next rather than the
 * detail of the report: the detail is a conversation, which is why the agent
 * may ring instead.
 */

export type UpdateKind =
  | "referencing_started"
  | "references_back"
  | "reference_failed"
  | "guarantor_needed"
  | "agreement_out"
  | "complete"
  | "move_in_ready"
  | "cancelled"
  | "plc_deferred"
  | "plc_declined"
  | "plc_approved"
  /* Written by the agent from the let's page (12 Oct 2026): a free update,
     and the reminders James listed - "we're sending you a reminder that you
     need to sign your agreement", and the rest. */
  | "general"
  | "nudge_holding_fee"
  | "nudge_referencing"
  | "nudge_sign_agreement"
  | "nudge_move_in_money"
  | "nudge_documents";

export interface CopyContext {
  address: string;
  firstName: string;
  agentName: string;
  /** Move-in date, words. */
  moveIn?: string | null;
  /** The things the PLC check needs, already plain sentences. */
  needs?: string[];
}

export interface UpdateCopy {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  nextLine: string;
}

const FOOT = {
  tenant: "You're getting this because you're renting a home through The Letting Experts.",
  landlord: "You're getting this because The Letting Experts are letting your home.",
};

/** Agent-facing: one line saying what happened. */
export const HEADLINE: Record<UpdateKind, string> = {
  referencing_started: "Holding fee in, referencing started",
  references_back: "References are back",
  reference_failed: "A reference has failed",
  guarantor_needed: "References passed, but a guarantor is needed",
  agreement_out: "The tenancy agreement is out for signing",
  complete: "Signed and the move-in monies are in",
  move_in_ready: "Signed off: compliant and ready to move in",
  cancelled: "The deal has been cancelled",
  plc_deferred: "The PLC check needs more before it can pass",
  plc_declined: "The PLC check was declined",
  plc_approved: "The PLC check has passed",
  general: "An update from the agent",
  nudge_holding_fee: "Reminder: the holding deposit",
  nudge_referencing: "Reminder: the references",
  nudge_sign_agreement: "Reminder: sign the tenancy agreement",
  nudge_move_in_money: "Reminder: the move-in money",
  nudge_documents: "Reminder: documents we still need",
};

/** Who should hear about each kind, by default. */
export const AUDIENCE: Record<UpdateKind, Array<"tenant" | "landlord">> = {
  referencing_started: ["tenant"],
  references_back: ["tenant", "landlord"],
  reference_failed: ["tenant", "landlord"],
  guarantor_needed: ["tenant"],
  agreement_out: ["tenant", "landlord"],
  complete: ["tenant", "landlord"],
  move_in_ready: ["tenant", "landlord"],
  cancelled: ["tenant", "landlord"],
  plc_deferred: ["landlord"],
  plc_declined: ["landlord"],
  plc_approved: ["landlord"],
  general: ["tenant", "landlord"],
  nudge_holding_fee: ["tenant"],
  nudge_referencing: ["tenant"],
  nudge_sign_agreement: ["tenant", "landlord"],
  nudge_move_in_money: ["tenant"],
  nudge_documents: ["tenant", "landlord"],
};

/* The body goes into the email as HTML (bodyHtml below), so anything from
   outside - the address, the PLC's needs - is escaped here, and the only
   markup is the code's own <strong> and line breaks. */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const b = (s: string) => `<strong>${esc(s)}</strong>`;

export function updateCopy(kind: UpdateKind, role: "tenant" | "landlord", c: CopyContext): UpdateCopy & { footLine: string } {
  const at = b(c.address);
  const moving = c.moveIn ? ` on ${c.moveIn}` : "";
  const needs = (c.needs ?? []).filter(Boolean);
  const list = needs.length ? `<br><br>${needs.map((n) => `&bull; ${esc(n)}`).join("<br>")}` : "";
  const t = role === "tenant";
  let o: UpdateCopy;
  switch (kind) {
    case "referencing_started":
      o = t
        ? {
            subject: `Holding deposit received - ${c.address}`,
            preheader: "Thank you. Your references are the next step.",
            heading: "Holding Deposit Received",
            body: `Thank you, your holding deposit for ${at} has come through and the home is now off the market for you.`,
            nextLine: "Your references have been requested. Look out for an email from the referencing company and fill it in as soon as you can: it's the quickest way to your move-in date.",
          }
        : {
            subject: `Holding deposit paid - ${c.address}`,
            preheader: "Your new tenant has paid the holding deposit.",
            heading: "Holding Deposit Paid",
            body: `Your new tenant has paid the holding deposit for ${at}, so the home is off the market.`,
            nextLine: "Their references have been requested and I'll let you know as soon as they're back.",
          };
      break;
    case "references_back":
      o = t
        ? {
            subject: `Your references are back - ${c.address}`,
            preheader: "Good news, and what happens next.",
            heading: "Your References Are Back",
            body: `Good news: your references for ${at} have come back and they're fine.`,
            nextLine: "Next, we finish the safety checks on the home and then send you the tenancy agreement to sign.",
          }
        : {
            subject: `Your tenant has passed referencing - ${c.address}`,
            preheader: "References are back for your new tenant.",
            heading: "References Passed",
            body: `The references for your new tenant at ${at} are back and they've passed.`,
            nextLine: "Next, we finish the pre-let safety checks and then send the tenancy agreement out for signing.",
          };
      break;
    case "reference_failed":
      o = t
        ? {
            subject: `Your references - ${c.address}`,
            preheader: "Let's talk through the options.",
            heading: "About Your References",
            body: `Your references for ${at} have come back, and they haven't been accepted as they stand.`,
            nextLine: "That doesn't have to be the end of it. A guarantor or paying some rent in advance can often help. I'd like to talk it through with you, so please reply or give me a call.",
          }
        : {
            subject: `Referencing update - ${c.address}`,
            preheader: "An update on your applicant's references.",
            heading: "Referencing Update",
            body: `The references for the applicant on ${at} haven't been accepted as they stand.`,
            nextLine: "I'm talking to them about a guarantor or rent in advance, and I'll come back to you with where that lands before anything goes further.",
          };
      break;
    case "guarantor_needed":
      o = {
        subject: `A guarantor for ${c.address}`,
        preheader: "One more step before your agreement.",
        heading: "A Guarantor Is Needed",
        body: `Your references for ${at} are back, and the referencing company has asked for a guarantor.`,
        nextLine: "A guarantor is usually a parent or relative who agrees to cover the rent if you can't. Reply with their name and email, and they'll be sent what they need.",
      };
      break;
    case "agreement_out":
      o = t
        ? {
            subject: `Your tenancy agreement is ready to sign - ${c.address}`,
            preheader: "Look out for the signing email.",
            heading: "Ready to Sign",
            body: `Your tenancy agreement for ${at} is ready, and it has been sent to you to sign.`,
            nextLine: "Look out for the signing email (check your junk folder too). Once everyone has signed and the move-in monies are paid, you're all set.",
          }
        : {
            subject: `The tenancy agreement is ready to sign - ${c.address}`,
            preheader: "Your signature is needed.",
            heading: "Ready to Sign",
            body: `The tenancy agreement for ${at} is ready and has been sent out for signing.`,
            nextLine: "Look out for the signing email. Once you and the tenant have both signed, we collect the move-in monies.",
          };
      break;
    case "complete":
      o = t
        ? {
            subject: `All signed - ${c.address}`,
            preheader: "Everything is in place for your move.",
            heading: "All Signed",
            body: `Everything is signed and your move-in monies are in for ${at}.`,
            nextLine: `I'll be in touch about collecting the keys${moving}.`,
          }
        : {
            subject: `All signed - ${c.address}`,
            preheader: "Your new tenancy is signed.",
            heading: "All Signed",
            body: `The tenancy for ${at} is signed and the move-in monies are in.`,
            nextLine: `Your tenant moves in${moving}. I'll confirm once the keys are handed over.`,
          };
      break;
    case "move_in_ready":
      o = t
        ? {
            subject: `You're ready to move in - ${c.address}`,
            preheader: "Everything is in place.",
            heading: "Ready to Move In",
            body: `Everything for ${at} has been checked and you're ready to move in${moving}.`,
            nextLine: "I'll confirm the time and where to collect the keys.",
          }
        : {
            subject: `Ready for move-in - ${c.address}`,
            preheader: "The checks are done.",
            heading: "Ready for Move-In",
            body: `The pre-let checks on ${at} are done and your tenant is ready to move in${moving}.`,
            nextLine: "I'll confirm once the keys are handed over.",
          };
      break;
    case "cancelled":
      o = t
        ? {
            subject: `Your application - ${c.address}`,
            preheader: "An update on your application.",
            heading: "An Update on Your Application",
            body: `I'm sorry to say the let on ${at} won't be going ahead.`,
            nextLine: "I'd still like to help you find somewhere. Reply and I'll send you what else we have that fits.",
          }
        : {
            subject: `An update on the let - ${c.address}`,
            preheader: "The let won't be going ahead.",
            heading: "An Update on the Let",
            body: `The let on ${at} won't be going ahead as planned.`,
            nextLine: "I'll talk you through what happens next and get the home back in front of tenants.",
          };
      break;
    /* A blank page with the greeting and the sign-off: the agent writes it. */
    case "general":
      o = {
        subject: `An update - ${c.address}`,
        preheader: `An update on ${c.address}.`,
        heading: "A Quick Update",
        body: `I wanted to give you an update on ${at}.`,
        nextLine: "Reply to this email or give me a call if you have any questions.",
      };
      break;
    case "nudge_holding_fee":
      o = {
        subject: `A reminder about the holding deposit - ${c.address}`,
        preheader: "Paying it takes the home off the market for you.",
        heading: "A Reminder About Your Holding Deposit",
        body: `We're sending you a reminder that the holding deposit for ${at} is still to be paid.`,
        nextLine: "Until it is, the home stays on the market and others can still offer on it. The payment details are in our earlier email; reply or call me if you can't find them.",
      };
      break;
    case "nudge_referencing":
      o = {
        subject: `A reminder about your references - ${c.address}`,
        preheader: "Your references are the next step to moving in.",
        heading: "A Reminder About Your References",
        body: `We're sending you a reminder that your references for ${at} still need finishing.`,
        nextLine: "Look out for the email from the referencing company and fill it in as soon as you can: it's the quickest way to your move-in date. Tell me if anything is holding you up.",
      };
      break;
    case "nudge_sign_agreement":
      o = t
        ? {
            subject: `A reminder to sign your tenancy agreement - ${c.address}`,
            preheader: "Your agreement is waiting for your signature.",
            heading: "Your Agreement Is Waiting",
            body: `We're sending you a reminder that your tenancy agreement for ${at} is still waiting for your signature.`,
            nextLine: `Please sign it as soon as you can so everything is ready for your move${moving}. Reply if the email with the agreement has gone missing and I'll send it again.`,
          }
        : {
            subject: `A reminder to sign the tenancy agreement - ${c.address}`,
            preheader: "The agreement is waiting for your signature.",
            heading: "The Agreement Is Waiting",
            body: `We're sending you a reminder that the tenancy agreement for ${at} is still waiting for your signature.`,
            nextLine: "Please sign it when you can so the move-in can go ahead as planned. Reply if you'd like me to send it again.",
          };
      break;
    case "nudge_move_in_money":
      o = {
        subject: `A reminder about your move-in money - ${c.address}`,
        preheader: "The deposit and first month's rent are due before the keys.",
        heading: "A Reminder About Your Move-in Money",
        body: `We're sending you a reminder that the deposit and the first month's rent for ${at} need to reach us before your move${moving}.`,
        nextLine: "The amounts and the payment details are in the email we sent with your agreement. The keys are handed over once both have arrived.",
      };
      break;
    case "nudge_documents":
      o = t
        ? {
            subject: `Documents we still need - ${c.address}`,
            preheader: "A few things before your move can go ahead.",
            heading: "Documents We Still Need",
            body: `We're sending you a reminder that we still need some documents from you for ${at}.${list}`,
            nextLine: "Reply to this email with them attached, or upload them in your portal.",
          }
        : {
            subject: `Documents we still need - ${c.address}`,
            preheader: "A few things before the let can go ahead.",
            heading: "Documents We Still Need",
            body: `We're sending you a reminder that we still need some documents from you for ${at}.${list}`,
            nextLine: "Reply to this email with them attached, or upload them in your portal.",
          };
      break;
    case "plc_deferred":
      o = {
        subject: `A few things we need - ${c.address}`,
        preheader: "Before your tenant can move in.",
        heading: "A Few Things We Need",
        body: `We've been through the pre-let paperwork for ${at}, and we need a little more before your tenant can move in.${list}`,
        nextLine: "If you have any of these, reply with a copy. If not, I can arrange them for you.",
      };
      break;
    case "plc_declined":
      o = {
        subject: `The pre-let checks - ${c.address}`,
        preheader: "Something needs sorting before the let can go ahead.",
        heading: "The Pre-Let Checks",
        body: `The pre-let checks on ${at} have found something that needs sorting before the let can go ahead.${list}`,
        nextLine: "I'd like to talk you through it, so please reply or give me a call.",
      };
      break;
    case "plc_approved":
      o = {
        subject: `Pre-let checks passed - ${c.address}`,
        preheader: "Your home has passed its pre-let checks.",
        heading: "Checks Passed",
        body: `Good news: ${at} has passed its pre-let compliance checks.`,
        nextLine: "Next, the tenancy agreement goes out for signing.",
      };
      break;
  }
  return { ...o, footLine: FOOT[role] };
}

/** The catalogue vars for update-tenant / update-landlord. */
export function updateVars(kind: UpdateKind, role: "tenant" | "landlord", c: CopyContext): Record<string, string> {
  const o = updateCopy(kind, role, c);
  return {
    subject: o.subject,
    preheader: o.preheader,
    heading: o.heading,
    firstName: c.firstName || "there",
    body: o.body,
    /* What the template reads (12 Oct 2026). Vars are escaped into an email
       since 10 Oct unless named ...Html, so {{body}} showed its <strong> tags
       as text; this one is built safe above. */
    bodyHtml: o.body,
    nextLine: o.nextLine,
    agentName: c.agentName,
    footLine: o.footLine,
  };
}

/**
 * Updates written before 12 Oct 2026 carry `body` and no `bodyHtml`. Their
 * body was built by this file - the address in <strong>, line breaks - but
 * with the address unescaped, so it is escaped whole here and only those two
 * tags let back in.
 */
export function withBodyHtml(vars: Record<string, string>): Record<string, string> {
  if (vars.bodyHtml) return vars;
  const safe = esc(vars.body ?? "")
    .replace(/&lt;(\/?)strong&gt;/gi, "<$1strong>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/&amp;bull;/g, "&bull;");
  return { ...vars, bodyHtml: safe };
}
