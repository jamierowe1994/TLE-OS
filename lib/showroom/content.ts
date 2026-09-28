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

export type ShowroomSide = "tenant" | "landlord" | "agent";

export interface ShowroomScreen {
  label: string;
  /** A tenant demo page. Opened through the stage switch when `stage` is set. */
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
  /** Named honestly: what is not there yet. */
  notYet?: string[];
}

export const SIDES: { id: ShowroomSide; label: string; says: string; ready: boolean }[] = [
  { id: "tenant", label: "Tenant", says: "From the first email to the day they get the keys.", ready: true },
  { id: "landlord", label: "Landlord", says: "From the valuation to a let and managed home. Coming next.", ready: false },
  { id: "agent", label: "Agent", says: "The same journeys from your side of the desk. Coming after the landlord.", ready: false },
];

export const TENANT_STEPS: ShowroomStep[] = [
  {
    id: "passport",
    title: "The tenant passport",
    lead: "One form, filled in once, that answers every application they will ever make with us. It can be sent the day they enquire or the day they view - nothing waits for it.",
    sees: [
      "An email with a button to their own passport.",
      "One question at a time, with a card that fills in as they type.",
      "Two gentle reminders if they have not started it: after two days and after a week.",
    ],
    agent: { says: "On a tenant lead, press Send passport. On a booked viewing, press Invite to the passport.", href: "/leads?side=tenant" },
    screens: [{ label: "The passport", href: "/preview/{token}/passport", device: "phone" }],
    emails: ["tenant-passport-invite", "tenant-passport-nudge-1", "tenant-passport-nudge-2"],
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
    emails: ["tenant-passport-invite", "viewing-moved", "viewing-cancelled"],
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
    lead: "Two hours after the viewing they get a link to their own feedback page for the home they saw. They can say it is not for them, ask a question, or make an offer.",
    sees: [
      "\"How was it?\" with a link to a page about that home.",
      "Not for me, Questions, or Make an offer - never above the asking rent.",
      "If it is a no, homes nearby at a similar rent straight away.",
    ],
    agent: { says: "Close the viewing on Viewings with how it went. Offers and answers come to you by email.", href: "/viewings" },
    screens: [
      { label: "The feedback page", href: "/tenant/feedback", device: "phone" },
      { label: "In their area", href: "/tenant/demo", stage: "viewed", device: "desktop" },
    ],
    emails: ["viewing-feedback", "viewing-not-for-them"],
    notYet: ["When they make an offer, only the agent is emailed - the tenant gets no \"your offer is in\" email."],
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
];

/**
 * When each email goes and what it says, in words for an agent. The catalogue
 * keeps its own notes, written for whoever is building it ("our rewrite of
 * the acceptance email"); these are what the Showroom shows instead.
 */
export const EMAIL_WORDS: Record<string, { when: string; says: string }> = {
  "tenant-passport-invite": { when: "The moment you book a viewing, or send the passport from a lead", says: "The viewing details and a calendar invite, and a button to their passport. Fill it in once and it answers every application." },
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

/** Every email the showroom shows - the only ones its preview route will render. */
export const SHOWROOM_EMAIL_IDS: ReadonlySet<string> = new Set(TENANT_STEPS.flatMap((s) => s.emails));
