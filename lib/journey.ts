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

export type JourneyAction = "viewing" | "send" | "sign" | "handoff" | "none";

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

/**
 * THE REAL STAGES — James's breakdown of Susan's full 19-step list,
 * 7 Aug 2026. The landlord-lead track is everything up to and including
 * property compliance; at that point it stops being a person and becomes a
 * listing. These labels are the business's own words, not my reading.
 */
export const LANDLORD_TRACK: JourneyStep[] = [
  /* Starts at LEAD, not at appraisal — James's correction, 7 Aug 2026. A lead
     isn't an appraisal yet: someone has to ring the landlord, agree a date and
     get the visit in the diary, and that's real work the rail must show. */
  {
    id: "lead", label: "Lead", icon: "target",
    title: "New landlord lead",
    detail:
      "They've come in from somewhere. Ring them, talk it through, and get the appraisal booked — a date, a time, and their address in the diary.",
    action: "none", cta: "Appraisal booked",
  },
  {
    id: "appraisal", label: "Appraisal", icon: "calendar",
    title: "Market appraisal",
    detail:
      "Go over, walk the property, and land on the value together. What you learn here fills the property panel on the left.",
    action: "none", cta: "Appraisal held",
  },
  {
    id: "followup", label: "MA follow-up", icon: "call",
    title: "Appraisal follow-up",
    detail:
      "The call after the visit — this is where instructions are actually won. An appraisal nobody chased is a free valuation for another agent.",
    action: "none", cta: "Followed up",
  },
  {
    id: "terms", label: "Terms", icon: "file-contract",
    title: "Terms of business",
    detail:
      "Out for signature with the fee schedule and service level. Nothing goes on the market before this — it's the instruction.",
    action: "sign", cta: "Prepare for signature",
  },
  {
    id: "id", label: "ID & ownership", icon: "doc",
    title: "Landlord ID and proof of ownership",
    detail:
      "Photo ID plus proof they actually own the property — title register or Land Registry. Letting a property for somebody who doesn't own it is a story that ends in court.",
    action: "none", cta: "ID & ownership verified",
  },
  {
    id: "aml", label: "AML", icon: "shield",
    title: "AML check",
    detail:
      "Anti-money-laundering due diligence on the landlord. A legal duty, not paperwork theatre — and it can't be backfilled after the tenancy starts.",
    action: "none", cta: "AML passed",
  },
  /* The last step IS the push. There's no separate "listing & photos" stage —
     building the listing happens on the listing side, and a dot that only
     existed to say "go over there" was a dot wasted. Compliance completes,
     and the same breath pushes the record over. */
  {
    id: "compliance", label: "Compliance", icon: "checklist",
    title: "Property compliance",
    detail:
      "EPC, gas safety, EICR, and the licence if it needs one. The moment these are in, this stops being a person and becomes a listing.",
    action: "handoff", cta: "Push to a listing",
  },
];

/**
 * The LISTING track — what the property does once it exists: go live, get
 * viewed, take offers, and hand over. It ends at handover deliberately: from
 * "let agreed" onward the work is the applicant's pre-tenancy journey
 * (references, property prep, safety compliance, inventory, signing, monies,
 * move-in), and that pipeline already lives on the Applications side with
 * Kirstie. One record per phase, one owner per record.
 */
export const LISTING_TRACK: JourneyStep[] = [
  {
    id: "live", label: "On market", icon: "megaphone",
    title: "Put it live",
    detail:
      "Publish to the portals via REX. A draft earns nothing — 56% of the current book is sitting unpublished.",
    action: "none", cta: "Mark as live",
  },
  {
    id: "viewings", label: "Viewings", icon: "calendar",
    title: "Get people through the door",
    detail:
      "Email it to matching tenants, book the viewings in, and chase feedback the same day — the landlord is waiting on it.",
    action: "viewing", cta: "Book a viewing",
  },
  {
    id: "offers", label: "Offers", icon: "coin",
    title: "Take offers",
    detail:
      "Log each offer and put it to the landlord with a recommendation. Every applicant who offered gets an answer either way.",
    action: "none", cta: "Offer received",
  },
  {
    id: "accepted", label: "Offer accepted", icon: "shield",
    title: "Offer accepted",
    detail:
      "Landlord has said yes. Confirm to the applicant, take the holding deposit, and stop the viewings.",
    action: "none", cta: "Accepted — confirm",
  },
  {
    id: "handover", label: "Handover", icon: "key",
    title: "Hand over to Kirstie",
    detail:
      "Compile everything — property, landlord, applicant, agreed rent, dates — and pass it to Applications. Pre-tenancy, referencing and move-in run there.",
    action: "handoff", cta: "Hand over to Kirstie",
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
    // Landlord indices follow the REAL track: 0 lead, 1 appraisal,
    // 2 MA follow-up, 3 terms, 4 ID, 5 AML, 6 compliance + push.
    case "Viewing booked": return tenant ? 3 : 1;
    case "Qualified": return tenant ? 5 : 5;
    case "Not proceeding": return 1;
    default: return 0;
  }
}

/** Where a listing starts on the LISTING track, from what REX already knows. */
export function listingStartingStep(l: {
  letAgreed: boolean;
  publicationStatus: string | null;
}): number {
  if (l.letAgreed) return 3; // offer accepted, handover pending
  if (l.publicationStatus === "published") return 1; // live — get viewings
  return 0; // draft — first job is going live
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
