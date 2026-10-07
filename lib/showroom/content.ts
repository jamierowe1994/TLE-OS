/**
 * THE SHOWROOM - every process, from the other person's side of the glass.
 *
 * James, 28 Sep 2026: "a full catalogue of the artefacts that we've already
 * got, as well as a testing area to see what the landlord sees, what the
 * tenant sees, what the agent will see ... in a very visual way." Agents have
 * to send everything to themselves to see a single email today, and most of
 * the journey is not live at once, so nobody can see it end to end. This puts
 * it all in one place: each step, the screen the other person is looking at
 * (the demo, never a real record), every email that goes out at that point,
 * what the agent does to set it off, what is honestly not built yet, and a
 * box to say what is wrong with it.
 *
 * Hidden from agents until Phase 3 (lib/phases); owners and admins see it now.
 *
 * ── Where the facts come from ─────────────────────────────────────────────
 *
 * The emails are the live catalogue (lib/email/tle-emails), rendered with its
 * sample tenant and any edits made in the email builder. How far along each
 * one is comes from the tenant process map (lib/process/tenant), so the two
 * can never disagree: change a status there and it changes here. The screens
 * are the tenant demo (Sophie, lib/tenant-sample) put at the right stage.
 *
 * `{token}` in a screen's href is the onboarding preview token, filled in on
 * the server (lib/preview-token) - the demo passport saves nothing.
 */

import type { TenantStageKey } from "@/lib/tenant-journey";
import { BACK_OFFICE_EMAIL_IDS } from "@/lib/showroom/back-office";
import { VISIT_MOMENTS, repairAt } from "@/lib/showroom/demo-world";

export type ShowroomSide = "tenant" | "landlord" | "agent";

export interface ShowroomScreen {
  label: string;
  /** A demo page. A tenant one opens through the stage switch when `stage` is
   *  set; a landlord one carries its stage in the address (?stage=). */
  href: string;
  stage?: TenantStageKey;
  /** Which frame suits it best to begin with. The viewer can switch. */
  device?: "phone" | "desktop";
}

export interface ShowroomStep {
  id: string;
  title: string;
  /** One or two sentences: what happens here, in the tenant's world. */
  lead: string;
  /** What they see and get, as short lines. */
  sees: string[];
  /** What the agent does in the OS to set it off, and where. */
  agent: { says: string; href?: string };
  screens: ShowroomScreen[];
  /** Catalogue ids, in the order they go. */
  emails: string[];
  /** Agent steps: the pop-up guide (lib/agent-guides) whose screenshots show the screen. */
  guide?: string;
  /** Named honestly: what is not there yet. */
  notYet?: string[];
  /** The back office walkthrough that shows this from every side (lib/showroom/back-office). */
  walkthrough?: { step: string; way?: string; label: string };
}

export const SIDES: { id: ShowroomSide; label: string; says: string; ready: boolean }[] = [
  { id: "tenant", label: "Tenant", says: "From the first email to the day they get the keys.", ready: true },
  { id: "landlord", label: "Landlord", says: "From the valuation enquiry to a let and managed home.", ready: true },
  { id: "agent", label: "Agent", says: "The same journeys from your side of the desk: the screens you work in, the emails you send, and the ones that come to you.", ready: true },
];

export const TENANT_STEPS: ShowroomStep[] = [
  {
    id: "passport",
    title: "The tenant passport",
    lead: "One form, filled in once, that answers every application they will ever make with us. It can be sent the day they enquire or the day they view - nothing waits for it.",
    sees: [
      "An email with a button to their own passport.",
      "One question at a time, with a card that fills in as they type.",
      "If they're employed: full or part-time, zero-hours, and whether they're on probation. Self-employed or a director: how long they've been trading.",
      "Two gentle reminders if they have not started it: after two days and after a week.",
    ],
    agent: { says: "On a tenant lead, press Send passport. On a booked viewing, press Invite to the passport.", href: "/leads?side=tenant" },
    screens: [{ label: "The passport", href: "/preview/{token}/passport", device: "phone" }],
    emails: ["tenant-passport-request", "tenant-passport-nudge-1", "tenant-passport-nudge-2"],
  },
  {
    id: "account",
    title: "Signing up and signing in",
    lead: "The account is made at the end of the passport: their email is the username and they choose a password. After that they sign in with the password, or ask for a link by email.",
    sees: [
      "The last page of the passport, where they choose a password.",
      "The sign-in page, with a password or an emailed link.",
      "A sign-in link email when they ask for one.",
    ],
    agent: { says: "Nothing to press. The tenant does this themselves." },
    screens: [
      { label: "Choosing a password", href: "/preview/{token}/passport", device: "phone" },
      { label: "The sign-in page", href: "/tenant/sign-in", device: "phone" },
    ],
    emails: ["tenant-sign-in"],
    notYet: ["There is no \"your account is ready\" email after they make the account."],
  },
  {
    id: "dashboard",
    title: "The tenant's own area",
    lead: "While they are looking it is all homes. It opens up as the deal moves on: their tenancy, documents, payments and repairs.",
    sees: [
      "Homes that fit their search, and the ones they have viewed.",
      "A line at the top saying where they are up to and what happens next.",
      "More of the area unlocking as the deal moves on.",
    ],
    agent: { says: "Nothing to press. It follows the lead and the deal on its own." },
    screens: [
      { label: "Looking", href: "/tenant/demo", stage: "matched", device: "desktop" },
      { label: "Homes", href: "/tenant/demo/homes", stage: "matched", device: "desktop" },
      { label: "On a phone", href: "/tenant/demo", stage: "matched", device: "phone" },
    ],
    emails: [],
  },
  {
    id: "homes",
    title: "Their first email, and homes that fit",
    lead: "The first thing a tenant hears depends on how they reached us: an enquiry about one home gets an answer about that home, and someone registered with no home in mind gets \"let's find you a home\". Then the homes that fit.",
    sees: [
      "About the home they asked about: is it still there, the rent, and what moving in costs - within five minutes.",
      "\"Let's find you a home\" when an agent adds them with nothing in mind.",
      "The homes the agent picks for them, then a follow-up if they go quiet.",
      "New homes by email, at most once a day, if they save a search in their area.",
    ],
    agent: { says: "Qualify them on the lead, then press Email properties with the homes ticked.", href: "/leads?side=tenant" },
    screens: [{ label: "Homes in their area", href: "/tenant/demo/homes", stage: "matched", device: "desktop" }],
    emails: ["tenant-enquiry-reply", "tenant-added-welcome", "tenant-matches", "tenant-matches-again", "tenant-home-alert"],
  },
  {
    id: "viewing",
    title: "Booking a viewing",
    lead: "The moment the agent books it, the tenant gets a confirmation from the agent's own Outlook, with the address, the time, who is meeting them and a calendar invite.",
    sees: [
      "A confirmation email with the calendar file attached - it is the same email that starts their passport.",
      "The viewing in their own area, with the date and the address.",
      "An email if the viewing is moved or cancelled.",
    ],
    agent: { says: "On a tenant lead, press Book a viewing, check the email and send it. Move or cancel it from Viewings.", href: "/viewings" },
    screens: [{ label: "Their area, viewing booked", href: "/tenant/demo", stage: "viewing", device: "desktop" }],
    emails: ["tenant-passport-invite", "tenant-viewing-booked", "viewing-moved", "viewing-cancelled"],
    notYet: ["The tenant cannot move or cancel a viewing themselves - they reply to the email."],
  },
  {
    id: "on-the-day",
    title: "On the day of the viewing",
    lead: "From 7am on the day they get a reminder with the time, a map and the agent's mobile. If they do not turn up, a friendly \"shall we rebook?\" goes two hours later.",
    sees: [
      "\"Your viewing today\" - the one email that stops a no-show.",
      "\"Shall we rebook?\" if they missed it.",
    ],
    agent: { says: "Nothing for the reminder. For a no-show, press No-show on the viewing.", href: "/viewings" },
    screens: [],
    emails: ["viewing-reminder", "viewing-rebook"],
    notYet: ["There is no reminder the day before."],
  },
  {
    id: "feedback",
    title: "After the viewing: feedback and an offer",
    lead: "Two hours after the viewing they get a link to their own feedback page for the home they saw. They can say it is not for them, ask a question, or make an offer. Or the agent puts the offer in for them, on the phone or sitting down together.",
    sees: [
      "\"How was it?\" with a link to a page about that home.",
      "Make an offer: it starts at the asking rent and can't go above it. Type more and a message says the law bans it.",
      "No term to choose - tenancies are rolling now. Just the day they'd like to move in, from a calendar.",
      "Who's moving in, ticked off their passport by name, and their pets. Untick anyone who isn't coming.",
      "Any works they want done before moving day, which the landlord accepts with the offer.",
      "Their passport answers shown back to confirm, never asked again. If the agent put it in for them, a copy by email to check.",
      "If it is a no, homes nearby at a similar rent straight away.",
    ],
    agent: { says: "Close the viewing on Viewings with how it went. To put an offer in for them, press Put an offer forward on the viewing.", href: "/viewings" },
    screens: [
      { label: "Making an offer", href: "/tenant/demo", stage: "viewed", device: "phone" },
      { label: "The feedback page", href: "/tenant/feedback", device: "phone" },
    ],
    emails: ["viewing-feedback", "tenant-offer-copy", "viewing-not-for-them"],
    notYet: [
      "When they make an offer themselves, only the agent is emailed - the copy only goes when the agent puts it in for them.",
    ],
  },
  {
    id: "apply",
    title: "Applying for the home",
    lead: "The application: the offer, everyone who will live there, right to rent, the last landlord and whether a guarantor is needed. If the passport is done it is one tap.",
    sees: [
      "Their application on the home, in their area.",
      "\"We have your application\" - what happens next, when they will hear, and what the holding fee is.",
    ],
    agent: { says: "The application lands on Applications.", href: "/applications" },
    screens: [{ label: "Their area, offer made", href: "/tenant/demo", stage: "offer", device: "desktop" }],
    emails: ["application-received"],
    notYet: ["The application form is designed but not yet joined to a real listing, so it is not shown here to try."],
  },
  {
    id: "decision",
    title: "Accepted, or not this time",
    lead: "The landlord's answer. A yes starts the deal and tells them about the holding fee. A no is never silence: same day, sorry once, and homes nearby.",
    sees: [
      "\"It's yours\" - the yes, the holding fee, and every step to the keys.",
      "\"Not this time\" - and live homes nearby.",
      "Their area changing to the deal, or back to looking.",
    ],
    agent: { says: "The landlord's answer is set in REX. Once it is a yes, press Hand over to the deal on the application.", href: "/applications" },
    screens: [
      { label: "It's a yes", href: "/tenant/demo", stage: "deal_started", device: "desktop" },
      { label: "Not this time", href: "/tenant/demo", stage: "declined", device: "desktop" },
    ],
    emails: ["application-its-yours", "application-declined"],
  },
  {
    id: "to-the-keys",
    title: "Holding fee, referencing and the keys",
    lead: "From the yes to moving in: the holding fee, referencing (and a guarantor if one is needed), the deposit, the agreement, the first month's rent, and move-in day.",
    sees: [
      "Their area showing each stage in turn, and what it needs from them.",
      "The holding fee explained: what it is for and when it comes back.",
      "Referencing emails: what is asked and why, their guarantor's own link, and a chase if it stalls.",
    ],
    agent: { says: "Kirstie runs this on the Pre-tenancy board. Nothing for the agent to press.", href: "/pre-tenancy" },
    screens: [
      { label: "Holding fee", href: "/tenant/demo/tenancy", stage: "holding_fee", device: "desktop" },
      { label: "Referencing", href: "/tenant/demo/tenancy", stage: "referencing", device: "desktop" },
      { label: "Deposit", href: "/tenant/demo/payments", stage: "deposit", device: "desktop" },
      { label: "The agreement", href: "/tenant/demo/documents", stage: "tenancy_agreement", device: "desktop" },
      { label: "Move-in day", href: "/tenant/demo", stage: "move_day", device: "desktop" },
      { label: "Living there", href: "/tenant/demo", stage: "living", device: "desktop" },
    ],
    emails: ["referencing-invite", "guarantor-invite", "referencing-chase"],
    notYet: [
      "There is no holding fee email of its own - it is explained inside \"It's yours\".",
      "The referencing form and the guarantor's form are not built; referencing happens outside the OS.",
      "No emails yet for the deposit, the agreement, the first rent or move-in day.",
      "Signing the agreement in their area is not switched on yet.",
    ],
  },
  /* Living there (7 Oct 2026): the back office's work, from the tenant's side. */
  {
    id: "repairs",
    title: "Reporting a repair",
    lead: "Once they have the keys, Maintenance opens in their area. They say where and what in their own words, and can see where it has got to. Or they ring, and the office logs it while they talk.",
    sees: [
      "Where it is and what is wrong, in their words. No urgency to pick: a real emergency is told to ring.",
      "What they have reported, with where each one is: with us, being arranged, booked in, done.",
      "Emails as it moves: someone has been found, the date, and \"are you happy?\" once it is done.",
      "If they ring instead, \"We've got your repair\" by email the moment the office logs it.",
    ],
    agent: { says: "It lands on Maintenance. If they ring, press Report a repair while they are on the line.", href: "/maintenance" },
    screens: [
      { label: "Reporting it", href: `/tenant/demo/maintenance?stage=living&story=repair&at=${repairAt("before")}`, device: "phone" },
      { label: "Booked in", href: `/tenant/demo/maintenance?stage=living&story=repair&at=${repairAt("booked")}`, device: "phone" },
      { label: "Was it sorted?", href: `/preview/{token}/back-office/repair?story=repair&at=${repairAt("done")}`, device: "phone" },
    ],
    emails: ["works-tenant-received", "works-tenant-found", "works-tenant-booked", "works-tenant-happy"],
    walkthrough: { step: "repair", way: "portal", label: "Watch a repair from every side" },
    notYet: ["Reporting it in the portal sends them no email yet - it shows in their area as With us."],
  },
  {
    id: "visits-gas",
    title: "Visits and the gas safety",
    lead: "Twice a year we ask to visit, and once a year a gas engineer comes. Both are arranged with them in writing, and the new gas certificate comes to them by email.",
    sees: [
      "An email asking to visit, with a link to pick a time, say none suit, or say no - each the same size.",
      "A confirmation with the date, the time and who is coming.",
      "The engineer's date for the gas safety check.",
      "Their copy of the new gas safety certificate, which they must have within 28 days of the check.",
    ],
    agent: { says: "Visits are booked on Inspections; the gas safety is a planned job on Maintenance.", href: "/inspections" },
    screens: [{ label: "May we come round?", href: `/preview/{token}/back-office/visit?story=visits&at=${VISIT_MOMENTS.indexOf("asked")}`, device: "phone" }],
    emails: ["inspection-tenant-access", "inspection-tenant-booked", "works-tenant-booked", "certificate-shared-tenant"],
    walkthrough: { step: "visits", label: "Watch a visit from every side" },
    notYet: ["Their Documents page does not show their certificates yet - they come by email."],
  },
];

/**
 * When each email goes and what it says, in words for an agent. The catalogue
 * keeps its own notes, written for whoever is building it ("our rewrite of
 * the acceptance email"); these are what the Showroom shows instead.
 */
export const EMAIL_WORDS: Record<string, { when: string; says: string; status?: "live" | "ready" | "built" | "written" | "planned" }> = {
  "tenant-offer-copy": { when: "When you put an offer forward for them and leave Email them a copy ticked", says: "The offer as you put it in: the rent, the move-in day, who's moving in and any works. Reply if anything is wrong.", status: "ready" },
  "tenant-passport-request": { when: "When you press Send passport on a tenant lead, before any viewing", says: "The passport on its own: what it asks, that nothing is shared until they apply, and that you will be in touch about viewings once it is done." },
  "tenant-passport-invite": { when: "The moment you book a viewing for someone who has not filled in their passport", says: "The viewing details and a calendar invite, and a button to their passport. Fill it in once and it answers every application." },
  "tenant-viewing-booked": { when: "The moment you book a viewing for someone whose passport is done", says: "The viewing details and a calendar invite, and thanks for the passport rather than asking again." },
  "tenant-passport-nudge-1": { when: "Two days after the invite, if they have not started", says: "A short nudge: it takes about ten minutes, and nothing is shared until they apply." },
  "tenant-passport-nudge-2": { when: "A week after the invite, still not started", says: "Why it helps them: the same details for every home, and ready applications go first. The last reminder." },
  "tenant-sign-in": { when: "When a tenant asks for a link on the sign-in page", says: "A link that signs them straight in. It only ever goes to someone who really is one of our tenants." },
  "viewing-moved": { when: "When you move a booked viewing", says: "The old time and the new one, who is meeting them, and the new time for their calendar." },
  "viewing-cancelled": { when: "When you cancel a booked viewing", says: "That it is off, sorry once, the reason if there is one, and an offer of another time." },
  "viewing-reminder": { when: "From 7am on the day of the viewing", says: "The time, the address with a map, who is meeting them and your mobile - the email that stops a no-show." },
  "viewing-rebook": { when: "Two hours after you mark a no-show", says: "No telling off: we missed you, here are some more times, or tell us it was not the one." },
  "viewing-feedback": { when: "Two hours after the viewing", says: "One button to a page about the home they saw, where they can tell us what they thought or make an offer." },
  "viewing-not-for-them": { when: "Straight after they say it was not for them", says: "What they did not like, said back to them, and homes nearby that do not have it." },
  "application-received": { when: "When they apply for a home", says: "What happens next, when they will hear, the holding fee if it is a yes, and what to have ready for referencing." },
  "application-its-yours": { when: "When the landlord says yes", says: "The yes, the holding fee (what it is, and when it comes back), then every step to the keys in order." },
  "application-declined": { when: "When the landlord says no", says: "Same day, never silence: sorry once, it is not the end, and the next homes to look at." },
  "referencing-invite": { when: "When the deal moves to referencing", says: "What we ask and why, what to have to hand, and that every adult gets their own link." },
  "guarantor-invite": { when: "When a guarantor is needed", says: "To the guarantor themselves: what they are agreeing to, that their details stay private, and an easy way to say no." },
  "referencing-chase": { when: "Three days into referencing, with forms still missing", says: "What is still missing, by name, and why today matters." },
};

/* ─────────────────────────── the landlord ─────────────────────────── */

/** The sample landlord is Raj (lib/landlord-sample); ?stage= puts him at that point. */
const raj = (stage: string, page = "") => `/landlord/demo${page}?stage=${stage}`;

export const LANDLORD_STEPS: ShowroomStep[] = [
  {
    id: "enquiry",
    title: "The valuation enquiry",
    lead: "A landlord asks for a valuation - on a portal, the website or the phone. They have almost certainly asked two other agents the same morning, so the first call wins it.",
    sees: [
      "Today, the first thing they hear from us is the agent ringing them.",
      "Three tries; if they do not answer, they go to nurture rather than to nothing.",
    ],
    agent: { says: "The enquiry lands on Leads within five minutes. Ring them, log how it went in Next up, and book the appraisal.", href: "/leads?side=landlord" },
    screens: [],
    emails: [],
    notYet: [
      "No \"thanks for asking, here is what happens next\" email straight after the enquiry.",
      "The nurture emails for a landlord who goes quiet are planned, not written.",
    ],
  },
  {
    id: "booked",
    title: "Booking the appraisal",
    lead: "Once the visit is booked, the landlord gets one confirmation: the date, the time, the address and who is coming, with a calendar invite.",
    sees: ["\"Appointment confirmed\", from the agent's own email, with the calendar file."],
    agent: { says: "Book it from the lead. The confirmation is shown to you straight after - read it, change anything, and send it.", href: "/market-appraisals" },
    screens: [],
    emails: ["appraisal-confirm"],
  },
  {
    id: "before",
    title: "The day before the visit",
    lead: "A short presentation arrives the day before: who is coming, what will happen and how long it takes. It opens without an account.",
    sees: [
      "\"Before the visit\", with a button to their presentation.",
      "The pre-appraisal presentation - five or six pages about us and the visit.",
    ],
    agent: { says: "It goes on its own the day before. You can send it sooner from the appraisal's Pre-appraisal step.", href: "/market-appraisals" },
    screens: [{ label: "The pre-appraisal presentation", href: "/present/sample?kind=pre-appraisal", device: "desktop" }],
    emails: ["appraisal-pre"],
  },
  {
    id: "visit",
    title: "The visit",
    lead: "The agent walks the home with the appraisal presentation on a tablet: what has let nearby, the market, and what their home could let for.",
    sees: ["The appraisal presentation, on the agent's tablet, at their kitchen table."],
    agent: { says: "Open the presentation from the appraisal, walk them through it, then record the figure, the service and the fee.", href: "/market-appraisals" },
    screens: [{ label: "The appraisal presentation", href: "/present/sample?kind=appraisal", device: "desktop" }],
    emails: [],
  },
  {
    id: "after",
    title: "After the visit: the figure and the contract",
    lead: "The same day: great to meet you, the figure in writing, and one link to their own file - the presentation and the terms of business side by side.",
    sees: [
      "\"After the visit\" with the figure in writing.",
      "\"Your presentation and your contract\" - one link to their own file.",
      "Their own area opening for the first time, with the booklet to page through.",
    ],
    agent: { says: "Record the valuation on the appraisal, then Prepare and send. You read the presentation and the contract before it goes.", href: "/market-appraisals" },
    screens: [
      { label: "The booklet they page through", href: "/present/sample?kind=post-appraisal", device: "desktop" },
      { label: "Their own area", href: raj("valuation"), device: "desktop" },
      { label: "On a phone", href: raj("valuation"), device: "phone" },
    ],
    emails: ["appraisal-post", "landlord-contract-pack"],
  },
  {
    id: "signing",
    title: "Signing the terms",
    lead: "Instructing us is signing. The contract is filled in from the valuation; the agent signs first, then the landlord signs from their own area.",
    sees: [
      "The terms of business in their area, ready to sign.",
      "A reminder if it sits unsigned: when the agent presses Nudge, and on its own after two, five and nine days.",
    ],
    agent: { says: "Sign your half on the appraisal. Press Nudge to sign if it sits there.", href: "/market-appraisals" },
    screens: [{ label: "Ready to sign", href: raj("instruction"), device: "desktop" }],
    emails: ["landlord-contract-nudge", "terms-chase"],
    notYet: ["Signing has been proven in the sandbox but never run with a real landlord."],
  },
  {
    id: "paperwork",
    title: "Signed: questions and paperwork",
    lead: "Once they have signed, their area asks what we need to know about the home and collects the certificates a let needs.",
    sees: [
      "Questions about the home in their area - meters, gas, who owns it.",
      "The certificates still to send, one by one.",
      "Reminders after two, five and nine days while questions are unanswered.",
    ],
    agent: { says: "Book the take-on visit and the photos. Press Send a nudge for the documents if they stall.", href: "/market-appraisals" },
    screens: [
      { label: "What is still needed", href: raj("compliance"), device: "desktop" },
      { label: "The questions", href: raj("compliance", "/questions"), device: "desktop" },
      { label: "Their documents", href: raj("compliance", "/documents"), device: "desktop" },
    ],
    emails: ["landlord-questions-chase", "landlord-docs-nudge"],
  },
  {
    id: "marketing",
    title: "On the market",
    lead: "Photographed, written up and live on Rightmove, Zoopla and OnTheMarket. Their area shows the advert and what is happening.",
    sees: ["Their area moving to Marketing, with viewings as they are booked."],
    agent: { says: "Write the advert and push it live from the listing.", href: "/listings" },
    screens: [{ label: "Live on the portals", href: raj("marketing"), device: "desktop" }],
    emails: [],
    notYet: ["No \"your property is live\" email with the portal links - the one a landlord most wants on the day."],
  },
  {
    id: "offers",
    title: "Viewings and offers",
    lead: "Tenants through the door, and offers coming in. Their area shows who has been and the offers waiting on them.",
    sees: [
      "The viewings, and the offers to review, in their area - whether they came through REX, from the tenant's own area, or from you on the phone.",
      "Each offer: the rent, who is moving in, their work and household income, guarantor and landlord reference, and any works they want done before moving day.",
      "Approving agrees to the works too. They become a Before moving day list in their area to tick off.",
    ],
    agent: { says: "Book viewings from the listing; offers arrive on Applications, and the ones made in the OS land on the landlord's screen by themselves.", href: "/applications" },
    screens: [{ label: "Offers in", href: raj("viewings"), device: "desktop" }],
    emails: [],
    notYet: [
      "No weekly \"how the viewings went\" email yet.",
      "The \"an offer on your property\" email is hidden for the pilot - the landlord's answer comes back by phone.",
    ],
  },
  {
    id: "let",
    title: "Let agreed",
    lead: "The landlord says yes. Referencing, the compliance check, the agreement and move-in follow, and their area shows each one.",
    sees: [
      "\"Application accepted\" - who, the rent, and what happens next.",
      "Their area following the deal to move-in day.",
    ],
    agent: { says: "Once it is a yes, press Hand over to the deal on the application.", href: "/applications" },
    screens: [{ label: "Let agreed", href: raj("let"), device: "desktop" }],
    emails: ["application-accepted-landlord"],
    notYet: ["No \"your property is let\" email on move-in day."],
  },
  {
    id: "managed",
    title: "Managed: their home, looked after",
    lead: "Their area becomes where they see the home being run: the tenancy, repairs, visits, certificates and invoices.",
    sees: [
      "Repairs as they are reported, quotes to approve, and when they are booked in.",
      "The visit report, room by room.",
      "Renewed certificates, and a reminder before one runs out.",
      "Invoices, worked out from the rent and the service.",
    ],
    agent: { says: "It follows the jobs, visits and certificates on Portfolio. Nothing to press here.", href: "/portfolio" },
    screens: [
      { label: "Their home", href: raj("managed"), device: "desktop" },
      { label: "Repairs", href: raj("managed", "/maintenance"), device: "desktop" },
      { label: "Documents", href: raj("managed", "/documents"), device: "desktop" },
    ],
    emails: [
      "works-landlord-report", "works-landlord-approval", "works-landlord-arranged",
      "inspection-landlord-report", "certificate-shared-landlord", "compliance-chase-landlord", "invoice-sent",
    ],
  },
  /* The managed home, job by job (7 Oct 2026): the back office's work, from the landlord's side. */
  {
    id: "repair",
    title: "A repair on their home",
    lead: "They hear about a repair the way they asked to: the report, the date, and a quote to say yes to if it is over their limit. Their Maintenance page shows every job in their own words, and they can tell us about one themselves.",
    sees: [
      "The report when it comes in, and what is happening now on each job.",
      "A quote to approve if it is over their limit (£150 unless their terms say otherwise).",
      "Who is coming and when, then done, with what it cost.",
      "Tell us, on the same page, for anything they have noticed or their tenant has told them.",
    ],
    agent: { says: "It follows the job on Maintenance. Record their yes with Landlord approved.", href: "/maintenance" },
    screens: [
      { label: "A quote waiting on them", href: `/landlord/demo/maintenance?stage=managed&story=repair&at=${repairAt("quote")}`, device: "desktop" },
      { label: "Done, with the cost", href: `/landlord/demo/maintenance?stage=managed&story=repair&at=${repairAt("invoiced")}`, device: "desktop" },
      { label: "Telling us", href: `/landlord/demo/maintenance?stage=managed&story=repair&at=${repairAt("before")}&way=landlord`, device: "desktop" },
    ],
    emails: ["works-landlord-report", "works-landlord-approval", "works-landlord-arranged"],
    walkthrough: { step: "repair", way: "landlord", label: "Watch a repair from every side" },
    notYet: [
      "There is no approve button. They reply to the email, or you ring them.",
      "They can be emailed about every job, only over an amount, or not at all - the office sets it on the job.",
    ],
  },
  {
    id: "certificates",
    title: "Certificates and the gas safety",
    lead: "Every certificate on their home, with the date it runs out. We renew them before they fall due; a landlord with their own engineer sends the new one from its row, and it is checked before it goes on the record.",
    sees: [
      "Each certificate with its expiry, and Send the new one on any that is running out.",
      "The new certificate by email once compliance have checked it, with the PDF attached.",
    ],
    agent: { says: "Certificates are on Compliance, under Portfolio.", href: "/compliance" },
    screens: [{ label: "Their certificates", href: "/landlord/demo/documents?stage=managed&story=compliance&at=0", device: "desktop" }],
    emails: ["certificate-shared-landlord"],
    walkthrough: { step: "gas", label: "Watch the gas safety from every side" },
    notYet: ["No reminder goes to the landlord before a certificate runs out - only the agent is emailed."],
  },
  {
    id: "visits",
    title: "Visits and the report",
    lead: "A visit every six months (every three for an HMO), arranged with their tenant, and a report to them afterwards: how the home is kept, room by room, and what is happening about anything found.",
    sees: [
      "The visit on their Maintenance page: due, booked, then done with its condition.",
      "The report by email, with every check and every room.",
    ],
    agent: { says: "Book and record visits on Inspections, under Portfolio.", href: "/inspections" },
    screens: [{ label: "Visits on their page", href: `/landlord/demo/maintenance?stage=managed&story=visits&at=${VISIT_MOMENTS.indexOf("sent")}`, device: "desktop" }],
    emails: ["inspection-landlord-report"],
    walkthrough: { step: "visits", label: "Watch a visit from every side" },
  },
  {
    id: "sign-in",
    title: "Signing in and messages",
    lead: "No password to remember: they ask for a link and it signs them straight in. They can message their agent from their area, and the reply comes by email.",
    sees: [
      "The sign-in page and the link email.",
      "Messages to their agent, and the agent's reply.",
    ],
    agent: { says: "Their messages show on the appraisal. Reply from the Messages panel.", href: "/market-appraisals" },
    screens: [
      { label: "The sign-in page", href: "/landlord/sign-in", device: "phone" },
      { label: "Messages", href: raj("marketing", "/messages"), device: "desktop" },
    ],
    emails: ["landlord-sign-in", "landlord-message-reply"],
  },
];

Object.assign(EMAIL_WORDS, {
  "appraisal-confirm": { when: "When you send the confirmation after booking", says: "The date, the time, the address and who is coming, each on its own line, with a calendar invite." },
  "appraisal-pre": { when: "The day before the visit", says: "A button to their pre-appraisal presentation: who is coming, what happens and how long it takes." },
  "appraisal-post": { when: "The same day, after you record the valuation", says: "Great to meet you, the figure in writing, and what happens next." },
  "landlord-contract-pack": { when: "When you press Send on Prepare and send", says: "One link to their own file: the presentation they saw and the terms of business side by side.", status: "live" },
  "landlord-contract-nudge": { when: "When you press Nudge to sign, and on its own after 2, 5 and 9 days", says: "A friendly reminder, with a button straight to the contract.", status: "live" },
  "terms-chase": { when: "When you press Send reminder on terms still to sign", says: "A short reminder that the terms are waiting, and where to sign them." },
  "landlord-questions-chase": { when: "2, 5 and 9 days after signing, while questions are unanswered", says: "What is still to answer about the home, and a button back to it.", status: "built" },
  "landlord-docs-nudge": { when: "When you press Send a nudge for the documents", says: "Just the paperwork left: which certificates we still need.", status: "built" },
  "application-accepted-landlord": { when: "When an offer is accepted and handed over", says: "Who is moving in, the rent and the dates, and what happens between now and move-in.", status: "ready" },
  "works-landlord-report": { when: "When you tell the landlord and choose to email the report", says: "What is wrong, the two ways forward, and what happens next." },
  "works-landlord-approval": { when: "When a quote is over what they have said we can spend", says: "The quote, why we are asking, and a one-word reply to go ahead.", status: "built" },
  "works-landlord-arranged": { when: "Once the repair has a date", says: "Who is coming, and when.", status: "built" },
  "inspection-landlord-report": { when: "When the visit report is sent", says: "How the home is being kept, room by room, and what happens about each thing found." },
  "certificate-shared-landlord": { when: "When a renewed certificate is filed on their home", says: "The new certificate, attached, and when it next runs out.", status: "ready" },
  "compliance-chase-landlord": { when: "Before a certificate runs out", says: "Which certificate, when it runs out, and how to get it renewed - their agent copied in." },
  "invoice-sent": { when: "When an invoice is sent", says: "The invoice, worked out from the rent and the service." },
  "landlord-sign-in": { when: "When a landlord asks for a link on the sign-in page", says: "A link that signs them straight in. It works once and lasts a day." },
  "landlord-message-reply": { when: "When you reply to their message", says: "Your reply, and a button back to their messages.", status: "live" },
});

/* ─────────────────────────── the agent ─────────────────────────── */

export const AGENT_STEPS: ShowroomStep[] = [
  {
    id: "account",
    title: "Your account",
    lead: "You get an invitation, set a password, connect your Outlook and write the few lines about you that go on every presentation.",
    sees: [
      "The invitation email, and a link to set your password.",
      "Setup: your Outlook calendar and email, and your bio.",
      "A reset link whenever you ask for one.",
    ],
    agent: { says: "Everything about you is on your profile.", href: "/profile" },
    screens: [],
    emails: ["pilot-invite", "account-verify", "account-reset"],
  },
  {
    id: "leads",
    title: "A new lead",
    lead: "Every enquiry lands on Leads within five minutes, tenant and landlord apart. Ring them, log how it went in Next up, and the track along the bottom moves on its own.",
    sees: [
      "Leads, split into tenant and landlord, newest first.",
      "The lead's file: who they are, what they asked, and Next up telling you the one thing to do.",
      "Three tries, then nurture - never nothing.",
    ],
    agent: { says: "Open a lead from Leads, or add one with Add new lead.", href: "/leads" },
    screens: [],
    emails: ["tenant-enquiry-reply", "tenant-added-welcome", "tenant-matches"],
  },
  {
    id: "appraisals",
    title: "Market appraisals",
    lead: "From booking the visit to a signed landlord: the confirmation, the presentation, the figure, and the terms to sign.",
    sees: [
      "The appraisals board, worst first.",
      "The appraisal file, with Next up.",
      "Building the presentation: the market, what has let, and your best-price guide.",
    ],
    agent: { says: "Book from the lead, then work it from Market Appraisals.", href: "/market-appraisals" },
    guide: "appraisals",
    screens: [],
    emails: ["appraisal-confirm", "appraisal-video-chase", "appraisal-post", "landlord-contract-pack", "landlord-contract-nudge"],
  },
  {
    id: "listings",
    title: "Getting a listing live",
    lead: "From a signed landlord to live on Rightmove, Zoopla and OnTheMarket: the photos, the advert, and the push.",
    sees: [
      "The listings board, and drafts that go cold.",
      "The advert, with a writer that drafts it for you.",
      "Push it live, portal by portal.",
    ],
    agent: { says: "Open the listing from Listings.", href: "/listings" },
    guide: "listings",
    screens: [],
    emails: [],
  },
  {
    id: "viewings",
    title: "Viewings",
    lead: "Booking a viewing into your own Outlook, the confirmation you check and send, your day, and what happened afterwards.",
    sees: [
      "Booking from the lead: the property, the time, and your diary around it.",
      "Your day and your week on Viewings.",
      "Did they turn up, how did it land, and feedback for the landlord.",
    ],
    agent: { says: "Book from the lead; your day is on Viewings.", href: "/viewings" },
    guide: "viewings",
    screens: [],
    emails: ["tenant-passport-invite", "tenant-viewing-booked", "viewing-moved", "viewing-cancelled", "viewing-rebook"],
  },
  {
    id: "offers",
    title: "Putting an offer forward",
    lead: "When a tenant wants the home, you can put the offer in for them, on the phone or sitting down together. Everything their passport knows is already there, so they're never asked twice.",
    sees: [
      "Four short steps: the offer, who's moving in, about them, check and send.",
      "The rent starts at the asking rent and can't go above it. No term - tenancies are rolling.",
      "Their passport answers filled in, marked From passport, with Change on each. No passport? You ask as you go, and it's saved to a passport for them - not sent until you press Send passport.",
      "Warnings when it matters: zero-hours, still on probation, trading under a year.",
      "The offer exactly as the landlord will see it, before it goes. Then a copy to the tenant to check.",
    ],
    agent: { says: "On a booked viewing, press Put an offer forward.", href: "/viewings" },
    screens: [{ label: "Putting an offer forward", href: "/preview/{token}/offer", device: "desktop" }],
    emails: ["tenant-offer-copy"],
    notYet: [
      "Only from a viewing so far - not yet from a lead or a listing.",
    ],
  },
  {
    id: "applications",
    title: "Applications and the handover",
    lead: "Every application on one board. When the landlord says yes, you hand it over to the deal and the tenant, the landlord and pre-tenancy all hear.",
    sees: [
      "The applications board and each application's file.",
      "Hand over to the deal, once it is a yes.",
      "An email to you when your deal moves on.",
    ],
    agent: { says: "Open an application from Applications.", href: "/applications" },
    guide: "applications",
    screens: [],
    emails: ["application-its-yours", "application-accepted-landlord", "deal-moved"],
  },
  {
    id: "plc",
    title: "Handing over the PLC pack",
    lead: "The landlord's documents, the tenant and the tenancy, checked by you and sent to the compliance team, who approve it or send it back with a reason.",
    sees: [
      "The pack, section by section, with what is missing.",
      "Ready to send, and what happens with compliance.",
      "If it comes back, what to fix.",
    ],
    agent: { says: "It starts from the application.", href: "/applications" },
    guide: "agent-plc",
    screens: [],
    emails: [],
  },
  {
    id: "compliance",
    title: "Certificates and your own compliance",
    lead: "Two kinds of reminder come to you: the homes you look after with a certificate running out, and the things you hold personally - your training and checks.",
    sees: [
      "A morning email when a certificate on one of your homes is due.",
      "A reminder when something of your own is missing or running out.",
    ],
    agent: { says: "The certificates are on Compliance; your own are on your profile.", href: "/compliance" },
    walkthrough: { step: "compliance", label: "Watch compliance from every side, live" },
    screens: [],
    emails: ["compliance-chase-agent", "own-compliance"],
  },
  /* Maintenance and inspections (tracker m29-15, 4 Oct 2026): so the team can
     see every email a repair and a visit sends before the two are switched on
     for agents. */
  {
    id: "maintenance",
    title: "Repairs and maintenance",
    lead: "A repair comes in from the tenant's portal or a phone call, becomes a job, and runs one step at a time: approve, find a contractor, book, done, check. Everybody hears at the right moment, from you.",
    sees: [
      "A works order with the next step on it, and the history underneath.",
      "The contractor's own page: book a time, mark it done, and upload photos, the certificate and the invoice.",
      "Over their limit the landlord says yes to the quote by replying to the email, and follows the job to done on their portal.",
      "The tenant is told it is logged, who is coming and when, and asked if they are happy once it is done.",
      "Compliance checks every finished job, and the invoice goes to accounts.",
    ],
    agent: { says: "Raise and run jobs on Maintenance, under Portfolio.", href: "/maintenance" },
    walkthrough: { step: "repair", label: "Watch a repair from every side, live" },
    screens: [],
    emails: [
      "works-tenant-received", "works-landlord-approval", "works-contractor-order", "works-contractor-booked", "works-tenant-found",
      "works-tenant-booked", "works-landlord-arranged", "works-contractor-done-request", "works-tenant-done", "works-tenant-happy",
      "works-landlord-report", "works-contractor-report", "works-contractor-cancelled", "works-compliance-done", "works-accounts-invoice",
    ],
    notYet: ["Maintenance is switched off for agents until it is released after launch."],
  },
  {
    id: "inspections",
    title: "Property visits",
    lead: "The homes due a visit, booked into your diary with the tenant told in writing, then recorded room by room on the day and sent to the landlord.",
    sees: [
      "The due list, worked out from the cadence, and Book it on each home.",
      "The tenant's email with the time and a button to say it works or ask for another.",
      "Recording the visit: the safety checks, then each room with photos, then the write-up.",
      "The landlord's report, with the checks and the photos on it.",
    ],
    agent: { says: "Book and record visits on Inspections, under Portfolio.", href: "/inspections" },
    walkthrough: { step: "visits", label: "Watch a visit from every side, live" },
    screens: [],
    emails: ["inspection-tenant-access", "inspection-tenant-booked", "inspection-landlord-report"],
    notYet: ["Inspections are switched off for agents until they are released after launch."],
  },
];

Object.assign(EMAIL_WORDS, {
  "tenant-enquiry-reply": { when: "Within five minutes of an enquiry about one home", says: "Is it still available, the rent, what moving in costs, and that you will be in touch before any viewing is booked." },
  "tenant-added-welcome": { when: "When you add a tenant with no home in mind", says: "What we need to know, to reply with, and a promise to send what fits." },
  "tenant-matches": { when: "When you press Email properties on the lead", says: "The homes you ticked, from you. They reply with the ones they want to see." },
  "tenant-matches-again": { when: "Four days after the homes went, if nothing is booked", says: "Have things changed, and what has come on near the homes we sent." },
  "tenant-home-alert": { when: "At most once a day, when a new home fits their saved search", says: "The new homes that fit, with a one-click way to stop them." },
  "pilot-invite": { when: "When you are invited to the OS", says: "Your invitation, and a link to set up your account.", status: "live" },
  "account-verify": { when: "When you set up your account", says: "A link to confirm it is you.", status: "live" },
  "account-reset": { when: "When you ask to reset your password", says: "A link to choose a new one.", status: "live" },
  "appraisal-video-chase": { when: "Two days before an appraisal, if you have not recorded a video", says: "To you: scan the code, record a hello on your phone, and it goes out with the presentation." },
  "deal-moved": { when: "When your deal moves on - references back, agreement out, complete", says: "To you: which deal, what moved, and what happens next.", status: "live" },
  "compliance-chase-agent": { when: "Each morning a certificate on your homes is 30, 14 or 7 days from running out, and once when one has expired", says: "To you: which homes, which certificates, and when they run out or ran out.", status: "ready" },
  "own-compliance": { when: "Each morning something of your own is missing or running out", says: "To you: what it is, and when.", status: "ready" },
});

/** The steps for each side. */
export const STEPS_FOR: Record<ShowroomSide, ShowroomStep[]> = { tenant: TENANT_STEPS, landlord: LANDLORD_STEPS, agent: AGENT_STEPS };

/** Who the sample is, on each side's screens. */
export const SAMPLE_WHO: Record<ShowroomSide, string> = {
  tenant: "The sample tenant, Sophie",
  landlord: "The sample landlord, Raj",
  agent: "Screens from the agent guides",
};

/** Every email the showroom shows - the only ones its preview route will render. */
export const SHOWROOM_EMAIL_IDS: ReadonlySet<string> = new Set([...[...TENANT_STEPS, ...LANDLORD_STEPS, ...AGENT_STEPS].flatMap((s) => s.emails), ...BACK_OFFICE_EMAIL_IDS]);
