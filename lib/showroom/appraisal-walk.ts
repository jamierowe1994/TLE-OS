/**
 * THE VALUATION, CLICK BY CLICK - the walkthroughs the tour's valuation tablet
 * plays on the real Market Appraisals screens (lib/showroom/demo-appraisals).
 *
 * James, 11 Oct 2026: "rather than us zooming into the thing that they need to
 * click on, we should highlight on the screen the thing that they would need to
 * click. It's almost like a click-by-click example tutorial." So each scene is
 * one real screen at one moment of Raj's appraisal, and `try` names the control
 * the screen rings (DemoNet finds it by its words) and the press that counts.
 * A list of hints is a sequence: the furthest one showing is the one rung.
 *
 * Same shape as the back office walkthroughs (lib/showroom/back-office), so the
 * tour reads both the same way (scripts/extract-customers.mjs in the tour).
 * Checked against the screens on 11 Oct 2026.
 */

import type { BackOfficeJourney } from "@/lib/showroom/back-office";

export const APPRAISAL_WALK: BackOfficeJourney[] = [
  {
    id: "ma-book",
    title: "Booking the Visit",
    lead: "Raj rings about letting 8 Recreation Terrace. Book his market appraisal from the board: who he is, the home, and a time in your diary.",
    sees: ["The Market Appraisals board", "Book an appraisal, in three screens", "Your diary and the confirmation Raj gets", "His appraisal file"],
    story: "appraisal",
    who: ["office", "landlord"],
    scenes: () => [
      {
        /* One scene for the whole booking: the wizard is one pop-up, and a new scene would reload the screen
           under it. The ring walks through it instead, control by control. */
        id: "book-board", actor: "office", title: "Book an Appraisal",
        says: "Every appraisal still in play is on the board, soonest first. Raj has not come through as a lead, so book him from here in three screens: who he is (name, mobile and email), the home (pick the address and check the facts the records give you with him), then a time in your diary, with the confirmation he will get.",
        where: "Market Appraisals > Book an appraisal",
        screen: { kind: "office-appraisals", at: "board" },
        try: { says: "Follow the ring: Book an appraisal, fill in Raj, Next: The Property, pick 8 Recreation Terrace and tick the facts, Save and Choose a Time, click an empty half-hour, then Book and send.", hint: ["Book an appraisal", "Next: The Property", "Save and Choose a Time", "Book and send", "Open the appraisal"], did: ["booked"] },
        sends: ["appraisal-confirm"],
      },
      {
        id: "book-file", actor: "office", title: "His File, Ready for Next Time",
        says: "The appraisal is on the board and its file is open. The pink head says where it is up to; Next up always holds the one thing to do now. The confirmation is on the appointment card.",
        where: "Market Appraisals > the file",
        screen: { kind: "office-appraisal", at: "booked" },
      },
    ],
    agent: { says: "Open Market Appraisals and press Book an appraisal.", href: "/market-appraisals" },
    notYet: [],
  },
  {
    id: "ma-pre",
    title: "Before You Arrive",
    lead: "Raj gets a short presentation before you knock: a welcome, who is coming and why us. A video from you on the front makes it yours.",
    sees: ["Next up: the pre-presentation", "Send it, with or without a video", "What Raj opens"],
    story: "appraisal",
    who: ["office", "landlord"],
    scenes: () => [
      {
        id: "pre-next", actor: "office", title: "The Pre-Presentation Is Made",
        says: "The moment the appraisal is booked, the pre-presentation is made and queued for Raj. Next up offers a short video from you on the front of it. No camera to hand? Send it without one.",
        where: "Market Appraisals > the file > Next up",
        screen: { kind: "office-appraisal", at: "booked" },
        try: { says: "Press Send it without a video.", hint: "Send it without a video", did: ["video_declined", "pre_sent"] },
        sends: ["appraisal-pre"],
      },
      {
        id: "pre-email", actor: "landlord", title: "What Lands With Raj",
        says: "Raj gets an email from you with the presentation: the appointment, who is coming, why us, and a few questions worth thinking about before the visit.",
        screen: { kind: "email", at: "booked", email: "appraisal-pre" },
        sends: ["appraisal-pre"],
      },
    ],
    agent: { says: "Open the appraisal; Next up holds the pre-presentation.", href: "/market-appraisals" },
    notYet: [],
  },
  {
    id: "ma-figure",
    title: "Recording the Figure",
    lead: "Back from Raj's, the visit has passed and Next up asks for the figure: five short questions, one at a time.",
    sees: ["Next up: Record the figure", "Rent, service, fees and a note", "The file moves on to post-appraisal"],
    story: "appraisal",
    who: ["office"],
    scenes: () => [
      {
        id: "figure-steps", actor: "office", title: "Record the Figure",
        says: "Type the rent you agreed, then Next: the service level, the management fee, the set-up fee, and anything the figure needs explaining by. The terms and the post-appraisal deck are drawn up from these.",
        where: "Market Appraisals > the file > Next up",
        screen: { kind: "office-appraisal", at: "visit" },
        try: { says: "Put in £1,250, Fully managed, 12% and £750, pressing Next each time, then Save the valuation.", hint: ["Next", "Save the valuation"], did: ["valued"] },
      },
      {
        id: "figure-after", actor: "office", title: "On to Post-Appraisal",
        says: "The figure is on the file and the stage moves on by itself. Next up now offers the post-appraisal deck: the presentation Raj saw, with the figure, your fees and the terms to sign.",
        where: "Market Appraisals > the file",
        screen: { kind: "office-appraisal", at: "valued" },
      },
    ],
    agent: { says: "After the visit, open the appraisal and record the figure in Next up.", href: "/market-appraisals" },
    notYet: [],
  },
  {
    id: "ma-build",
    title: "Your Best-Price Guide",
    lead: "Before the visit, build the presentation you take with you: the home, what is on the market, what has let, the area's numbers, and your best-price guide.",
    sees: ["The builder's five steps", "On the market, with photographs", "What has let, and what we have let", "The local market", "Review, then create"],
    story: "appraisal",
    who: ["office", "landlord"],
    scenes: () => [
      {
        id: "build-steps", actor: "office", title: "Build the Presentation",
        says: "Five steps along the top, visited in any order. Property is what the records hold about the house. On the market is everything advertised near it now: click a card to put it in. Recently let is what has gone let agreed, and what we have let ourselves - tick ours to work out the best-price guide. Market is the area's numbers. Review shows the deck exactly as Raj will see it.",
        where: "Market Appraisals > the file > Build presentation",
        screen: { kind: "office-appraisal-build", at: "booked" },
        try: { says: "Press Next through the steps, clicking a card or two on the way, then Create presentation.", hint: ["Next", "Create presentation"], did: ["deck_appraisal"] },
      },
      {
        id: "build-deck", actor: "landlord", title: "What You Show on the Day",
        says: "The presentation you sit down with: the plan for the home, what is letting nearby, the local market, your guide and how we work. Page through it the way Raj will.",
        screen: { kind: "deck", at: "booked", section: "appraisal" },
      },
    ],
    agent: { says: "Open the appraisal and press Build presentation.", href: "/market-appraisals" },
    notYet: [],
  },
  {
    id: "ma-terms",
    title: "Sending the Terms",
    lead: "With the figure on the file, send Raj the presentation again with the figure, your fees and the terms to sign, in one email from you.",
    sees: ["The post-appraisal deck", "Prepare and send: check it, sign your half", "Send it to Raj"],
    story: "appraisal",
    who: ["office", "landlord"],
    scenes: () => [
      {
        id: "terms-post", actor: "office", title: "Build the Post-Appraisal",
        says: "Next up offers the post-appraisal: the deck Raj saw, plus the figure, the fees and how to get started. It keeps your picks from the first deck, so Next through to Review and Create presentation.",
        where: "Market Appraisals > the file > Next up",
        screen: { kind: "office-appraisal", at: "valued" },
        try: { says: "Press Build the post-appraisal, then Next through to Review and Create presentation.", hint: ["Build the post-appraisal", "Next", "Create presentation"], did: ["deck_post-appraisal"] },
      },
      {
        id: "terms-send", actor: "office", title: "Prepare and Send",
        says: "Check the booklet as Raj will read it, open the contract and sign your half, tick that the figures and dates are right, then send. Raj gets one email from you with the presentation and the contract.",
        where: "Market Appraisals > the file > Prepare and send",
        screen: { kind: "office-appraisal-send", at: "valued" },
        try: { says: "Open the contract and sign your half, look through the booklet, tick that the figures are right, then Send it to Raj Chauhan.", hint: ["Open the cover", "These are right", "Open the contract", "Sign the terms", "Done", "Send it to"], did: ["terms"] },
        sends: ["landlord-contract-pack"],
      },
    ],
    agent: { says: "Open the appraisal: Next up holds the post-appraisal, then Prepare and send.", href: "/market-appraisals" },
    notYet: [],
  },
];
