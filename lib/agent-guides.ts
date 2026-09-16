import type { Guide } from "@/lib/guide-types";

/**
 * The agents' guides: how a process works from the agent's chair, a step at a
 * time, with a picture of each screen.
 *
 * James, 16 Sep 2026: "build the other side of that to show the agents what
 * that would look like, and then some other guides about the best price guide
 * ... as they click the guide, it will pop out onto the screen." Kirstie's
 * side is lib/pretenancy-guides; both are drawn by components/GuideModal and
 * opened over any screen by components/GuideLayer.
 *
 * ── Where the pictures come from ─────────────────────────────────────────
 *
 * /public/guides/agents, captured from the real screens on invented data: the
 * PLC practice run (14 Sample Street) and the sample appraisals in the local
 * database (Priya Shah, Tom Okafor, Raj Patel). The market figures on the
 * builder pictures are real, because the builder reads the live market; they
 * date, and that is fine, because the words describe what a thing is for.
 * When a screen changes, recapture it.
 *
 * ── House rules for this copy ────────────────────────────────────────────
 *
 * Agent-facing, so it never says REX, and never names a data supplier: the OS
 * is the product and the plumbing stays out of sight. No em dashes. UK English.
 * "What it sends" is only written where something actually leaves the
 * building, and it says what is really wired today, not what is planned.
 */

const img = (name: string) => `/guides/agents/${name}.webp`;

export const AGENT_GUIDES: Guide[] = [
  {
    id: "agent-plc",
    title: "Handing Over the PLC Pack",
    blurb:
      "From an accepted offer to a pack compliance can approve: what to check, what to attach, what happens when you send it and what coming back looks like.",
    icon: "shield",
    href: "/applications",
    minutes: 7,
    practice: { href: "/plc/practice", label: "Practise it" },
    steps: [
      {
        title: "When it starts",
        body: "Once the landlord has accepted an offer, the application shows a brown Start the PLC check button. Press it. That is the only way into the pack, and it is always started from the application so nothing has to be typed twice. Underneath it sits Never done one? Practise it first, which runs the same screens on invented paperwork.",
        why: "PLC is pre-let compliance: the landlord's ID, the safety certificates and the tenant checks that make it legal to hand over keys. Nothing moves to the agreement until compliance have approved it, so the sooner the pack goes, the sooner the move-in is safe.",
        how: "When references come back on a deal, a pack is also opened for you automatically and you get a notification saying so. Either way it is the same pack.",
      },
      {
        title: "Check these over",
        body: "The OS reads the application and lays out the property, the tenants and the move-in date. You typed none of it. The move-in date is the only thing you can change here. Anything that looks thin is listed underneath in orange, such as Right to Rent not being recorded for every adult.",
        why: "Every date check compliance run is 'in date on the move-in date', not 'in date today'. A wrong move-in date makes every answer wrong, and nothing on the screen will look broken.",
        how: "The warnings are the gaps the application already knows about. They are cheaper to fix now than after the pack comes back.",
        image: img("plc-details"),
      },
      {
        title: "If something is wrong",
        body: "Press Something is not right. The fix belongs on the application itself, not in the pack, so this takes you back to it. Put it right there, then start the check again. If you pressed it by mistake, Never mind, it is fine carries on.",
        why: "The pack copies the application. Correcting the pack alone leaves the record wrong for everybody who reads it after you.",
        image: img("plc-not-right"),
      },
      {
        title: "The landlord's documents",
        body: "Drop the landlord's documents anywhere on the page, or click to choose them: ID and proof of address, gas safety, EPC, EICR and any licence. Each file is placed against its check from its name, and the list underneath turns green as each check gets a file. A file the OS cannot place asks you Which check? so you choose.",
        why: "A certificate filed against the wrong check goes to compliance with a confident label on it, which is worse than no label. That is why an unclear file asks rather than guesses.",
        how: "Name files plainly (gas-safety.pdf, epc.pdf, landlord-id.pdf) and they file themselves. PDFs and photos both work.",
        image: img("plc-landlord-filed"),
      },
      {
        title: "Tenant and tenancy",
        body: "The same again for the tenants: the referencing, and the guarantor's checks if there is a guarantor. Right to Rent is checked separately and the tenancy agreement is drawn up by compliance once the pack passes, so neither is asked for here.",
        image: img("plc-tenant-filed"),
      },
      {
        title: "What is missing",
        body: "Before anything goes, the OS shows every check in one list: a green tick with its file, or an empty circle with nothing attached. Send to the compliance team stays grey until every check is answered.",
        why: "This is the last moment the pack is yours. Once sent, it is locked, so what compliance read is exactly what you sent.",
        image: img("plc-review"),
      },
      {
        title: "Not needed, with a reason",
        body: "Some checks do not apply to every let: gas where there is no gas supply, licensing where the council has no scheme, a guarantor where there is none. Write why in the box and press Not needed. The reason has to be a real sentence; the button waits until it is. Press undo if you change your mind.",
        why: "Landlord ID, the EPC, the EICR and the tenant checks can never be marked not needed. Every let needs them.",
        how: "Your reason travels with the pack and is added to what compliance read, so write it for them.",
        image: img("plc-waive"),
      },
      {
        title: "Ready to send",
        body: "When every check has a file or a reason, the title turns to Ready to Send and the button goes dark. Press Send to the compliance team.",
        how: "Before it goes, each document is read for its dates and names. If the reading finds something that would fail the check, such as a gas certificate that runs out after the move-in date, the pack stays with you and the screen says what to fix. Fix it and send again. It usually takes under a minute.",
        image: img("plc-ready"),
      },
      {
        title: "With the compliance team",
        body: "That is it. The pack is locked and in the compliance queue, oldest first. You can go back to your applications; there is nothing to chase for 48 hours.",
        why: "Compliance aim to decide within 48 hours. Their queue turns a pack red once it has waited longer than that, so a late pack is seen.",
        sends:
          "No email. The pre-tenancy team get a notification in the OS that a pack has been sent to them for checking (or re-sent, if it came back first). Nothing goes to the landlord or the tenants at this stage.",
        image: img("plc-done"),
      },
      {
        title: "What compliance do with it",
        body: "Compliance open your pack, read what the document reading found, check every file against its check and decide. There are three answers: approve, send it back to you with a reason, or decline.",
        why: "Most slow packs are slow for reasons invisible from the agent's side: a certificate dated wrong, a name that does not match, a missing reason. Worth seeing once what they are looking at.",
        image: "/guides/pre-tenancy/plc-findings.webp",
        caption: "Compliance's view of a pack: red is a blocker, amber is a query, green is in order.",
      },
      {
        title: "If it comes back",
        body: "A pack sent back shows Compliance sent this back, with exactly what compliance wrote and who wrote it. Press Reopen and fix it, put right what they asked for, and send it again. Sending again puts it back in their queue.",
        why: "Coming back is not a failure, it is the check working. The note is the only thing compliance can say to you on the pack, so it tells you exactly what is needed.",
        sends: "A notification in the OS that your pack has been sent back. No email.",
        image: img("plc-deferred"),
      },
      {
        title: "When it is approved",
        body: "An approved pack shows Approved by, with the name and the time. Your next job is to finish the deal in Propoly: open the application and use its link to the deal.",
        how: "After approving, compliance file the approved documents against the deal, so the agreement can be drawn up without anyone uploading them again, and record the certificates and their expiry dates on the property, so compliance tracking stops calling them missing. You do not need to do either.",
        sends: "A notification in the OS that the pack is approved. No email from the pack itself.",
        image: img("plc-approved"),
      },
    ],
  },
  {
    id: "appraisals",
    title: "Market Appraisals and Your Best-Price Guide",
    blurb:
      "From a booked visit to signed terms: the appraisal file, building the presentation, how the best-price guide is worked out, and what the landlord receives at each step.",
    icon: "trend-up",
    href: "/market-appraisals",
    minutes: 10,
    steps: [
      {
        title: "The appraisals board",
        body: "Market Appraisals is every landlord who has said yes to a visit, from booked to won. The tabs along the top count each stage. Every tile shows the address, the landlord, when the visit is, who is going, a progress bar of the seven stages, and a badge when there is no figure yet.",
        why: "The list is sorted worst first: no figure recorded, then no date, then the soonest visit. The top tile is always the one to pick up next.",
        how: "Nobody drags a file between stages. The OS works out the stage from what has happened: a visit that has passed, a figure recorded, terms signed, the landlord's documents in.",
        image: img("ma-list"),
      },
      {
        title: "Booking the visit",
        body: "Most appraisals are booked from the lead, with Book an appraisal on the lead itself. For one that never came through as a lead, use Book an appraisal here: the landlord, the address, the postcode, who is going and when.",
        why: "A booking without a date shows on the board as needing a time, which is the chase. Book with the date whenever you have it.",
        sends:
          "Booked from a lead, the landlord gets a confirmation email with a calendar invite, from your own mailbox, subject 'Confirmed - your market appraisal' and the time. Booked here, nothing is emailed, because there is no email address to send to. The panel says so.",
        image: img("ma-book"),
      },
      {
        title: "The appraisal file",
        body: "Open a tile and you are on the file. The pink head is the address, the stage in a line, and At a glance: the three things you open the file to find out. Along the top are quick links to the decks that exist, a welcome video recorder and the property file.",
        how: "Mark as won and Mark as lost are here too. Lost is an outcome, not a stage, and the file can be reopened.",
        image: img("ma-file"),
      },
      {
        title: "Next up",
        body: "Under the head: the landlord, the appointment, and the sage Next up box. Next up is the only box that changes. It always holds the one thing to do now: record a video, build the presentation, record the figure, send the terms. Below it, Where it's up to shows the seven stages with the small ticks under each.",
        why: "If you only ever do what Next up says, the appraisal moves through every stage in the right order and nothing is missed.",
        image: img("ma-file-cards"),
      },
      {
        title: "The pre-presentation",
        body: "The pre-presentation is a short deck that introduces you and the visit before you arrive: a welcome, the appointment, who is coming, why us, and the questions worth thinking about. It is made for you when the file is first opened. Next up then asks whether to record a personalised welcome video or send it without one.",
        why: "A landlord who has seen your face and knows what to expect before you ring the bell is already half won.",
        sends:
          "At 9am the day before the visit, the landlord gets 'Before your valuation' with the address, from you, with a button to open the pre-presentation (and your video, if you recorded one). It cannot go if there is no email address on the file; the head of the file says so.",
      },
      {
        title: "Build the presentation: the property",
        body: "Build presentation opens the builder: five steps along the top, which you can click in any order. Property shows what is known about the home: estimated value, tenure, bedrooms, type, floor area, council tax band, its history with us, and what the public registers hold on compliance.",
        why: "Check the address has matched. The details only appear when the match is certain; if it matched a different house, the builder ignores it and tells you, because quoting a neighbour's details to a landlord is worse than quoting none.",
        how: "The grey list at the bottom is what to ask the landlord for on the day. None of it is on a public register, so it is a list of questions, not a list of failures.",
        image: img("ma-build-property"),
      },
      {
        title: "On the market",
        body: "Everything advertised to let near the property right now, from every agent, with photos, rent and how long it has been listed. Narrow it with the distance slider, beds, type and price. Tick a property and it joins the row of circles top right: those go in the deck.",
        why: "This is what a tenant is choosing between. Landlords always ask 'what else is out there?', and this answers it with pictures.",
        how: "Pick three or four that are genuinely like-for-like: same size, same type, same streets. A landlord will dismiss the whole slide over one that is nothing like their home.",
        image: img("ma-build-market"),
      },
      {
        title: "Recently let, and what we have let",
        body: "Recently let shows properties nearby that have gone let agreed, from every agent. Above it, What we've let opens our own: on the left what we have let recently in the district, with how long it took, and on the right our own homes letting now, with a tick box each.",
        why: "The ticks on the right are the most important boxes in the builder. The homes you tick there are the ones the best-price guide in the deck is worked out from.",
        how: "Homes in the same postcode sector start ticked. Tick the ones that are a fair comparison and untick any that are not, such as a four-bed in another town. Show ours further out widens the list when there are too few nearby.",
        image: img("ma-build-let"),
      },
      {
        title: "How the best-price guide is worked out",
        body: "The guide is three figures: a low, a middle and a high monthly rent. It is worked out from our own homes, not from adverts, so every number in it is a property you can name and talk about.",
        how: "The comparables are put in rent order and the guide takes the rents a quarter, half and three quarters of the way up the list. That is the middle half of real rents, so one expensive penthouse cannot drag it up. The search starts in the same postcode sector and widens to the district, then the whole postcode area, until it has at least four.",
        why: "Read the line under the figure before you quote it. 'Only 2 comparables nearby, indicative' means treat it as a starting point. 'Across the wider area' means it is background, not evidence. 'The local spread is very wide' means quote from the named homes, not the range.",
        image: img("ma-build-guide"),
        caption: "The guide as the Market step shows it. The deck recalculates it from the homes you ticked.",
      },
      {
        title: "The local market",
        body: "Market is the numbers behind the area: how much is advertised against how much let in the last twelve months, the median asking rent, how long stock is sitting, and how many landlords have already cut their price. Below are five blocks you can put on a slide: how fast it moves, how long stock sits, asking rent by size, what is competing, and who is letting it.",
        why: "Months of supply is the one to lead with. Under three months means homes let faster than they come on, which is the case for pricing well rather than pricing low.",
        how: "Only the blocks marked Put on slide go to the landlord. Pick the two or three that make your argument; a deck that shows everything argues nothing.",
        image: img("ma-build-marketpic"),
      },
      {
        title: "Review and create",
        body: "Review lists the pages of the deck on the left and shows the real presentation on the right, exactly as the landlord will open it. Scroll through it. When it reads right, press Create presentation.",
        how: "The rent guide and the homes behind it only go in the deck when at least three of ours are ticked on Recently let. Fewer than three and the page is left out, because two homes make a landlord think we do not know their street. If it is missing from the preview, go back and tick more.",
        sends:
          "Nothing yet. Creating makes the presentation and a private link to it. You present it on the day from View presentation on the file. The link lasts 14 days after the visit, and the file shows each time the landlord opens it.",
        image: img("ma-build-review"),
      },
      {
        title: "After the visit: record the figure",
        body: "Once the visit has passed, Next up becomes Record the figure. Five short questions, one at a time: the rent agreed, the service level, the management fee, the set-up fee and anything else. Save the valuation and the appraisal moves on to post-appraisal.",
        why: "This is the figure that goes in front of the landlord in writing, with the terms. It is the one you agreed on the day, not the guide.",
        image: img("ma-figure"),
      },
      {
        title: "Prepare and send the terms",
        body: "Next up then offers Build the post-appraisal: the same deck with the figure you agreed, your fees and how to get started. Then Prepare the presentation and sign takes you to Prepare and send, which asks four things in order: read the booklet to the last page, confirm the details are right, sign your half of the contract, then send it.",
        why: "The order is fixed on purpose. The landlord cannot open the contract until your half is signed, and the fee page is at the end, so you are asked to read to the end first.",
        sends:
          "The landlord gets 'Your presentation and your contract' with the address, with buttons to open the presentation and their property file. It comes from The Letting Experts, and when they reply it comes to you. Afterwards, Next up offers Send a reminder until they have signed.",
        image: img("ma-send"),
      },
      {
        title: "Take-on, AML and won",
        body: "Once the terms are signed, Next up turns to the take-on: book the visit for photos and the description. Then AML and compliance: the landlord's ID and proof of ownership on their portal and the certificates on file. When the listing is created, the appraisal is won and Next up points you to Listings.",
        how: "The landlord is chased by email for their property questions until they have answered, so you do not have to. Each tick under the stage turns green on its own as things arrive.",
        image: img("ma-spine"),
      },
    ],
  },
];

export const agentGuideById = (id: string | null | undefined) => AGENT_GUIDES.find((g) => g.id === id) ?? null;
