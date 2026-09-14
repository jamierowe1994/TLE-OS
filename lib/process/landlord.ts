import type { ProcessMap, ProcessNode } from "@/lib/process/types";

/**
 * The landlord process, drawn 14 Sep 2026 at James's ask: the same map as the
 * tenant's, from the enquiry landing to the property being let.
 *
 * ── Where it starts, and why not earlier ──────────────────────────────────
 *
 * At the enquiry. Bond - the prospecting that finds a landlord before they
 * put their hand up - is locked for the pilot and needs the Land Registry
 * route behind it, so it sits on the map as one planned step rather than a
 * lane nobody can use.
 *
 * ── The shape ─────────────────────────────────────────────────────────────
 *
 * TWO FRONT DOORS, and the difference matters more than it does for a tenant:
 *
 *   Portal enquiry   GetAgent, OnTheMarket, Rightmove. They have asked what
 *                    their property is worth, usually of three agents at
 *                    once. Speed is the whole game: the first agent to ring
 *                    gets the valuation.
 *   Added by hand    an agent types them in after a call or a referral.
 *
 * Both meet at the same question - can we get in front of them - and the
 * spine from there is: reach them → book the appraisal → do it → put the
 * figure and the fee in writing → get the terms signed → take it on → get
 * it live → let it.
 *
 * THE LOOPS. Three things send a landlord sideways rather than off the end:
 * nobody answers (nurture), they say no after the visit (win-back), and the
 * terms sit unsigned. Each wants an email, because the alternative is a
 * valuation done for free and never spoken of again.
 *
 * ── How far along ─────────────────────────────────────────────────────────
 *
 * Every step carries a status from the nine-rung ladder in lib/process/types,
 * set at the LOWEST rung it can honestly claim. Read the blurb rather than
 * the badge where they disagree: the badge is a summary, the blurb says what
 * is actually missing. Nothing here is at "tested" yet, because no landlord
 * has been through the OS end to end - that is what the pilot is for.
 *
 * Positions are a first layout; the editor moves them and saves.
 */
const X = 300;
const ROW = 190;
/** Row 0 is the spine. -1 runs alongside it, -2 above that, 1 is the loop back. */
const n = (p: Omit<ProcessNode, "x" | "y"> & { col: number; row?: number }): ProcessNode => {
  const { col, row = 0, ...rest } = p;
  return { ...rest, x: 60 + col * X, y: 500 + row * ROW };
};

export const LANDLORD_PROCESS: ProcessMap = {
  audience: "landlord",
  title: "The landlord process",
  blurb:
    "From the valuation enquiry landing to the property being let: both ways a landlord reaches us, every screen and email on the way, and what happens at each of the three points where it stalls.",
  version: 1,
  nodes: [
    /* ── The two front doors ─────────────────────────────────────────── */
    n({ id: "enquiry", kind: "trigger", lane: "spine", col: 0, status: "live", title: "Valuation enquiry", blurb: "GetAgent, OnTheMarket, Rightmove or the website. In the lead book within five minutes of REX seeing it. They have almost certainly asked two other agents at the same time.", trigger: { on: "rex.lead.created" }, href: "/leads?side=landlord" }),
    n({ id: "added", kind: "trigger", lane: "side", col: 0, row: -1, status: "live", title: "Landlord added by hand", blurb: "A call, a referral, a chat at a viewing. Typed in on Add new lead; it writes to the OS and pushes the contact to REX.", trigger: { on: "contact.added" }, href: "/leads?new=1" }),
    n({ id: "bond", kind: "trigger", lane: "side", col: 0, row: -2, status: "planned", title: "Found by Bond", blurb: "The prospecting workspace: a landlord whose tenancy is near its anniversary, flagged before they go looking. LOCKED for the pilot - it names properties, not people, until the Land Registry route is built.", href: "/tools" }),

    n({ id: "lead", kind: "screen", lane: "spine", col: 1, status: "live", title: "The landlord lead", blurb: "Their enquiry in full, what the portal told us about the property, the map pin, and the track along the bottom. Redesigned 11 Sep and pushed; no landlord has been worked through it start to finish yet.", href: "/leads?side=landlord" }),

    /* ── Reaching them ───────────────────────────────────────────────── */
    n({ id: "first-contact", kind: "screen", lane: "spine", col: 2, status: "live", title: "Log the first contact", blurb: "Call, text, WhatsApp or email, then how it went, then whether they booked - four frames inside the Next up card. The rail reads itself from what is logged rather than from anybody ticking a box.", href: "/leads?side=landlord" }),
    n({ id: "first-email", kind: "email", lane: "side", col: 2, row: -1, status: "planned", title: "Thanks for asking - here is what happens next", blurb: "Straight after the enquiry, before anyone rings. What we do, what the visit involves, and a slot to pick. NOT WRITTEN: today the first thing a landlord hears is the phone.", trigger: { on: "rex.lead.created", after: "straight away" } }),

    n({ id: "answered", kind: "decision", lane: "spine", col: 3, status: "live", title: "Did they answer?", blurb: "Three attempts is the rule the track is built around. Answered goes to booking; silence goes to nurture rather than to nothing.", trigger: { on: "lead.contacted" } }),

    n({ id: "nurture", kind: "screen", lane: "nurture", col: 3, row: 1, status: "live", title: "Send to nurture", blurb: "From the lead's own hero, with a sheet that asks what has actually been tried before it lets go. Built and pushed 13 Sep.", href: "/leads?side=landlord" }),
    n({ id: "nurture-1", kind: "email", lane: "nurture", col: 4, row: 1, status: "planned", title: "Gone quiet: the sequence", blurb: "Three emails over six weeks - what we do, what their property might let for, and a last one that says we will leave it there. WRITTEN AS GISTS ONLY: Francesca has the copy to write, and the sender name is still James's call." }),
    n({ id: "nurture-back", kind: "decision", lane: "nurture", col: 5, row: 1, status: "planned", title: "Back in touch?", blurb: "A reply or a click puts them back on the spine at booking. Nothing captures that yet - today it is an agent noticing." }),

    /* ── The appraisal ───────────────────────────────────────────────── */
    n({ id: "booked", kind: "trigger", lane: "spine", col: 4, status: "live", title: "Appraisal booked", blurb: "Booked from the lead: the diary shows the day around it and how far it is from the last appointment. The record becomes a market appraisal from here.", trigger: { on: "appraisal.booked" }, href: "/market-appraisals" }),
    n({ id: "confirm-email", kind: "email", lane: "spine", col: 5, status: "live", title: "Appointment confirmed", blurb: "Straight away: when, who is coming, how long it takes and what to have to hand. This one genuinely sends.", emailId: "appraisal-confirm", trigger: { on: "appraisal.booked", after: "straight away" } }),
    n({ id: "portal-invite", kind: "email", lane: "side", col: 5, row: -1, status: "built", title: "Open your property file", blurb: "Their way into the landlord portal, sent with the booking. Built; nobody has ever signed in.", emailId: "landlord-deck-invite", trigger: { on: "appraisal.booked", after: "straight away" } }),
    n({ id: "pre-deck", kind: "email", lane: "spine", col: 6, status: "live", title: "Before the visit", blurb: "The day before: a short deck so they know who is turning up and what we do. Runs on the daily sweep.", emailId: "appraisal-pre", trigger: { on: "appraisal.tomorrow", after: "1 day before" } }),
    n({ id: "video", kind: "email", lane: "side", col: 6, row: -1, status: "live", title: "Record a video", blurb: "To the AGENT, not the landlord: scan the code and record a hello on your phone, and it goes out with the deck.", emailId: "appraisal-video-chase", trigger: { on: "appraisal.booked", after: "1 day before" } }),

    n({ id: "visit", kind: "trigger", lane: "spine", col: 7, status: "live", title: "The visit", blurb: "The agent walks the property with the deck on a tablet. Comparables, what has let nearby, the market data.", trigger: { on: "appraisal.visited" }, href: "/market-appraisals" }),
    n({ id: "valuation", kind: "screen", lane: "spine", col: 8, status: "live", title: "Record the valuation", blurb: "The rent, the service, the fee and anything worth writing down. Everything after this is built from these figures - nothing downstream can be right if this is skipped.", href: "/market-appraisals" }),
    n({ id: "post-deck", kind: "email", lane: "spine", col: 9, status: "live", title: "After the visit", blurb: "The deck again with the figure in it, and the button that opens the terms. Sends today.", emailId: "appraisal-post", trigger: { on: "appraisal.valued", after: "same day" } }),

    n({ id: "decision", kind: "decision", lane: "spine", col: 10, status: "live", title: "Do they instruct us?", blurb: "Yes goes to the terms. No is marked as lost on the file and drops into a win-back campaign.", trigger: { on: "appraisal.decided" } }),
    n({ id: "lost", kind: "email", lane: "nurture", col: 10, row: 1, status: "planned", title: "Win-back: went elsewhere, fee, or not yet", blurb: "Five sequences exist as gists - another agent, fee too high, valuation too low, not ready, self-managing. NOT WRITTEN, and nothing sends until the sender name is decided." }),

    /* ── The terms ───────────────────────────────────────────────────── */
    n({ id: "terms", kind: "screen", lane: "spine", col: 11, status: "built", title: "Sign the terms of business", blurb: "Pre-filled from the valuation and signed through DocuSeal. The template and the webhook are proven on production. SENDING IS LOCKED until James and Susan have been through what the contract asks for.", trigger: { on: "terms.sent" } }),
    n({ id: "terms-chase", kind: "email", lane: "nurture", col: 12, row: 1, status: "written", title: "Terms still to sign", blurb: "A landlord who said yes and has not signed. The words exist in the catalogue; nothing fires it on a schedule yet.", emailId: "terms-chase", trigger: { on: "terms.unsigned", after: "3 days" } }),
    n({ id: "details-form", kind: "screen", lane: "side", col: 12, row: -1, status: "planned", title: "Landlord and property details", blurb: "Susan's ask, 1 Sep: sign first, then the details - who owns it, where the meters are, non-resident landlord, no gas. Their file stays shut until it is filled in. NOT BUILT, and it waits on the same session as the contract." }),
    n({ id: "signed", kind: "trigger", lane: "spine", col: 12, status: "built", title: "Terms signed", blurb: "The signed copy lands on the file, pushes to REX and starts the take-on. Proven in the sandbox, never run for a real landlord.", trigger: { on: "terms.signed" } }),

    /* ── Take-on ─────────────────────────────────────────────────────── */
    n({ id: "takeon", kind: "screen", lane: "spine", col: 13, status: "live", title: "Take-on and photos", blurb: "Booked into the diary, with the weather on the day it suggests. Photographs and the property's details.", href: "/market-appraisals" }),
    n({ id: "tmke", kind: "note", lane: "side", col: 13, row: -1, status: "planned", title: "Professional photos with Jack", blurb: "Danielle's ask, 11 Sep: a banner offering TMKE's photography, booking into Jack's diary and creating the job in the videography CRM. NOT BUILT - it needs Jack's diary link from James." }),
    n({ id: "compliance-docs", kind: "screen", lane: "spine", col: 14, status: "live", title: "AML and the certificates", blurb: "Drop the files in and the OS works out what each one is and when it expires. EPC, gas and electrical on every home; alarms, fire, PAT and legionella on an HMO.", href: "/compliance" }),
    n({ id: "description", kind: "screen", lane: "spine", col: 15, status: "planned", title: "Write the description", blurb: "Danielle, 11 Sep: there is nowhere in the appraisal that asks for one, so a listing reaches the portals with whatever REX happened to hold. A description step with an AI draft. NOT BUILT." }),

    /* ── On the market ───────────────────────────────────────────────── */
    n({ id: "push-live", kind: "screen", lane: "spine", col: 16, status: "designed", title: "Push it live", blurb: "Asks first, then names each portal in turn - Rightmove, OnTheMarket, Zoopla - and finishes with the confetti. The record moves to On market; the write into REX itself still waits on the allowlist.", href: "/listings" }),
    n({ id: "live-email", kind: "email", lane: "spine", col: 17, status: "planned", title: "Your property is live", blurb: "The links to all three portals, the photographs as a landlord sees them, and what happens now. NOT WRITTEN - the one email a landlord most wants on the day.", trigger: { on: "listing.published", after: "straight away" } }),
    n({ id: "portal-home", kind: "screen", lane: "side", col: 17, row: -1, status: "reworked", title: "The landlord portal", blurb: "Their own file: where it is up to, the journey, documents, maintenance and messages. Rebuilt 11-12 Sep and pushed. 0 landlords have ever signed in.", href: "/landlord/demo?from=admin" }),
    n({ id: "sign-in", kind: "email", lane: "side", col: 18, row: -1, status: "live", title: "Sign-in link", blurb: "No password: the link signs them in, works once and lasts a day.", emailId: "landlord-sign-in", trigger: { on: "landlord.sign-in.requested" } }),

    n({ id: "viewings", kind: "trigger", lane: "spine", col: 18, status: "live", title: "Viewings happen", blurb: "Booked against the listing. The landlord's own file shows them; the agent sees the diary.", trigger: { on: "viewing.booked" }, href: "/viewings" }),
    n({ id: "feedback", kind: "email", lane: "spine", col: 19, status: "planned", title: "How the viewings went", blurb: "What the applicants said, week by week, and what it means for the rent. NOT BUILT, and worse: 29 viewings have been and gone with no feedback recorded anywhere, so there is nothing to send.", trigger: { on: "viewing.feedback", after: "weekly" } }),

    /* ── The offer ───────────────────────────────────────────────────── */
    n({ id: "offer", kind: "email", lane: "spine", col: 20, status: "built", title: "An offer on your property", blurb: "The figure, the applicants, what referencing will check. HIDDEN FOR THE PILOT: the button said sent and nothing left, and the landlord on it was a placeholder address.", trigger: { on: "offer.received", after: "straight away" } }),
    n({ id: "landlord-says", kind: "decision", lane: "spine", col: 21, status: "planned", title: "Accept or decline?", blurb: "Today it comes back by phone and an agent types it in. The link that puts it to them is written and gated.", trigger: { on: "offer.decided" } }),
    n({ id: "declined", kind: "email", lane: "nurture", col: 21, row: 1, status: "planned", title: "Back on the market", blurb: "Declined: what we learned, and what we would change. Straight back to viewings rather than silence. NOT WRITTEN." }),

    /* ── The deal ────────────────────────────────────────────────────── */
    n({ id: "accepted", kind: "trigger", lane: "spine", col: 22, status: "live", title: "Offer accepted", blurb: "The application starts in Propoly. From here the landlord's file follows the deal's own stages.", trigger: { on: "propoly.deal.started" }, href: "/applications" }),
    n({ id: "referencing", kind: "trigger", lane: "spine", col: 23, status: "live", title: "Referencing", blurb: "Propoly runs it. Nothing is asked of the landlord here, and the portal says so rather than leaving them wondering.", trigger: { on: "propoly.deal.referencing" } }),
    n({ id: "plc", kind: "screen", lane: "spine", col: 24, status: "built", title: "The compliance check", blurb: "Every certificate has to be on file before the pack goes to pre-tenancy. Two cases exist and neither has been run end to end.", href: "/plc", trigger: { on: "propoly.deal.plc" } }),
    n({ id: "cert-chase", kind: "email", lane: "nurture", col: 24, row: 1, status: "built", title: "Certificate renewal", blurb: "Their agent copied in. Built, and the chase switch is off - nothing goes out until it is armed.", emailId: "compliance-chase-landlord", trigger: { on: "certificate.expiring", after: "60 days before" } }),
    n({ id: "agreement", kind: "screen", lane: "spine", col: 25, status: "planned", title: "The tenancy agreement", blurb: "Signed by both sides. DocuSeal is proven; sending is locked with the terms.", trigger: { on: "propoly.deal.tenancy_agreement" } }),

    /* ── Let ─────────────────────────────────────────────────────────── */
    n({ id: "let", kind: "trigger", lane: "spine", col: 26, status: "built", title: "Let agreed, moving in", blurb: "Keys, inventory, check-in. The listing moves to let agreed and the property joins the managed book.", trigger: { on: "propoly.deal.move_day" } }),
    n({ id: "let-email", kind: "email", lane: "spine", col: 27, status: "planned", title: "Your property is let", blurb: "Who is moving in, the rent, the dates, when the first payment reaches them and who looks after it from here. NOT WRITTEN. The end of this map and the start of the next one.", trigger: { on: "tenancy.started", after: "straight away" } }),

    /* ── After the let: what the portal becomes ──────────────────────── */
    n({ id: "managed", kind: "note", lane: "side", col: 27, row: -1, status: "reworked", title: "The file becomes their management hub", blurb: "Rent and statements, certificates as they renew, repairs, inspections. The portal's own pages are built and nobody has signed in yet.", href: "/landlord/demo?from=admin" }),
    n({ id: "repair", kind: "email", lane: "side", col: 28, row: -1, status: "built", title: "A repair at your property", blurb: "Reported, the two ways forward, and a quote to approve when it is over their limit. Built 7 Sep; not one real job has been raised.", emailId: "works-landlord-report", trigger: { on: "works.reported" } }),
    n({ id: "inspection", kind: "email", lane: "side", col: 29, row: -1, status: "built", title: "The visit report", blurb: "How their property is being kept, room by room, and what happens next about each thing found.", emailId: "inspection-landlord-report", trigger: { on: "inspection.reported" } }),
    n({ id: "invoice", kind: "email", lane: "side", col: 30, row: -1, status: "live", title: "Your invoice", blurb: "Raised against the property, worked out from its rent and service.", emailId: "invoice-sent", trigger: { on: "invoice.sent" } }),
  ],
  edges: [
    /* Both doors meet at the lead. */
    { from: "enquiry", to: "lead", kind: "main" },
    { from: "added", to: "lead", kind: "branch", label: "same person, no portal behind them" },
    { from: "bond", to: "lead", kind: "branch", label: "locked for the pilot" },

    { from: "lead", to: "first-contact", kind: "main" },
    { from: "lead", to: "first-email", kind: "branch", label: "before anybody rings" },
    { from: "first-contact", to: "answered", kind: "main" },

    /* Nobody home. */
    { from: "answered", to: "nurture", kind: "branch", label: "three attempts, nothing" },
    { from: "nurture", to: "nurture-1", kind: "main" },
    { from: "nurture-1", to: "nurture-back", kind: "main" },
    { from: "nurture-back", to: "booked", kind: "return", label: "they come back" },

    { from: "answered", to: "booked", kind: "main", label: "yes, come round" },
    { from: "booked", to: "confirm-email", kind: "main" },
    { from: "booked", to: "portal-invite", kind: "branch" },
    { from: "confirm-email", to: "pre-deck", kind: "main" },
    { from: "booked", to: "video", kind: "branch", label: "to the agent" },
    { from: "pre-deck", to: "visit", kind: "main" },
    { from: "visit", to: "valuation", kind: "main" },
    { from: "valuation", to: "post-deck", kind: "main" },
    { from: "post-deck", to: "decision", kind: "main" },

    /* No. */
    { from: "decision", to: "lost", kind: "branch", label: "went elsewhere" },

    /* Yes. */
    { from: "decision", to: "terms", kind: "main", label: "instruct us" },
    { from: "terms", to: "signed", kind: "main" },
    { from: "terms", to: "terms-chase", kind: "branch", label: "unsigned after three days" },
    { from: "terms-chase", to: "signed", kind: "return" },
    { from: "signed", to: "details-form", kind: "branch", label: "then the details" },
    { from: "signed", to: "takeon", kind: "main" },
    { from: "takeon", to: "tmke", kind: "branch" },
    { from: "takeon", to: "compliance-docs", kind: "main" },
    { from: "compliance-docs", to: "description", kind: "main" },
    { from: "description", to: "push-live", kind: "main" },
    { from: "push-live", to: "live-email", kind: "main" },
    { from: "push-live", to: "portal-home", kind: "branch" },
    { from: "portal-home", to: "sign-in", kind: "branch" },
    { from: "live-email", to: "viewings", kind: "main" },
    { from: "viewings", to: "feedback", kind: "main" },
    { from: "feedback", to: "offer", kind: "main" },
    { from: "offer", to: "landlord-says", kind: "main" },
    { from: "landlord-says", to: "declined", kind: "branch", label: "no" },
    { from: "declined", to: "viewings", kind: "return", label: "back on the market" },
    { from: "landlord-says", to: "accepted", kind: "main", label: "yes" },
    { from: "accepted", to: "referencing", kind: "main" },
    { from: "referencing", to: "plc", kind: "main" },
    { from: "plc", to: "cert-chase", kind: "branch", label: "something expiring" },
    { from: "plc", to: "agreement", kind: "main" },
    { from: "agreement", to: "let", kind: "main" },
    { from: "let", to: "let-email", kind: "main" },
    { from: "let-email", to: "managed", kind: "branch", label: "and from here, management" },
    { from: "managed", to: "repair", kind: "branch" },
    { from: "managed", to: "inspection", kind: "branch" },
    { from: "managed", to: "invoice", kind: "branch" },
  ],
};
