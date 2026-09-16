import type { ProcessMap, ProcessNode } from "@/lib/process/types";

/**
 * The tenant process, rebuilt 14 Sep 2026 after James read the first draft.
 *
 * ── What was wrong with it ────────────────────────────────────────────────
 *
 * It began at "viewing booked". A booked viewing is a long way in: by then
 * we have already met them, asked what they are after, sent them homes and
 * had one come back as "I'd like to see that one". Starting there made the
 * map look tidy and made the front of the process invisible, which is the
 * half that is mostly unbuilt.
 *
 * It was also thin in the middle and at the end. A viewing was one box: no
 * confirmation, no reminder on the day, no no-show, no feedback. An offer
 * only ever got accepted - a declined offer simply fell off the map, when
 * in truth it is the moment a person most needs to hear from us, and the
 * moment the whole search starts again. Referencing was one box for the
 * longest, most intrusive job a tenant does.
 *
 * ── The shape now ─────────────────────────────────────────────────────────
 *
 * TWO FRONT DOORS, and they are not the same conversation, so they are not
 * the same first email:
 *
 *   Tenant enquiry  they ask about ONE property. The reply is about that
 *                   property: is it still there, when can you see it.
 *   Tenant added    no property yet - registered by an agent, or they asked
 *                   to be kept in mind. The first email is about the search.
 *
 * Both converge on qualifying, and from there TWO THINGS RUN AT ONCE:
 *
 *   the spine   the property hunt: matches → viewing → feedback → apply →
 *               the landlord's answer → the deal → move-in day
 *   alongside   the passport, the account and the tenant area. It can be
 *               done the day they enquire or the day they apply; nothing on
 *               the spine waits for it, and nothing in the passport waits
 *               for the spine.
 *
 * THE LOOPS ARE THE POINT. Four things send a person back to matching
 * rather than off the end of the map: no reply to the homes we sent, a
 * viewing they didn't like, a no-show, and an offer the landlord declined.
 * Each has an email against it, because the alternative is silence.
 *
 * ── How far along, and what the tenant sees ───────────────────────────────
 *
 * Every step carries two more things, added 14 Sep 2026:
 *
 *   status   where it is on the nine-rung ladder in lib/process/types, from
 *            Planned to Live and tested. Set here at the LOWEST rung the
 *            thing can honestly claim - a form that exists but is not joined
 *            to a real listing is Designed, not Live - because the board is
 *            worth nothing the moment it flatters us.
 *   stage    the portal stage it belongs to (lib/tenant-journey), so opening
 *            a step shows what the tenant's own portal is telling them at
 *            that moment, and a link that opens the portal there. A step
 *            with no stage is one nothing changes for them at.
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

export const TENANT_PROCESS: ProcessMap = {
  audience: "tenant",
  title: "The tenant process",
  blurb: "From the first enquiry to move-in day: both ways a tenant reaches us, every screen they meet, every email that goes to them, and what happens at each of the four points where it stalls.",
  version: 2,
  nodes: [
    /* ── The two front doors ─────────────────────────────────────────── */
    n({ id: "enquiry", kind: "trigger", lane: "spine", col: 0, status: "live", stage: "enquired", title: "Tenant enquiry", blurb: "They ask about ONE property - Rightmove, Zoopla, the website or a call. It lands in the lead book within five minutes.", trigger: { on: "rex.lead.created" }, href: "/leads" }),
    n({ id: "added", kind: "trigger", lane: "side", col: 0, row: -1, status: "live", title: "Tenant added", blurb: "No property yet: an agent registers them, or they ask to be kept in mind. A search, not an enquiry - so a different first email.", trigger: { on: "contact.added" }, href: "/leads" }),

    n({ id: "enquiry-reply", kind: "email", lane: "spine", col: 1, status: "written", emailId: "tenant-enquiry-reply", stage: "enquired", title: "About the home you asked about", blurb: "Straight away. Is it still available, what it costs to move in, the next viewing slots, and the passport.", trigger: { on: "rex.lead.created", after: "straight away" } }),
    n({ id: "added-welcome", kind: "email", lane: "side", col: 1, row: -1, status: "written", emailId: "tenant-added-welcome", title: "Let's find you a home", blurb: "No property to talk about, so it leads on the search: what we need to know, what we have on, and the passport.", trigger: { on: "contact.added", after: "straight away" } }),

    n({ id: "qualify", kind: "screen", lane: "spine", col: 2, status: "live", title: "Qualify them", blurb: "Budget, area, move date, pets, who is moving in. Five minutes here is what the matching runs on - without it every send is a guess.", href: "/leads" }),

    /* ── Alongside: the passport, the account, the tenant area ────────── */
    n({ id: "passport-invite", kind: "email", lane: "side", col: 2, row: -1, status: "built", title: "Start your passport", blurb: "Sent from a lead or a viewing, whenever it suits - not a stage on the spine. Fill it in once and it answers every application.", emailId: "tenant-passport-invite", trigger: { on: "tenant.passport.invited", after: "straight away" } }),
    n({ id: "passport", kind: "screen", lane: "side", col: 3, row: -1, status: "live", stage: "passport", title: "The passport", blurb: "One question at a time; the card fills in as they type. Nothing reaches a landlord until they apply.", href: "/preview/{token}/passport" }),
    n({ id: "account", kind: "screen", lane: "side", col: 4, row: -1, status: "live", stage: "passport", title: "Create the account", blurb: "The card is made, their email is the username, they choose a password.", href: "/preview/{token}/passport" }),
    n({ id: "portal", kind: "screen", lane: "side", col: 5, row: -1, status: "live", stage: "passport", title: "The tenant area", blurb: "While they are looking it is all property. It opens up as the deal moves: my tenancy, documents, payments, maintenance.", href: "/tenant/demo?from=admin" }),
    n({ id: "sign-in", kind: "email", lane: "side", col: 6, row: -1, status: "live", stage: "passport", title: "Sign-in link", blurb: "For a tenant who arrives from a Propoly deal without a password.", emailId: "tenant-sign-in", trigger: { on: "tenant.sign-in.requested" } }),

    n({ id: "not-started", kind: "decision", lane: "nurture", col: 3, row: -2, status: "planned", title: "Passport not started?", blurb: "Two days after the invite and nothing typed.", trigger: { on: "passport.invited", after: "2 days" } }),
    n({ id: "nudge-1", kind: "email", lane: "nurture", col: 4, row: -2, status: "written", emailId: "tenant-passport-nudge-1", title: "Nudge: two days", blurb: "A short reminder with the same link.", trigger: { on: "passport.not-started", after: "2 days" } }),
    n({ id: "nudge-2", kind: "email", lane: "nurture", col: 5, row: -2, status: "written", emailId: "tenant-passport-nudge-2", title: "Nudge: a week", blurb: "Why the passport matters: one form for every property.", trigger: { on: "passport.not-started", after: "7 days" } }),

    /* ── The hunt ────────────────────────────────────────────────────── */
    n({ id: "matches", kind: "email", lane: "spine", col: 3, status: "written", emailId: "tenant-matches", stage: "matched", title: "Homes that fit", blurb: "The properties that match what they told us, the same day they told us. The picker exists on the lead (Email properties); sending is off until the outbound switch is on. Copy written; the picker still sends its own plain note.", trigger: { on: "tenant.qualified", after: "same day" } }),
    n({ id: "pick", kind: "decision", lane: "spine", col: 4, status: "planned", stage: "matched", title: "Which ones do they want to see?", blurb: "They reply, or tap the one they like. Nothing captures that tap yet - today it comes back as an email to the branch and an agent types it in.", trigger: { on: "matches.sent" } }),

    n({ id: "no-reply", kind: "decision", lane: "nurture", col: 5, row: 1, status: "planned", stage: "matched", title: "Nothing back?", blurb: "Homes sent, silence for four days. Either we sent the wrong things or they have gone quiet - both are worth one email.", trigger: { on: "matches.sent", after: "4 days" } }),
    n({ id: "matches-again", kind: "email", lane: "nurture", col: 6, row: 1, status: "written", emailId: "tenant-matches-again", stage: "matched", title: "Anything close?", blurb: "Have the criteria changed, and here is what has come on since.", trigger: { on: "matches.no-reply", after: "4 days" } }),

    /* ── The viewing ─────────────────────────────────────────────────── */
    n({ id: "viewing-booked", kind: "trigger", lane: "spine", col: 5, status: "live", stage: "viewing", title: "Viewing booked", blurb: "Booked into REX's diary; the OS has it in the viewings ledger within the hour.", trigger: { on: "viewing.booked" }, href: "/viewings" }),
    n({ id: "viewing-confirmed", kind: "email", lane: "spine", col: 6, status: "live", emailId: "tenant-passport-invite", stage: "viewing", title: "Viewing confirmed", blurb: "Sent the moment an agent books it, from their own Outlook, with the calendar file: the address, the time, who is meeting them, and the passport. It is the same email as Start your passport. Moving or cancelling is by reply; a self-serve link still needs building.", trigger: { on: "viewing.booked", after: "straight away" } }),
    n({ id: "viewing-reminder", kind: "email", lane: "spine", col: 7, status: "written", emailId: "viewing-reminder", stage: "viewing", title: "Your viewing is today", blurb: "7am on the day: the time, the address on a map, the agent's mobile. The one email that stops a no-show. It needs a cron of its own.", trigger: { on: "viewing.day", after: "7am on the day" } }),
    n({ id: "viewing-done", kind: "trigger", lane: "spine", col: 8, status: "live", stage: "viewed", title: "The viewing happened", blurb: "The agent closes it on Viewings with the outcome: loved it, not for them, offer received.", trigger: { on: "viewing.done" }, href: "/viewings" }),

    n({ id: "no-show", kind: "decision", lane: "nurture", col: 8, row: 1, status: "planned", stage: "viewing", title: "Didn't turn up?", blurb: "Closed as a no-show. Nobody wastes a slot twice, and nobody is written off for one missed morning.", trigger: { on: "viewing.no-show" } }),
    n({ id: "rebook", kind: "email", lane: "nurture", col: 9, row: 1, status: "written", emailId: "viewing-rebook", stage: "viewing", title: "Shall we rebook?", blurb: "Two lines and three new slots.", trigger: { on: "viewing.no-show", after: "2 hours" } }),

    n({ id: "feedback", kind: "email", lane: "spine", col: 9, status: "written", emailId: "viewing-feedback", stage: "viewed", title: "How was it?", blurb: "Two hours after, while they still remember it. One tap: loved it, not for me, or in between. The answer goes to the landlord and back into the matching.", trigger: { on: "viewing.done", after: "2 hours" } }),
    n({ id: "interested", kind: "decision", lane: "spine", col: 10, status: "planned", stage: "viewed", title: "Do they want it?", blurb: "Yes goes to the application. No goes back to matching with what we learned from the viewing.", trigger: { on: "viewing.feedback" } }),
    n({ id: "not-for-them", kind: "email", lane: "nurture", col: 10, row: 1, status: "written", emailId: "viewing-not-for-them", stage: "matched", title: "Not that one - try these", blurb: "Same day. What they said they didn't like, and three that don't have it.", trigger: { on: "viewing.feedback", after: "same day" } }),

    /* ── The application and the landlord's answer ────────────────────── */
    n({ id: "apply", kind: "screen", lane: "spine", col: 11, status: "designed", stage: "offer", title: "Apply for the property", blurb: "The offer, every adult who will live there, right to rent, the landlord reference and the guarantor question. One tap if the passport is done.", href: "/tenant/apply?from=admin" }),
    n({ id: "apply-received", kind: "email", lane: "spine", col: 12, status: "written", emailId: "application-received", stage: "offer", title: "We have your application", blurb: "What we do with it, when they will hear, and what to have ready if it is accepted.", trigger: { on: "application.received", after: "straight away" } }),
    n({ id: "landlord-answer", kind: "decision", lane: "spine", col: 13, status: "planned", stage: "offer", title: "Accepted or declined?", blurb: "The landlord's answer. The link that puts the offer to them is written but gated; today it comes back by phone and an agent types it in.", trigger: { on: "application.decided" } }),

    n({ id: "declined", kind: "email", lane: "nurture", col: 13, row: 1, status: "written", emailId: "application-declined", stage: "declined", title: "Not this one - and here is what is next", blurb: "Same day, never silence. Why, if we know it. Then straight back to matching with a fresh set attached - a declined offer is the start of the search again, not the end of it.", trigger: { on: "application.declined", after: "same day" } }),

    n({ id: "accepted", kind: "trigger", lane: "spine", col: 14, status: "live", stage: "deal_started", title: "Offer accepted", blurb: "The deal starts in Propoly; the portal follows its eight stages from here.", trigger: { on: "propoly.deal.started" } }),
    n({ id: "accepted-email", kind: "email", lane: "spine", col: 15, status: "written", emailId: "application-its-yours", stage: "deal_started", title: "It's yours", blurb: "The holding fee, what it does and what happens to it, and the week ahead in order.", trigger: { on: "propoly.deal.started", after: "straight away" } }),
    n({ id: "holding-fee", kind: "screen", lane: "spine", col: 16, status: "live", stage: "holding_fee", title: "Holding fee", blurb: "Taken through Propoly. The portal says what it is for and where it goes. A holding fee is never an invoice.", href: "/tenant/demo/tenancy?from=admin", trigger: { on: "propoly.deal.holding_fee" } }),

    /* ── Referencing ─────────────────────────────────────────────────── */
    n({ id: "referencing-invite", kind: "email", lane: "spine", col: 17, status: "written", emailId: "referencing-invite", stage: "referencing", title: "Time to get referenced", blurb: "What is asked, why, how long it takes, and what to have to hand - payslips, the last landlord's email, dates.", trigger: { on: "propoly.deal.referencing", after: "straight away" } }),
    n({ id: "referencing-form", kind: "screen", lane: "spine", col: 18, status: "planned", stage: "referencing", title: "Referencing: their details", blurb: "THE BIGGEST GAP ON THIS MAP. Employer and income, the last two years of addresses and landlords, the credit question - for every adult. Today this happens outside the OS and the portal only reports the stage. The screen needs designing and the provider deciding.", href: "/tenant/demo/tenancy?from=admin" }),
    n({ id: "guarantor-invite", kind: "email", lane: "side", col: 18, row: -1, status: "written", emailId: "guarantor-invite", stage: "referencing", title: "Your guarantor", blurb: "When one is needed: what they are agreeing to, and their own link.", trigger: { on: "referencing.guarantor.needed" } }),
    n({ id: "guarantor-form", kind: "screen", lane: "side", col: 19, row: -1, status: "planned", stage: "referencing", title: "The guarantor's form", blurb: "The guarantor's own details and their own referencing. A separate person with a separate link - never the tenant filling it in for them." }),

    n({ id: "no-references", kind: "decision", lane: "nurture", col: 18, row: 1, status: "planned", stage: "referencing", title: "Nothing filled in?", blurb: "Three days from the invite and the form is empty. Referencing is the stage deals die at.", trigger: { on: "propoly.deal.referencing", after: "3 days" } }),
    n({ id: "referencing-chase", kind: "email", lane: "nurture", col: 19, row: 1, status: "written", emailId: "referencing-chase", stage: "referencing", title: "Chase: your references", blurb: "What is still missing, by name, and how long it will take them.", trigger: { on: "referencing.stalled", after: "3 days" } }),

    n({ id: "references-back", kind: "trigger", lane: "spine", col: 19, status: "live", stage: "referencing", title: "References back", blurb: "Employer, previous landlord and credit are in. The OS sees the stage move.", trigger: { on: "propoly.deal.references_back" } }),
    n({ id: "plc", kind: "trigger", lane: "spine", col: 20, status: "live", stage: "plc", title: "Compliance checks", blurb: "The property's certificates and the landlord's documents. Nothing for the tenant here - and the portal says so rather than leaving them wondering.", trigger: { on: "propoly.deal.plc" }, href: "/plc" }),

    /* ── Signing and moving in ───────────────────────────────────────── */
    n({ id: "deposit", kind: "screen", lane: "spine", col: 21, status: "built", stage: "deposit", title: "The deposit", blurb: "What is due, how it is protected, and the scheme's own paperwork. The portal shows the stage; the payment is outside the OS.", href: "/tenant/demo/payments?from=admin", trigger: { on: "propoly.deal.deposit" } }),
    n({ id: "agreement", kind: "screen", lane: "spine", col: 22, status: "planned", stage: "tenancy_agreement", title: "Sign the agreement", blurb: "The tenancy agreement, signed in the portal through DocuSeal. The template and the webhook are proven; sending is still locked.", href: "/tenant/demo/documents?from=admin", trigger: { on: "propoly.deal.tenancy_agreement" } }),
    n({ id: "first-rent", kind: "screen", lane: "spine", col: 23, status: "built", stage: "rent_payment", title: "First month's rent", blurb: "Cleared funds before the keys. The portal says the figure and the date it has to be in by.", href: "/tenant/demo/payments?from=admin", trigger: { on: "propoly.deal.rent_payment" } }),
    n({ id: "move-in", kind: "trigger", lane: "spine", col: 24, status: "built", stage: "move_day", title: "Move-in day", blurb: "Keys, inventory and check-in. The portal stops being an application and becomes their tenancy.", trigger: { on: "propoly.deal.move_day" } }),
  ],
  edges: [
    /* The two front doors meet at qualifying. */
    { from: "enquiry", to: "enquiry-reply", kind: "main" },
    { from: "added", to: "added-welcome", kind: "main" },
    { from: "enquiry-reply", to: "qualify", kind: "main" },
    { from: "added-welcome", to: "qualify", kind: "branch", label: "same person, different opener" },

    /* Alongside: the passport can start from either door, at any time. */
    { from: "qualify", to: "passport-invite", kind: "branch", label: "at any point" },
    { from: "passport-invite", to: "passport", kind: "main" },
    { from: "passport", to: "account", kind: "main" },
    { from: "account", to: "portal", kind: "main" },
    { from: "sign-in", to: "portal", kind: "branch", label: "signs in" },
    { from: "portal", to: "apply", kind: "return", label: "one-tap application" },

    { from: "passport-invite", to: "not-started", kind: "branch", label: "no reply" },
    { from: "not-started", to: "nudge-1", kind: "main" },
    { from: "nudge-1", to: "nudge-2", kind: "main" },
    { from: "nudge-2", to: "passport", kind: "return", label: "back to the passport" },

    /* The hunt. */
    { from: "qualify", to: "matches", kind: "main" },
    { from: "matches", to: "pick", kind: "main" },
    { from: "pick", to: "viewing-booked", kind: "main" },
    { from: "matches", to: "no-reply", kind: "branch", label: "silence" },
    { from: "no-reply", to: "matches-again", kind: "main" },
    { from: "matches-again", to: "matches", kind: "return", label: "back to matching" },

    /* The viewing. */
    { from: "viewing-booked", to: "viewing-confirmed", kind: "main" },
    { from: "viewing-confirmed", to: "viewing-reminder", kind: "main" },
    { from: "viewing-reminder", to: "viewing-done", kind: "main" },
    { from: "viewing-reminder", to: "no-show", kind: "branch", label: "no-show" },
    { from: "no-show", to: "rebook", kind: "main" },
    { from: "rebook", to: "viewing-booked", kind: "return", label: "book another" },

    { from: "viewing-done", to: "feedback", kind: "main" },
    { from: "feedback", to: "interested", kind: "main" },
    { from: "interested", to: "not-for-them", kind: "branch", label: "not for them" },
    { from: "not-for-them", to: "matches", kind: "return", label: "back to matching" },

    /* The application. */
    { from: "interested", to: "apply", kind: "main" },
    { from: "apply", to: "apply-received", kind: "main" },
    { from: "apply-received", to: "landlord-answer", kind: "main" },
    { from: "landlord-answer", to: "declined", kind: "branch", label: "declined" },
    { from: "declined", to: "matches", kind: "return", label: "the search starts again" },
    { from: "landlord-answer", to: "accepted", kind: "main" },

    /* The deal. */
    { from: "accepted", to: "accepted-email", kind: "main" },
    { from: "accepted-email", to: "holding-fee", kind: "main" },
    { from: "holding-fee", to: "referencing-invite", kind: "main" },
    { from: "referencing-invite", to: "referencing-form", kind: "main" },
    { from: "referencing-form", to: "guarantor-invite", kind: "branch", label: "if a guarantor is needed" },
    { from: "guarantor-invite", to: "guarantor-form", kind: "main" },
    { from: "guarantor-form", to: "references-back", kind: "return", label: "joins the references" },
    { from: "referencing-invite", to: "no-references", kind: "branch", label: "nothing filled in" },
    { from: "no-references", to: "referencing-chase", kind: "main" },
    { from: "referencing-chase", to: "referencing-form", kind: "return", label: "back to the form" },
    { from: "referencing-form", to: "references-back", kind: "main" },
    { from: "references-back", to: "plc", kind: "main" },
    { from: "plc", to: "deposit", kind: "main" },
    { from: "deposit", to: "agreement", kind: "main" },
    { from: "agreement", to: "first-rent", kind: "main" },
    { from: "first-rent", to: "move-in", kind: "main" },
  ],
};
