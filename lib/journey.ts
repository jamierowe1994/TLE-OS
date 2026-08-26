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
 * Both tracks now carry the business's own stage names (Susan's list, via
 * James). The labels are data, not structure — changing one is an edit to
 * this file and nothing else.
 */

/**
 * What the Next-action button DOES. Imperatives, not confirmations — the
 * button is the work, and pressing it opens the thing you do next rather
 * than asking you to swear you already did it (James, 7 Aug 2026).
 */
export type JourneyAction =
  | "viewing"        // book an applicant viewing
  | "appraise"       // book the market appraisal into the diary
  | "appraisal-form" // record the appraisal: property details + what was said
  | "takeon"         // book the take-on visit, then capture photos & details
  | "docs"           // open a document portal (ID, AML, compliance) — never gating
  | "send"           // email properties
  | "sign"           // prepare a document for signature
  | "handoff"        // push the record to its next home
  | "review"         // put the applications in front of the landlord
  | "none";

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
    id: "qualify", label: "Qualifying call", icon: "call",
    title: "Qualify the enquiry",
    detail: "Budget, area, move date, pets, who's moving in. Five minutes here saves five viewings later.",
    action: "none", cta: "Mark as qualified",
  },
  {
    id: "shortlist", label: "Shortlists", icon: "mail",
    title: "Send them properties",
    detail: "Match the shortlist to what they told you and get it in front of them the same day.",
    action: "send", cta: "Email properties",
  },
  {
    id: "viewing", label: "Viewings", icon: "calendar",
    title: "Book a viewing",
    detail:
      "Pick a slot, then tell everyone who needs to know — the applicant, the landlord and whoever holds the keys. Booking it hands the record to the viewings process.",
    action: "viewing", cta: "Book a viewing",
  },
];

/**
 * The VIEWINGS spine — where an applicant goes once a viewing is booked.
 *
 * Split out of the tenant track on 18 Aug 2026 (James, after Howard). The
 * tenant track used to run all eight steps from enquiry to move-in, which
 * meant a record sat in one long rail owned by nobody in particular. It now
 * hands over twice, at named points:
 *
 *   tenant     enquiry → qualifying call → shortlists → VIEWINGS
 *   viewings   VIEWINGS → feedback → offer → offer accepted → APPLICATION
 *   applications  (the eight pre-tenancy stages, on the Applications page)
 *
 * Viewings appears at the end of one spine and the start of the next on
 * purpose — it is the handover itself, not a step that belongs to one side.
 *
 * Note this is the APPLICANT's journey through a viewing. LISTING_TRACK below
 * is the property's, and they are deliberately different: one property runs
 * many applicants through this.
 */
export const VIEWING_TRACK: JourneyStep[] = [
  {
    id: "viewing", label: "Viewings", icon: "calendar",
    title: "The viewing",
    detail: "Booked and confirmed. Everyone who needs to know has been told.",
    action: "viewing", cta: "Book another viewing",
  },
  {
    id: "feedback", label: "Feedback", icon: "message",
    title: "Get the feedback",
    detail:
      "Did they like it. Feedback the same day is worth ten times feedback a week later — to you and to the landlord.",
    action: "send", cta: "Ask for feedback",
  },
  {
    id: "offer", label: "Offer", icon: "coin",
    title: "Take the offer",
    detail:
      "What they'll pay and when they'd move. An offer can never be above the asking price — at or below only.",
    action: "none", cta: "Record the offer",
  },
  {
    id: "accepted", label: "Offer accepted", icon: "shield",
    title: "Offer accepted",
    detail:
      "The landlord has said yes. Confirm to the applicant and let the others down kindly — every applicant gets an answer.",
    action: "none", cta: "Accepted — confirm",
  },
  {
    id: "application", label: "Application", icon: "doc",
    title: "Take the application",
    detail:
      "Holding deposit, application form, right-to-rent evidence. Completing this hands the record to Applications, where the eight pre-tenancy stages run.",
    action: "handoff", cta: "Application received",
  },
];

/**
 * THE REAL STAGES — James's breakdown of Susan's full 19-step list,
 * 7 Aug 2026. The landlord-lead track is everything up to and including
 * property compliance; at that point it stops being a person and becomes a
 * listing. These labels are the business's own words, not my reading.
 */
/**
 * THE LANDLORD TRACK — rebuilt 23 Aug 2026 (James).
 *
 * It used to run lead → appraisal → terms → take-on → ID → compliance, and the
 * problem was the FIRST arrow. "Lead" to "appraisal" is an enormous jump: it
 * covers every phone call, every email, every chase, and an agent who had rung
 * three times and got nowhere had nothing to show for it. So everything got
 * crammed into "appraisal", which then meant nothing either.
 *
 * Two changes:
 *
 * 1. THE FRONT IS BROKEN INTO TICKS. Contact, email, second contact, third
 *    contact, book. Each is a thing an agent either did or didn't, which is
 *    the test the whole spine is now held to: **have I sent this, have I done
 *    this, have I made this.** Any step that can't be answered yes or no is
 *    too big.
 *
 * 2. THE BACK IS GONE — moved to Market Appraisals. Terms, take-on, ID and
 *    AML all happen AFTER a visit is booked, which is a different job on a
 *    different screen. The lead's work finishes at "booked" and hands over.
 *
 * Skipping ahead is expected, not an error: a landlord who books on the first
 * call jumps straight from Contacted to Booked, and the steps between are
 * simply never marked. A spine that punished that would be lying about how
 * lettings works.
 */
export const LANDLORD_TRACK: JourneyStep[] = [
  {
    id: "lead", label: "Lead", icon: "target",
    title: "New landlord lead",
    detail:
      "Where it came from, and how to reach them. Read the source before you ring — a portal enquiry and a referral are not the same conversation.",
    action: "none", cta: "Log first contact",
  },
  {
    id: "contacted", label: "Contacted", icon: "call",
    title: "First contact",
    detail:
      "You've spoken to them, or tried. Log the attempt either way — three unanswered calls is information, and only if somebody wrote it down.",
    action: "none", cta: "Log the attempt",
  },
  {
    id: "email", label: "Email sent", icon: "mail",
    title: "Send them something",
    detail:
      "What we do, what it's worth, and why a call is worth ten minutes. It gives the second contact a reason to exist.",
    action: "send", cta: "Send the email",
  },
  {
    id: "contact2", label: "2nd contact", icon: "call",
    title: "Second contact",
    detail: "Follow the email up. Most landlords answer on the second or third attempt, not the first.",
    action: "none", cta: "Log the attempt",
  },
  {
    id: "contact3", label: "3rd contact", icon: "call",
    title: "Third contact",
    detail:
      "The last direct attempt. If this doesn't land, they go to nurture rather than being quietly dropped.",
    action: "none", cta: "Log the attempt",
  },
  {
    id: "appraisal_booked", label: "Appraisal booked", icon: "calendar",
    title: "Book the appraisal",
    detail:
      "The whole point of the spine. Booking hands the record to Market Appraisals — everything from the visit onwards happens there.",
    action: "appraise", cta: "Book the appraisal",
  },
];

/**
 * The losing branch, drawn rather than hidden.
 *
 * A lead that stops answering has to go SOMEWHERE, and "nothing happened" is
 * not a place. Nurture is a split off the contact steps, not a failure state
 * at the end — the point is that the agent can see the fork while they are
 * still on it.
 *
 * Not wired to anything yet: the nurture campaigns aren't built. Showing the
 * branch before it works is deliberate — it tells an agent the option exists
 * and stops "no answer" meaning "forgotten".
 */
export const NURTURE_BRANCH: JourneyStep = {
  id: "nurture", label: "Nurture", icon: "mail",
  title: "Add to nurture",
  detail:
    "They're not saying no, they're not answering. Nurture keeps them warm on a campaign rather than dying in someone's call list — and they can rejoin the spine whenever they reply.",
  action: "none", cta: "Add to nurture",
};

/** Which steps a lead can peel off into nurture from. */
export const NURTURE_FROM = ["contacted", "email", "contact2", "contact3"];

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
    id: "viewings", label: "Viewings & offers", icon: "calendar",
    title: "Get people through the door",
    detail:
      "Book viewings in and log each offer as it lands. The record stays HERE until the viewings stop — offers accumulate, nothing moves on by itself.",
    action: "viewing", cta: "Book a viewing",
  },
  {
    id: "offers", label: "Landlord review", icon: "coin",
    title: "Put the applications to the landlord",
    detail:
      "Viewings have stopped. Send the landlord a link to every application — the offer, the situation, the agent's pick — and they choose or ring in.",
    action: "review", cta: "Send the landlord the applications",
  },
  {
    id: "accepted", label: "Offer accepted", icon: "shield",
    title: "Offer accepted",
    detail:
      "The landlord has chosen. Confirm to the applicant, take the holding deposit, and let the others down kindly — every applicant gets an answer.",
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

  /* Landlord indices after the 23 Aug rebuild:
       0 lead · 1 contacted · 2 email sent · 3 second contact
       4 third contact · 5 appraisal booked
     Tenant indices: 0 enquiry · 1 qualifying call · 2 shortlists · 3 viewings.

     The old map pointed "Qualified" at index 4, which under the OLD track was
     "ID & ownership" and under the new one is "third contact". Left unchanged
     it would have put every qualified landlord three chases deep into a spine
     they had never been rung on — the kind of wrong that looks plausible on
     screen and quietly misreports the whole pipeline. */
  switch (lead.stage) {
    case "New": return 0;
    case "Contacted": return 1;
    case "Waiting": return tenant ? 2 : 2; // email sent, waiting on a reply
    case "Viewing booked": return tenant ? 3 : 5; // landlord equivalent: booked
    // "Qualified" says we have spoken and they are worth pursuing — that is
    // after first contact, not deep into the chase sequence.
    case "Qualified": return tenant ? 2 : 1;
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
