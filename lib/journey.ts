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
  | "log"            // write down a contact attempt - call, text, visit
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
    action: "log", cta: "Log first contact",
  },
  {
    id: "contacted", label: "Contacted", icon: "call",
    title: "First contact",
    detail:
      "You've spoken to them, or tried. Log the attempt either way — three unanswered calls is information, and only if somebody wrote it down.",
    action: "log", cta: "Log the attempt",
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
    action: "log", cta: "Log the attempt",
  },
  {
    id: "contact3", label: "3rd contact", icon: "call",
    title: "Third contact",
    detail:
      "The last direct attempt. If this doesn't land, they go to nurture rather than being quietly dropped.",
    action: "log", cta: "Log the attempt",
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
      /* The percentage that used to be in this sentence - "56% of the current
         book is sitting unpublished" - was hardcoded, was written when the
         book was 293 listings, and read 56% on 14 Sep 2026 when the true
         figure was 62%. A track definition has no access to the live book, so
         the honest fix is to stop quoting a figure here: Listings says how
         many drafts there are, live, on the screen the agent came from. */
      "Get it onto Rightmove, Zoopla and OnTheMarket. A draft earns nothing.",
    action: "none", cta: "Mark as live",
  },
  /* SPLIT IN TWO, 14 Sep 2026 (Danielle, 11 Sep). This was one step called
     "Viewings & offers", which made a stage out of two different jobs: filling
     a diary, and handling what comes back from it. An agent with six viewings
     booked and no offers yet, and an agent with three offers to weigh up, were
     on the same square - so the track could not say which of them was stuck,
     and neither could the landlord looking at the same spine. */
  {
    id: "viewings", label: "Viewings", icon: "calendar",
    title: "Get people through the door",
    detail:
      "Book them in and keep them coming. The record stays HERE while the diary is filling; nothing moves on by itself.",
    action: "viewing", cta: "Book a viewing",
  },
  {
    id: "offers-in", label: "Offers in", icon: "doc",
    title: "Let the applications build up",
    detail:
      "Each applicant applies through the form: who, how much, from when, and their situation. They build up while the viewings finish, so the landlord sees the whole field at once rather than the first one in.",
    action: "none", cta: "Log an offer",
  },
  {
    id: "offers", label: "Landlord review", icon: "coin",
    title: "Put the applications to the landlord",
    detail:
      "Viewings have stopped. Put every application to the landlord: the offer, the situation and who we would pick. Each one opens with its next step.",
    action: "review", cta: "Send the landlord the applications",
  },
  {
    id: "accepted", label: "Offer accepted", icon: "shield",
    title: "Offer accepted",
    detail:
      "The landlord has chosen. Confirm to the applicant, and let the others down kindly. Every applicant gets an answer.",
    action: "none", cta: "Accepted: confirm",
  },
  {
    id: "handover", label: "Handover", icon: "key",
    title: "Hand over to Kirstie",
    detail:
      "Property, landlord, applicants, agreed rent and dates go to pre-tenancy in one package, from the accepted application. Referencing and move-in run from there.",
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
  /* BY ID, NOT BY NUMBER. These were the literals 3, 1 and 0, and splitting
     "Viewings & offers" in two on 14 Sep moved Offer accepted from 3 to 4 -
     which would have put every let-agreed listing on the wrong square, quietly,
     with nothing on screen looking broken. The track is a list somebody will
     edit again; a lookup survives that and a number does not. */
  const at = (id: string) => Math.max(0, LISTING_TRACK.findIndex((s) => s.id === id));
  if (l.letAgreed) return at("accepted"); // offer accepted, handover pending
  if (l.publicationStatus === "published") return at("viewings"); // live — get viewings
  return at("live"); // draft — first job is going live
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

/**
 * ── `landlordFor()` IS GONE. DO NOT BRING IT BACK. ───────────────────────────
 *
 * It held five invented people — "David Ashworth", "Yvonne Clarke" and three
 * more, with plausible-looking mobiles — and picked one by hashing the property
 * id. Stable per property, so it looked like a lookup rather than a coin toss.
 *
 * That was fine while this was a wireframe and fatal once the booker could
 * send. `ViewingBooker.compose()` used it to address a real landlord
 * confirmation email, so booking a viewing offered to email a fictional person
 * about a property they have never owned. It also wrote a made-up name into the
 * PLC handover package, which is a compliance record.
 *
 * ── Why there is no replacement ─────────────────────────────────────────────
 *
 * There is nothing to replace it WITH. REX's `legal_vendor_name` is populated
 * on 0% of the rental book (see lib/rex-keys.ts), and REX's listing projection
 * carries no landlord name at all — lib/rex-compliance.ts already renders the
 * landlord as "—" for exactly this reason. PayProp knows the beneficiary on
 * MANAGED properties only, and joining that to a listing is a real piece of
 * work, not a fallback.
 *
 * So every screen that wants a landlord now says it doesn't have one, the way
 * ViewingDrawer always has. "Not recorded in REX" is a true answer. A name is
 * only allowed here when something authoritative supplied it.
 */
export const LANDLORD_UNKNOWN =
  "Not recorded — no landlord is held against this property.";
