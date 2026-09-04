/**
 * The testing journeys: every process the OS claims to run, as steps a
 * person can walk, each with a light.
 *
 * James, 4 Sep: "we're building a lot of stuff really, really quickly, and
 * I'm relying on you to make sure the process is seamless. I don't actually
 * know if all of these processes work." This is the answer to that. It is
 * not a feature list; it is the set of things somebody has to sit down and
 * DO before agents are let in, with the honest state of each.
 *
 * ── The lights ────────────────────────────────────────────────────────────
 *
 *   green  built, and a person has walked it and marked it tested
 *   amber  built, wired to the real system, nobody has walked it yet
 *          (or the last walk failed - the mark says which)
 *   red    cannot be done from here: somebody outside the code has to give
 *          us something first. The step names who and what.
 *   grey   not built yet. Doable, just not done.
 *
 * Built / not built / blocked is declared here, in code, because it is a
 * statement about the code. Tested is a mark a person makes on the page,
 * with their name and the date, because it is a statement about a walk.
 * A step marked tested that is later rebuilt should be re-walked: the mark
 * carries a date and the code carries a `since` for exactly that comparison.
 *
 * Client-safe: no server imports. The page renders this and the API joins
 * the marks on.
 */

export type StepState = "built" | "notbuilt" | "blocked";

export interface TestStep {
  id: string;
  title: string;
  /** What the OS does at this step, in a sentence. */
  what: string;
  /** How to walk it, as numbered instructions. Empty for red and grey. */
  how: string[];
  /** Where to start. */
  where?: string;
  state: StepState;
  /** Red only: what is missing, and who has it. */
  blocked?: { why: string; who: string };
  /** Grey only: what would be built. */
  todo?: string;
  /** The date this was last built or rebuilt. A tested mark older than this is stale. */
  since: string;
  /** A switch the step sits behind, shown live next to it. */
  switchKey?: string;
  /** Things to watch for while walking it. */
  notes?: string[];
}

export interface Journey {
  id: string;
  title: string;
  blurb: string;
  steps: TestStep[];
}

export const JOURNEYS: Journey[] = [
  {
    id: "landlord",
    title: "The landlord presentation",
    blurb: "A lead becomes a booked appraisal, a deck, a visit, a video, a signed set of terms and a landlord who can sign in.",
    steps: [
      {
        id: "book",
        title: "Book the appraisal from a lead",
        what: "Leads hands the visit over to Market Appraisals with the address, the contact and the slot.",
        how: ["Open Leads, pick a lead, press Book an appraisal.", "Confirm it appears on Market Appraisals at Booked with the right date.", "Check the diary shows the visit."],
        where: "/leads",
        state: "built",
        since: "2026-08-26",
      },
      {
        id: "pre-deck",
        title: "Pre-appraisal deck goes out",
        what: "The landlord gets the pre-appraisal presentation by email two days before the visit, from the agent.",
        how: ["Open the appraisal file, press Send the pre-appraisal.", "Send it to yourself first: Portals, Agent, Show the email, Send it to myself.", "Open the link on a phone and a laptop. Every slide fits without scrolling sideways."],
        where: "/market-appraisals",
        state: "built",
        since: "2026-09-04",
        switchKey: "customer_email",
        notes: ["The public sender needs RESEND_FROM_PUBLIC on Railway. Without it the email refuses to go to a landlord."],
      },
      {
        id: "video",
        title: "The video chase and the recorder",
        what: "If no video is recorded two days before the visit, the agent is chased. The link opens the recorder: QR on the laptop, record on the phone, saved to the appraisal.",
        how: ["Portals, Agent, item 4, Send it to myself.", "Click the link on the laptop: a QR appears. Scan it on the phone.", "Record, save. The laptop page should notice within five seconds and say All done.", "Re-record once and confirm the appraisal keeps the newest."],
        where: "/admin/portals",
        state: "built",
        since: "2026-09-03",
        notes: ["Proven end to end on 3 Sep on James's phone and laptop. Not yet by another agent."],
      },
      {
        id: "present",
        title: "The presentation on the day",
        what: "Thirty-three slides, presented from the agent's laptop, then the post-appraisal version sent afterwards.",
        how: ["Open the appraisal, press Present.", "Walk every slide on a 720px laptop window: nothing under the bottom bar, nothing scrolling sideways.", "Send the post-appraisal deck to yourself and open it on a phone."],
        where: "/market-appraisals",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "terms",
        title: "Terms of business signed",
        what: "The landlord signs the terms through DocuSeal from the deck, and the signed document lands on the file.",
        how: ["From the close slide press Sign the terms.", "Sign as a test landlord.", "Confirm the signed PDF appears on the appraisal file and the ToB register on Pre-tenancy shows signed."],
        where: "/market-appraisals",
        state: "built",
        since: "2026-08-30",
        notes: ["DOCUSEAL_API_KEY and the template id are set on Railway. The webhook secret must match DocuSeal's."],
      },
      {
        id: "landlord-signin",
        title: "Landlord signs in and sees their journey",
        what: "A magic link to the email on the REX owner contact opens the landlord home: the property, the beats, the valuation, the decks, the terms.",
        how: ["Open /landlord and ask for a link with a landlord email that exists on REX.", "Click it from the email. The home should show that landlord's property and nothing else.", "Try an email that is not a landlord: it should refuse without saying whether the email exists."],
        where: "/landlord",
        state: "built",
        since: "2026-09-02",
        switchKey: "customer_email",
      },
      {
        id: "landlord-docs",
        title: "Landlord portal: certificates, offers, upkeep",
        what: "The landlord sees their certificates and expiry dates, offers on their property, and maintenance.",
        how: [],
        state: "notbuilt",
        todo: "Certificates from the compliance tracker, offers from Applications, upkeep from REX PM once there is a source.",
        since: "2026-09-02",
      },
      {
        id: "stage-moves",
        title: "Appraisal stages move on their own",
        what: "Booked, pre-appraisal, appraised, won or lost, with the record moving the stage rather than a person.",
        how: [],
        state: "notbuilt",
        todo: "Nothing moves a market appraisal between stages yet, and Record the valuation has no form.",
        since: "2026-08-26",
      },
    ],
  },
  {
    id: "listing",
    title: "The listing journey",
    blurb: "A won instruction becomes a listing with photos, certificates and live adverts, and then part of the book.",
    steps: [
      {
        id: "capture",
        title: "Listing captured in REX and shown in the OS",
        what: "Listings reads REX's live book. New instructions appear with photos and the agent who owns them.",
        how: ["Open Listings. Pick a property you know went live this week.", "Confirm the photos, price and agent match REX.", "Check a property that is not yours does not appear when you view as an agent."],
        where: "/listings",
        state: "built",
        since: "2026-08-28",
      },
      {
        id: "adverts",
        title: "Live advert links per listing",
        what: "Each listing shows where it is live: Rightmove, Zoopla, OnTheMarket, with a link.",
        how: ["Open a live listing.", "Click each advert link and confirm it opens the right property."],
        where: "/listings",
        state: "built",
        since: "2026-08-29",
      },
      {
        id: "golive",
        title: "Go-live date and which portals, on the file",
        what: "The listing shows the day it went live, and the portals it is feeding as the advert chips.",
        how: ["Open a published listing. Under Live advert it should read Live since <date>.", "Check the date against REX's publication time on the same listing.", "A draft should show no date."],
        where: "/listings",
        state: "built",
        since: "2026-09-04",
        notes: ["REX keeps no date per portal, so there is one go-live day, not one per chip."],
      },
      {
        id: "certs",
        title: "Certificates against the listing",
        what: "The compliance tracker shows gas, EICR and EPC for the property, with expiry, from REX.",
        how: ["Open Compliance, find the property.", "Confirm the expiry dates match the documents in REX.", "Find one that expires within 30 days and check it is flagged."],
        where: "/compliance",
        state: "built",
        since: "2026-08-22",
      },
      {
        id: "chases",
        title: "30/14/7 certificate chases",
        what: "The agent and the landlord are emailed at 30, 14 and 7 days before a certificate expires.",
        how: ["Admin, Switches: arm Certificate chases (phrase on the page).", "Run the chase by hand: GET /api/compliance/reminders/run with the cron key.", "Check the emails on /emails and in the inbox."],
        where: "/admin/switches",
        state: "built",
        since: "2026-08-22",
        switchKey: "compliance_chases",
        notes: ["Not scheduled on Railway yet. Say so and it joins the daily cron."],
      },
      {
        id: "portfolio",
        title: "The book: portfolio and landlord directory",
        what: "Every leased property, its landlord and its certificates, with a map.",
        how: ["Open Portfolio. Pick three properties and check landlord, rent and certificates against REX."],
        where: "/portfolio",
        state: "built",
        since: "2026-09-02",
        notes: ["Rent roll is REX's agreed rent until PayProp's UK key exists."],
      },
      {
        id: "payprop-uk",
        title: "Finances on the real UK book",
        what: "Rent received, arrears and statements from PayProp's UK account.",
        how: [],
        state: "blocked",
        blocked: { why: "No UK API key. The figures run on sample data.", who: "PayProp support, or James with the v2 OAuth credentials." },
        since: "2026-08-28",
      },
    ],
  },
  {
    id: "tenant",
    title: "The tenant journey",
    blurb: "A viewing becomes an application, an accepted offer, a deal in Propoly, a checked pack, a signed agreement and a move-in.",
    steps: [
      {
        id: "application",
        title: "Application in from REX, with its spine",
        what: "Applications reads REX. Opening one shows the journey left to right, what needs the agent, and Kirstie's flags.",
        how: ["Open Applications, open an accepted one.", "The spine should show REX's three stops then Kirstie's eight.", "Needs you should list real actions, not placeholders."],
        where: "/applications",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "comments",
        title: "Comments on an application",
        what: "The thread on the application is real: what people type comes back on every open.",
        how: ["Type a comment, close the drawer, reopen it. It is still there with your name and time."],
        where: "/applications",
        state: "built",
        since: "2026-09-03",
      },
      {
        id: "handover",
        title: "Offer accepted: the handover into Propoly",
        what: "Creates the landlord, the property and the relationship in Propoly, puts the tenants and the Propoly uuid on the REX listing, emails both parties through REX. Rehearses in shadow until switched on.",
        how: ["Open an accepted application. Press Rehearse in the handover panel.", "Read every step. It should name the landlord it would create and the emails it would send.", "Compare with what Howard's flow did for the same deal.", "Only then: Admin, Switches, HAND OVER FOR REAL, and Howard's Power Automate flow OFF the same day."],
        where: "/applications",
        state: "built",
        since: "2026-09-04",
        switchKey: "handover_live",
        notes: ["REX writes also need Listings/update, CustomFields/setFieldValues and MailMerge/createAndSend on REX_ALLOW_WRITES.", "Four accepted deals had no owner on the REX listing on 4 Sep. The rehearsal stops there and says so."],
      },
      {
        id: "referencing",
        title: "Referencing status",
        what: "Whether references are back, from the system that does them.",
        how: [],
        state: "blocked",
        blocked: { why: "Propoly does the referencing and exposes no result. The OS only sees the deal leave the References status, which it now announces.", who: "Propoly: a reference outcome on the deal, or a webhook." },
        since: "2026-09-04",
      },
      {
        id: "passport",
        title: "Tenant passport",
        what: "The tenant fills in their passport from an invite the agent sends.",
        how: [],
        state: "notbuilt",
        todo: "The passport is built. The invite has no send path, so nobody receives one automatically.",
        since: "2026-08-30",
      },
      {
        id: "plc-agent",
        title: "The PLC check from the agent's side",
        what: "Start the pack from the application, attach the documents, be stopped if anything required is missing, send it.",
        how: ["From an accepted application press Start the PLC check.", "Attach nothing and go to review: the send button must be off and the required list shown in red.", "Declare gas not needed with a reason. Attach the rest. Send.", "The reader runs first. If a certificate expires before move-in it holds the pack and shows the line."],
        where: "/applications",
        state: "built",
        since: "2026-09-04",
        notes: ["The reader needs ANTHROPIC_API_KEY on Railway. Without it the pack goes through unread."],
      },
      {
        id: "flatfair",
        title: "Flatfair set up after the PLC passes",
        what: "Every fact the Flatfair form asks for on one screen, copy buttons, and Done in Flatfair which ticks the deal as registered.",
        how: ["On a Flatfair deal with an approved pack, the application offers Set the deal up in Flatfair.", "Copy each line into Flatfair. Press Done in Flatfair.", "Kirstie's board should move the deal to Tenancy agreement."],
        where: "/applications",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "flatfair-api",
        title: "Flatfair by API",
        what: "The deal created in Flatfair without anyone typing it.",
        how: [],
        state: "blocked",
        blocked: { why: "No API access yet.", who: "Flatfair: the API meeting James requested." },
        since: "2026-09-04",
      },
      {
        id: "agreement",
        title: "Tenancy agreement generated and signed",
        what: "Kirstie generates the agreement in Propoly. The OS knows it went out, and when each party signed.",
        how: [],
        state: "blocked",
        blocked: { why: "Propoly exposes the agreement going out (status moves to signing) but nothing about signatures. The deal stays at Tenancy agreement until PayProp shows rent.", who: "Propoly: signing state per party, or a webhook." },
        since: "2026-09-04",
      },
      {
        id: "rent",
        title: "First rent seen in PayProp",
        what: "The watcher announces the first rent received, and the board moves the deal to Rent payment.",
        how: ["Find a deal on the board at Tenancy agreement whose tenant has just paid.", "Within five minutes of the next watcher run, the feed should say First rent received and the deal should sit at Rent payment."],
        where: "/pre-tenancy/feed",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "moveday",
        title: "Move day",
        what: "Kirstie moves the deal to Move day by hand, or Propoly marks it complete.",
        how: ["On the deal file press Move here on Move day. It should be the only stage with that button.", "Reset to live and confirm it returns to the derived stage."],
        where: "/pre-tenancy",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "tenant-portal",
        title: "Tenant signs in",
        what: "The tenant sees their tenancy, documents and what happens next.",
        how: [],
        state: "notbuilt",
        todo: "The tenant side has no sign-in yet.",
        since: "2026-09-02",
      },
    ],
  },
  {
    id: "compliance",
    title: "The compliance journey",
    blurb: "Kirstie's side: the feed, the queue, the review, the push into Propoly, and the board that moves on its own.",
    steps: [
      {
        id: "watcher",
        title: "The Propoly watcher runs every five minutes",
        what: "Compares the book to the last look and records every stage move. First run seeds silently.",
        how: ["Open the feed. Checked should read a few minutes ago at most.", "Move a test deal in Propoly. Within five minutes it appears on the feed with the right sentence.", "Check Railway: os-cron-propoly-watch ran on the last five-minute mark."],
        where: "/pre-tenancy/feed",
        state: "built",
        since: "2026-09-04",
        notes: ["Seeded 63 deals on 4 Sep and confirmed the cron fired at 14:20. No real move has been observed through it yet."],
      },
      {
        id: "feed",
        title: "The feed, and the agent's tile",
        what: "Kirstie reads every move on the book; an agent reads their own deals on the dashboard tile and under the application's spine.",
        how: ["As Kirstie: every deal on the book.", "As an agent: add What moved to the dashboard, confirm only their deals show.", "Open an application whose deal has moved and find the same rows under the spine."],
        where: "/pre-tenancy/feed",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "feed-app",
        title: "The feed installed as a window, with desktop alerts",
        what: "The OS installs as its own app opening on the feed, and raises a desktop notification for each new move.",
        how: ["In Chrome on Kirstie's machine, open the feed and click the install icon in the address bar. In Safari, File, Add to Dock.", "In the installed window press Turn on desktop alerts and allow.", "Move a test deal in Propoly. Within five minutes a notification should appear even with the window behind others."],
        where: "/pre-tenancy/feed",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "agent-emails",
        title: "Agents told when their deal moves",
        what: "References back, out for signing, complete, cancelled and first rent email the agent. The feed says who was told.",
        how: ["Admin, Switches, TELL AGENTS.", "Move a test deal to References back in Propoly. The agent whose email manages the property in Propoly should get the email within five minutes.", "The feed row should read Told <name>."],
        where: "/admin/switches",
        state: "built",
        since: "2026-09-04",
        switchKey: "deal_watch_notify",
      },
      {
        id: "money",
        title: "Money seen in PayProp",
        what: "Holding fee invoiced, deposit registered and first rent received, announced once each.",
        how: ["Register a deposit in PayProp for a deal on the board. Within five minutes the feed should say Deposit registered.", "Same for a first rent."],
        where: "/pre-tenancy/feed",
        state: "built",
        since: "2026-09-04",
        notes: ["Holding fee invoices matched on 0 of 38 deals at seed time. The PayProp holding-fee note format may need fixing before this one ever fires."],
      },
      {
        id: "queue",
        title: "Kirstie's PLC queue and review",
        what: "Packs arrive already read, longest wait first. She sees the findings, the reasons for anything waived, and decides.",
        how: ["Submit a pack as an agent. Open the PLC queue as Kirstie.", "The pack should show the reader's findings without pressing scan.", "Defer it with a note. As the agent, reopen, fix, resubmit. Approve it."],
        where: "/pre-tenancy/plc",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "push",
        title: "Approved pack pushed into Propoly's document slots",
        what: "On approval each file goes into the matching slot on the Propoly deal, with the expiry the reader found. Every file's outcome is recorded on the pack.",
        how: ["Admin, Switches, PUSH DOCUMENTS.", "Approve a pack whose address matches a live Propoly deal.", "Read Into Propoly on the review: each file uploaded, already there, skipped or failed, with the reason.", "Open the deal in Propoly and confirm the files sit in the right slots."],
        where: "/pre-tenancy/plc",
        state: "built",
        since: "2026-09-04",
        switchKey: "propoly_documents",
        notes: ["Never run against Propoly. The first real push should be watched by James.", "A file for a slot Propoly already holds is reported, not replaced."],
      },
      {
        id: "stages",
        title: "The board's stages move on their own",
        what: "Seven of eight stages read from the records; Move day is the only hand move. PLC checked outside the OS is a tick for deals in flight.",
        how: ["Open the board. For a deal at References back with no pack it should sit at PLC.", "Tick PLC checked outside the OS: it should move to Deposit or Tenancy agreement.", "Confirm no Move here button exists except on Move day."],
        where: "/pre-tenancy",
        state: "built",
        since: "2026-09-04",
        notes: ["Verified on production 4 Sep: 37 live deals, every one on a stage its records support."],
      },
      {
        id: "digest",
        title: "The pre-tenancy digest",
        what: "A daily email to whoever holds see:pretenancy listing where the pipeline and PayProp disagree.",
        how: ["Admin, Switches, SEND DIGEST.", "GET /api/pretenancy/alerts/run signed in: read the dry run.", "The 07:00 cron (os-cron-daily) sends it. Check the inbox the next morning."],
        where: "/admin/switches",
        state: "built",
        since: "2026-09-04",
        switchKey: "pretenancy_alerts",
      },
      {
        id: "shadow",
        title: "Handover rehearsals every morning",
        what: "Every application accepted in the last three weeks is rehearsed in shadow at 07:00, so the comparison with Howard's flow is already on the file.",
        how: ["Open an application accepted this week. The handover panel should show a shadow run from the morning.", "Check Railway: os-cron-daily ran at 07:00."],
        where: "/applications",
        state: "built",
        since: "2026-09-04",
      },
      {
        id: "webhooks",
        title: "Propoly tells us, instead of us asking",
        what: "A webhook on deal status, and read access to a deal's documents, so the PLC gate can check Propoly's slots directly.",
        how: [],
        state: "blocked",
        blocked: { why: "Propoly has no webhooks or events, and no way to list a deal's documents (probed 4 Sep). Everything is polling and the gate checks the OS pack only.", who: "Propoly. James has the ask." },
        since: "2026-09-04",
      },
      {
        id: "agent-checker",
        title: "Agent compliance checker",
        what: "Whether the agent themselves is compliant, on their profile, with reminders.",
        how: [],
        state: "notbuilt",
        todo: "Michael's remit. Not started.",
        since: "2026-08-21",
      },
    ],
  },
];

export type Light = "green" | "amber" | "red" | "grey";

export interface TestMark {
  journey: string;
  step: string;
  result: "pass" | "fail";
  by: string;
  at: string;
  note: string;
}

export function lightFor(step: TestStep, mark: TestMark | null): { light: Light; stale: boolean } {
  if (step.state === "blocked") return { light: "red", stale: false };
  if (step.state === "notbuilt") return { light: "grey", stale: false };
  if (!mark || mark.result !== "pass") return { light: "amber", stale: false };
  /* Passed, but rebuilt since: still green, flagged as needing another walk. */
  return { light: "green", stale: mark.at.slice(0, 10) < step.since };
}

export const LIGHT_WORDS: Record<Light, string> = {
  green: "Tested",
  amber: "Built, not tested",
  red: "Can't do this yet",
  grey: "Not built yet",
};
