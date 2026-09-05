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
        id: "spine",
        title: "Work a landlord lead along the spine",
        what: "Every call, text, visit and email is logged in five seconds, the rail ticks itself from the log, and a lead that goes quiet is parked on the Nurture branch rather than forgotten.",
        how: [
          "Open Leads, Landlord, pick a lead, press Log first contact: choose Call and No answer, then Log it. The rail should tick Contacted and ask for the email next.",
          "Press Sent it from Outlook - log it. Email sent ticks; Second contact is the next action.",
          "Log two more attempts. The Stage column on the list should read 2nd contact, then 3rd contact.",
          "Press the Nurture pill under the rail, pick a reason, add. The pill fills, the card says In nurture, the list says Nurture.",
          "Press Back on the spine, or log a call you Spoke on. The lead carries on from where it was.",
          "Press They said yes - book the appraisal from any step. The rail should show Appraisal booked with the skipped steps left hollow, and the drawer offers Open on Market Appraisals.",
        ],
        where: "/leads?side=landlord",
        state: "built",
        since: "2026-09-05",
      },
      {
        id: "nurture-campaign",
        title: "Nurture puts the lead on a campaign, and a reply takes them off",
        what: "The reason picked on Add to nurture decides the campaign. Francesca edits any campaign, including the built-in ones, locks it onto reasons, and runs two on the same reason as a test.",
        how: [
          "On a landlord lead, press Nurture, pick Not answering, add. The card should read On Gone quiet - never spoken to.",
          "Log a call you Spoke on. The card returns to the spine and the campaign's replied count goes up on the Marketing screen.",
          "Open Marketing (the marketing role's home). Open Gone quiet - never spoken to, press Edit the plan, change a subject, save: the card says Built in, edited here. Revert to the built-in puts it back.",
          "Press Copy as a variant, turn the copy live on the same reason. The next lead nurtured for that reason lands on whichever of the two has fewer people; the cards say Tested against each other with replied and booked counts.",
          "Write the copy for each email step; until it is written the scheduler holds the step and says so under Due right now.",
        ],
        where: "/marketing",
        state: "built",
        since: "2026-09-05",
        switchKey: "campaign_sending",
        notes: [
          "Sends go through REX mail merge as the user in REX_CAMPAIGN_SEND_AS. Until that is set the scheduler holds every email and says why. Whose name nurture comes from is James's call.",
          "The scheduler runs from the daily cron at 07:00 with the other jobs.",
        ],
      },
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
        id: "landlord-certs",
        title: "Landlord portal: certificates and expiry dates",
        what: "A managed landlord sees each required certificate on their property with its expiry, the same read as the Compliance screen. Anything expired or missing says ask your agent.",
        how: ["Sign in as a landlord with a managed property (magic link to the email on the REX owner contact).", "Under Documents: EICR, gas where the property has gas, EPC, plus the HMO set if it is one, each with a date.", "Compare against the Compliance screen for the same property. They must agree.", "Find one with a certificate due within 30 days: the Certificates step and the snapshot should say so.", "Click a certificate marked Open: the PDF should open. Try the same link signed out: not found."],
        where: "/landlord",
        state: "built",
        since: "2026-09-04",
        notes: ["Where REX holds the file, the line ends in Open and the landlord gets the PDF through our own route, which checks the property is theirs. EPCs are often a date with no file in REX; those show the date only."],
      },
      {
        id: "landlord-offers",
        title: "Landlord portal: offers on their property",
        what: "Every application on the landlord's property from REX: the amount, who is applying, their move-in date, any conditions, and whether it is received, with the landlord, accepted or unsuccessful.",
        how: ["Sign in as a landlord whose property has applications in REX.", "Under Offers: one row per application, newest first, matching Applications in the OS for the same property.", "Accept one in REX: it should read Accepted on the next load and the journey should move to Let agreed."],
        where: "/landlord",
        state: "built",
        since: "2026-09-04",
        notes: ["Applicants are shown by first name only."],
      },
      {
        id: "landlord-upkeep",
        title: "Landlord portal: upkeep and maintenance",
        what: "The landlord sees maintenance on their property: what was reported, who is fixing it, what it cost.",
        how: [],
        state: "blocked",
        blocked: { why: "There is no source. REX's property management data was probed on 22 Aug and found empty, and that was settled as not viable.", who: "A maintenance system with an API, or maintenance recorded in the OS itself. James's call." },
        since: "2026-09-04",
      },
      {
        id: "stage-moves",
        title: "Appraisal stages move on their own",
        what: "Booked, pre-appraisal, appraisal, post-appraisal, take-on, AML and won are read from the record: the deck, the visit date, the figure, the signed terms, the landlord's documents, the REX listing. Won and lost are the only hand moves.",
        how: ["Open Market Appraisals. A record with a pre-appraisal deck should sit at Pre-appraisal; one whose visit has passed with no figure at Appraisal, flagged.", "Record a valuation: it moves to Post-appraisal on the next load.", "Sign the terms as a test landlord: Take-on. Upload ID and proof of ownership on the landlord portal: AML.", "Pick a REX property that is listed: Won.", "On the file, Mark as lost, then Reopen. It should return to the derived stage."],
        where: "/market-appraisals",
        state: "built",
        since: "2026-09-04",
        notes: ["Take-on has no record of its own, so it is the stage between terms and documents rather than something detected."],
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
        what: "Rent received, arrears and statements from PayProp's England & Wales account, connected from the OS's own Wiring page.",
        how: ["Admin, Wiring: the PayProp row should read connected, and the E&W probe should show properties and tenants.", "Open Finances: the E&W figures should be live, not sample.", "Kirstie's board: a deal at Rent payment in England should carry the PayProp receipt line."],
        where: "/admin/connections",
        state: "built",
        since: "2026-09-05",
        notes: ["James connected E&W from the OS on 5 Sep at 05:52 with credentials from his backup. The income report is not in this client's 13 permissions; ask PayProp to add it."],
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
        title: "Tenant passport invite from a viewing",
        what: "On a booked viewing the agent presses Invite to the passport. The passport is minted for that tenant and the Viewing Booked email goes on the public sender with the link.",
        how: ["Admin, Switches: Email to customers must be on, and RESEND_FROM_PUBLIC set.", "Open Viewings, open an upcoming viewing whose applicant has an email that is yours.", "Press Invite to the passport. The email should arrive with the viewing details and a Start your passport button.", "Open the link, fill a section, come back later: it should still be there.", "Press the button again: it should say Sent already with the date, and offer to send again."],
        where: "/viewings",
        state: "built",
        since: "2026-09-04",
        notes: ["Only from a viewing today, because the email is written around one. An invite from an application is a second email, not yet written."],
      },
      {
        id: "plc-agent",
        title: "The PLC check from the agent's side",
        what: "Start the pack from the application, attach the documents, be stopped if anything required is missing, send it.",
        how: ["From an accepted application press Start the PLC check - or, once references are back on the deal, find the pack already opened for you (the feed says PLC pack opened).", "Attach nothing and go to review: the send button must be off and the required list shown in red.", "Declare gas not needed with a reason. Attach the rest. Send.", "The reader runs first. If a certificate expires before move-in it holds the pack and shows the line."],
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
        title: "Tenant signs in and sees their tenancy moving",
        what: "A magic link to the email on their Propoly deal. Home shows each deal: the property, the stages in their words, what is happening now and what they can do, their agent, and their passport if one exists.",
        how: ["Open /tenant/sign-in and ask for a link with a tenant email that is on a live Propoly deal.", "Click it from the email. Home should show that deal and nothing else, at the stage Kirstie's board shows.", "Try an email that is on no deal: the same on-screen answer, no email.", "Sign out and confirm the cookie is gone."],
        where: "/tenant/sign-in",
        state: "built",
        since: "2026-09-04",
        switchKey: "customer_email",
        notes: ["The old sample portal with Sophie is kept at /tenant/demo for walking people through."],
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
        notes: ["Seeded 63 deals on 4 Sep; the cron fires every five minutes and caught its first two real moves overnight (a completion and an agreement out). When a deal reaches References back the watcher also opens the PLC pack on the matching accepted application, in the agent's name."],
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
        what: "The holding fee and the deposit matched in PayProp to the deal's tenant by email, reference or name: paid, then reconciled, then (deposit) held. First rent from the same reports. Each step announced once, and rechecked every tick.",
        how: ["Take a deal at Holding fee whose tenant has just paid. Within five minutes the feed should say Holding fee paid, not yet reconciled, and the board's Holding fee stage should name the tenant and how it matched.", "When PayProp reconciles it, the feed should say Holding fee reconciled with the date.", "Same for the deposit: paid, reconciled, then Deposit registered once PayProp holds it.", "A first rent should still read First rent received."],
        where: "/pre-tenancy/feed",
        state: "built",
        since: "2026-09-04",
        notes: ["5 Sep, probed on Scotland: none of the 38 live deals' tenants exist in PayProp yet - PayProp creates the tenant when the tenancy is set up, after the holding fee and deposit are paid. So 'paid, not yet reconciled' cannot be seen through the API (every unreconciled-funds path is 404); 'reconciled' will show once the tenant exists. Ask PayProp for the unreconciled incoming funds view their screen has. E&W is blind until the portal's client id and secret are restored."],
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
        id: "signoff",
        title: "Ready to move in: Kirstie's sign-off",
        what: "The one act that says the property is compliant and the tenant can move in. Her name on it, a feed row, the agent told, the landlord and tenant portals showing Move-in day.",
        how: ["Open a deal at Rent payment on the board. Press Ready to move in on the Move day stage.", "The panel should read back the pack, the deposit and the rent from the records. Press Sign off.", "The deal moves to Move day with Moved by <name>; the feed says Signed off; the agent's application spine shows Move day.", "Sign in as the landlord and the tenant on that deal: both homes should say Move-in day.", "Reset to live should hand the stage back to the record."],
        where: "/pre-tenancy",
        state: "built",
        since: "2026-09-05",
        switchKey: "deal_watch_notify",
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
        title: "Propoly tells us, instead of us asking, and lets us start the deal",
        what: "A webhook on deal status, read access to a deal's documents so the PLC gate can check Propoly's slots directly, and a way to create the deal by API so the accepted offer starts it without the agent's click.",
        how: [],
        state: "blocked",
        blocked: { why: "Propoly has no webhooks or events, no way to list a deal's documents, and no way to create a deal (probed 4 Sep: only landlords, properties, tenants and documents can be created). Everything is polling, the gate checks the OS pack only, and the deal is started in Propoly by hand.", who: "Propoly. James has the ask; the three items belong in one conversation." },
        since: "2026-09-04",
      },
      {
        id: "flatfair-hook",
        title: "Hooked into Flatfair",
        what: "The deal set up in Flatfair without anyone typing, and Flatfair telling us when the flatbond is in place.",
        how: [],
        state: "blocked",
        blocked: { why: "Flatfair has given us no API. Until then the agent keys the deal in from the hand-off screen and ticks it done by hand.", who: "Flatfair. James is having the conversation." },
        since: "2026-09-04",
      },
      {
        id: "portals-progress",
        title: "Landlord and tenant portals show the deal moving",
        what: "The same eight stages Kirstie's board derives, on the landlord's home as Your let, step by step, and on the tenant's home, each in their own words with what happens next.",
        how: ["Sign in as a landlord whose property has an accepted offer with a deal in Propoly. Your let, step by step should show the stage the board shows.", "Sign in as the tenant on the same deal. Their home should show the same stage.", "Move the deal in Propoly (or tick PLC done outside the OS). Both portals should follow on the next load."],
        where: "/landlord",
        state: "built",
        since: "2026-09-05",
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
