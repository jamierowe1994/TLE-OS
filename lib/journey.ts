import type { Lead } from "@/lib/leads-sample";
import { leadSide } from "@/lib/leads-sample";

/**
 * The process a lead is actually taken through.
 *
 * Two tracks, because a tenant and a landlord are not the same job. A tenant
 * is qualified, shown properties and referenced; a landlord is signed up,
 * made compliant and put on the market. Sharing one pipeline would force both
 * through stages that mean nothing to half the records.
 *
 * Each step carries the ONE thing you'd do to move it on, so the Next-action
 * card can offer that action rather than a generic "mark as done" — booking a
 * viewing IS how you leave the viewing step.
 *
 * NOTE: the landlord track's first two steps are the ones James specified.
 * Everything after them is my reading of how a lettings sign-up runs and is
 * meant to be argued with — the labels are data, not structure, so changing
 * them is an edit to this file and nothing else.
 */

export type JourneyAction = "viewing" | "send" | "sign" | "none";

export type JourneyStep = {
  id: string;
  /** Short, for the rail. */
  label: string;
  /** What you do here. */
  title: string;
  detail: string;
  action: JourneyAction;
  cta: string;
  icon: string;
};

export const TENANT_TRACK: JourneyStep[] = [
  {
    id: "enquiry", label: "Enquiry", icon: "target",
    title: "Enquiry received",
    detail: "They've come in from a portal, the website or an ad. Nobody has spoken to them yet.",
    action: "none", cta: "Log first contact",
  },
  {
    id: "qualify", label: "Qualified", icon: "call",
    title: "Qualify the enquiry",
    detail: "Budget, area, move date, pets, who's moving in. Five minutes here saves five viewings later.",
    action: "none", cta: "Mark as qualified",
  },
  {
    id: "shortlist", label: "Shortlist sent", icon: "mail",
    title: "Send them properties",
    detail: "Match the shortlist to what they told you and get it in front of them the same day.",
    action: "send", cta: "Email properties",
  },
  {
    id: "viewing", label: "Viewing", icon: "calendar",
    title: "Book a viewing",
    detail: "Pick a slot, then tell everyone who needs to know — the applicant, the landlord and whoever holds the keys.",
    action: "viewing", cta: "Book a viewing",
  },
  {
    id: "feedback", label: "Feedback", icon: "message",
    title: "Get the feedback",
    detail: "Did they like it. Feedback the same day is worth ten times feedback a week later — to you and to the landlord.",
    action: "send", cta: "Chase feedback",
  },
  {
    id: "application", label: "Application", icon: "doc",
    title: "Take the application",
    detail: "Holding deposit, application form, right-to-rent evidence. Referencing starts the moment this is complete.",
    action: "none", cta: "Application received",
  },
  {
    id: "agreement", label: "Agreement", icon: "file-contract",
    title: "Send the tenancy agreement",
    detail: "Prepare the AST and send it out for signature to every tenant and any guarantor.",
    action: "sign", cta: "Prepare for signature",
  },
  {
    id: "movein", label: "Moved in", icon: "key",
    title: "Move-in",
    detail: "Monies cleared, deposit protected, keys handed over. The record becomes a tenancy.",
    action: "none", cta: "Confirm move-in",
  },
];

export const LANDLORD_TRACK: JourneyStep[] = [
  {
    id: "created", label: "Appointment", icon: "user",
    title: "Appointment or contact created",
    detail: "The landlord is on the system and an appraisal is in the diary.",
    action: "none", cta: "Appointment made",
  },
  {
    id: "terms", label: "Terms sent", icon: "file-contract",
    title: "Send the terms of business",
    detail: "Terms out for signature, with the fee schedule and the service level they've chosen.",
    action: "sign", cta: "Prepare for signature",
  },
  {
    id: "signed", label: "Terms signed", icon: "shield",
    title: "Terms signed",
    detail: "Signed and filed. Nothing goes on the market before this — it's the instruction.",
    action: "none", cta: "Mark as signed",
  },
  {
    id: "compliance", label: "Compliance", icon: "checklist",
    title: "Gather the compliance",
    detail: "EPC, gas safety, EICR, and the licence if it needs one. Missing paperwork is the usual reason a let slips.",
    action: "none", cta: "Compliance complete",
  },
  {
    id: "market", label: "On the market", icon: "megaphone",
    title: "Put it on the market",
    detail: "Photos, floorplan, description, price. Published to the portals from REX.",
    action: "none", cta: "Mark as live",
  },
  {
    id: "viewings", label: "Viewings", icon: "calendar",
    title: "Arrange viewings",
    detail: "Agree access, then book applicants in. The landlord gets told about every one.",
    action: "viewing", cta: "Book a viewing",
  },
  {
    id: "offer", label: "Let agreed", icon: "coin",
    title: "Let agreed",
    detail: "Offer accepted and referencing under way on the applicant.",
    action: "send", cta: "Tell the landlord",
  },
  {
    id: "managed", label: "Live", icon: "home",
    title: "Tenancy live",
    detail: "Tenant in, rent collected, property under management. The landlord record goes quiet until renewal.",
    action: "none", cta: "Confirm move-in",
  },
];

export function trackFor(lead: Lead): JourneyStep[] {
  return leadSide(lead) === "tenant" ? TENANT_TRACK : LANDLORD_TRACK;
}

/**
 * Where a lead starts on its track.
 *
 * Derived from the stage it already carries, so opening a record shows a
 * journey in progress rather than every lead sitting on step one. When the
 * real thing is wired the step becomes the stored field and the stage becomes
 * a read of it — this mapping is the bridge, not the design.
 */
export function startingStep(lead: Lead): number {
  const tenant = leadSide(lead) === "tenant";
  switch (lead.stage) {
    case "New": return 0;
    case "Contacted": return 1;
    case "Waiting": return tenant ? 2 : 1;
    case "Viewing booked": return 3;
    case "Qualified": return tenant ? 5 : 4;
    case "Not proceeding": return 1;
    default: return 0;
  }
}

/** A lead that has stopped. The rail says so rather than pretending. */
export function isStalled(lead: Lead): boolean {
  return lead.stage === "Not proceeding";
}

/* --------------------------------------------------------------------------
   The other side of the conversation.

   A viewing needs a landlord as well as an applicant, and the lead record
   only holds one of them. Until REX's property record is joined in, these
   stand in — deterministic per property, so the same flat always has the same
   landlord and the demo doesn't contradict itself between screens.
-------------------------------------------------------------------------- */

export type Party = { name: string; email: string; phone: string };

const STAND_INS: Party[] = [
  { name: "David Ashworth", email: "d.ashworth@gmail.com", phone: "07700 118 244" },
  { name: "Yvonne Clarke", email: "yvonne.clarke@btinternet.com", phone: "07811 990 132" },
  { name: "Raj Chauhan", email: "raj.chauhan@outlook.com", phone: "07922 415 780" },
  { name: "Helen Bosworth", email: "h.bosworth@icloud.com", phone: "07533 662 019" },
  { name: "Peter Nsofor", email: "peter.nsofor@gmail.com", phone: "07445 220 916" },
];

export function landlordFor(propertyId: string): Party {
  let n = 0;
  for (const ch of propertyId) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return STAND_INS[n % STAND_INS.length];
}
