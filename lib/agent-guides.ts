import type { Guide } from "@/lib/guide-types";

/**
 * The agents' guides: how a process works from the agent's chair, written to
 * be read like a short article, with a picture of each screen set into it.
 *
 * James, 16 Sep 2026: "build the other side of that to show the agents what
 * that would look like, and then some other guides about the best price guide
 * ... as they click the guide, it will pop out onto the screen." Then, the same
 * day: "we want it to read more like an article rather than a guide ... with
 * the addition of screenshots", and a picture at the top of every one showing
 * where it lives. Kirstie's side is lib/pretenancy-guides; both are drawn by
 * components/GuideModal and opened over any screen by components/GuideLayer.
 *
 * ── Writing for this ─────────────────────────────────────────────────────
 *
 * Each step is a section of the article. `body` is its opening paragraph and
 * is followed by the picture; `why` and `how` follow as run-in paragraphs
 * ("Why it matters." / "How it works."), so write them as sentences that read
 * on from the picture, not as labels. `sends` is set apart in a panel and says
 * only what is really wired today.
 *
 * ── Where the pictures come from ─────────────────────────────────────────
 *
 * /public/guides/agents, captured from the real screens on invented data: the
 * PLC practice run (14 Sample Street), a harness render of the application
 * record, the sample deck, and the sample appraisals in the local database
 * (Priya Shah, Tom Okafor, Raj Patel, Helen Test). The market figures on the
 * builder pictures are real, because the builder reads the live market; they
 * date, and that is fine. When a screen changes, recapture it.
 *
 * ── House rules ──────────────────────────────────────────────────────────
 *
 * Agent-facing, so it never says REX and never names a data supplier. No em
 * dashes. UK English.
 */

const img = (name: string) => `/guides/agents/${name}.webp`;

export const AGENT_GUIDES: Guide[] = [
  {
    id: "agent-plc",
    title: "Handing Over the PLC Pack",
    blurb:
      "Every let needs its paperwork checked before the keys change hands. Here is how you put the pack together, what happens when you send it, and what it looks like when it comes back.",
    icon: "shield",
    href: "/applications",
    minutes: 7,
    practice: { href: "/plc/practice", label: "Practise it" },
    cover: img("plc-start"),
    coverCaption: "It starts on the application, once the landlord has accepted: Start the PLC check.",
    intro:
      "PLC stands for pre-let compliance. It is the landlord's ID, the safety certificates and the tenant checks that make it legal to let the home, gathered into one pack and read by the compliance team before anything else moves. Nothing goes to the tenancy agreement until they have approved it, so the sooner your pack is with them, the sooner the move-in is safe. It takes about five minutes if the documents are to hand.",
    steps: [
      {
        title: "Where It Starts",
        body: "The moment the landlord accepts an offer, the application grows a brown button: Start the PLC check. That is the only door into the pack, and it always opens from the application, so nothing you have already recorded has to be typed again. If you have never done one, the quiet link beside it, Never done one? Practise it first, runs exactly the same screens on invented paperwork.",
        how: "When references come back on a deal, a pack is also opened for you automatically, and a notification tells you so. It is the same pack either way.",
      },
      {
        title: "Check the Details Over",
        body: "The first screen reads the application back to you: the property, the tenants and the move-in date. The move-in date is the one thing you can change here. Anything the application already knows is thin shows underneath in orange, such as Right to Rent not being recorded for every adult.",
        image: img("plc-details"),
        why: "Every date compliance check is 'in date on the move-in date', not 'in date today'. Get the move-in date wrong and every answer after it is wrong too, without anything on the screen looking broken.",
      },
      {
        title: "If Something Looks Wrong",
        body: "Press Something is not right. The fix belongs on the application, not in the pack, so this sends you back to it. Put it right there and start the check again. If you pressed it by mistake, Never mind, it is fine carries on where you were.",
        image: img("plc-not-right"),
        why: "The pack is a copy of the application. Correcting only the pack leaves the record wrong for everybody who opens it after you.",
      },
      {
        title: "The Landlord's Documents",
        body: "Next come the landlord's documents: their ID and proof of address, the gas safety certificate, the EPC, the EICR and any licence the council asks for. Drop them anywhere on the page, or click to choose them. Each file is placed against its check from its name, and the list underneath turns green as each check is filled. If a file cannot be placed, it asks you which check it belongs to.",
        image: img("plc-landlord-filed"),
        why: "A certificate filed against the wrong check arrives with compliance wearing a confident label, which is worse than no label at all. That is why an unclear file asks rather than guesses.",
        how: "Name your files plainly, such as gas-safety.pdf, epc.pdf or landlord-id.pdf, and they file themselves. PDFs and photos both work.",
      },
      {
        title: "Tenant and Tenancy",
        body: "The same again for the tenants: the referencing, and the guarantor's checks if there is a guarantor. You will not be asked for Right to Rent, which is checked separately, or the tenancy agreement, which compliance draw up once the pack has passed.",
        image: img("plc-tenant-filed"),
      },
      {
        title: "Seeing What Is Missing",
        body: "Before anything leaves your hands, every check is laid out in one list: a green tick where there is a file, an empty circle where there is nothing. Send to the compliance team stays grey until every check has an answer.",
        image: img("plc-review"),
        why: "This is the last moment the pack is yours. Once it is sent it is locked, so what compliance read is exactly what you sent.",
      },
      {
        title: "When a Check Does Not Apply",
        body: "Some checks do not apply to every let: gas where there is no gas supply, licensing where the council runs no scheme, a guarantor where there is none. For those, write the reason in the box and press Not needed. The button waits until the reason is a real sentence, and undo puts it back if you change your mind.",
        image: img("plc-waive"),
        why: "The landlord's ID, the EPC, the EICR and the tenant checks can never be marked not needed. Every let needs them.",
        how: "Your reason travels with the pack and is added to what compliance read, so write it for them.",
      },
      {
        title: "Ready to Send",
        body: "Once every check has a file or a reason, the heading changes to Ready to Send and the button darkens. Press Send to the compliance team.",
        image: img("plc-ready"),
        how: "Before the pack goes, each document is read for its dates and names. If that reading finds something that would fail the check, such as a gas certificate that runs out after the move-in date, the pack stays with you and the screen tells you what to fix. Fix it and send again. It usually takes under a minute.",
      },
      {
        title: "With the Compliance Team",
        body: "And that is it. The pack is locked and sitting in the compliance queue, where the oldest is always read first. Go back to your applications; there is nothing to chase for 48 hours.",
        image: img("plc-done"),
        why: "Compliance aim to decide within 48 hours, and their queue turns a pack red once it has waited longer, so a late one is never lost.",
        sends:
          "No email. The pre-tenancy team get a notification in the OS that a pack has been sent to them (or sent again, if it came back first). Nothing goes to the landlord or the tenants at this stage.",
      },
      {
        title: "What Compliance Do With It",
        body: "On the other side, compliance open your pack, read what the document check found, look at every file against its check and decide. There are three possible answers: approve it, send it back to you with a reason, or decline it.",
        image: "/guides/pre-tenancy/plc-findings.webp",
        caption: "Compliance's view of a pack: red is a blocker, amber is a query, green is in order.",
        why: "Most slow packs are slow for reasons you cannot see from your side: a certificate dated wrong, a name that does not match, a missing reason. It is worth seeing once what they are looking at.",
      },
      {
        title: "If It Comes Back",
        body: "A pack that has been sent back says so plainly: Compliance sent this back, with exactly what they wrote and who wrote it. Press Reopen and fix it, put right what they asked for, and send it again. It goes straight back into their queue.",
        image: img("plc-deferred"),
        why: "A pack coming back is not a failure. It is the check doing its job, and the note is written for you, so it says exactly what is needed.",
        sends: "A notification in the OS that your pack has been sent back. No email.",
      },
      {
        title: "Once It Is Approved",
        body: "An approved pack shows who approved it and when. Your part of the compliance is done, and the next job is to finish the deal in Propoly: open the application and follow its link to the deal.",
        image: img("plc-approved"),
        how: "After approving, compliance file the approved documents against the deal, so the agreement can be drawn up without anybody uploading them again, and record the certificates and their expiry dates on the property, so the compliance tracker stops calling them missing. You do not need to do either.",
        sends: "A notification in the OS that the pack is approved. No email comes from the pack itself.",
      },
    ],
  },
  {
    id: "appraisals",
    title: "Market Appraisals and Your Best-Price Guide",
    blurb:
      "From the day a landlord agrees to a visit to the day they sign: how the appraisal file keeps you on track, how to build a presentation that wins the instruction, and how your best-price guide is worked out.",
    icon: "trend-up",
    href: "/market-appraisals",
    minutes: 10,
    coverCaption: "Market Appraisals, on the rail: every landlord who has said yes to a visit, from booked to won.",
    intro:
      "A market appraisal is where an instruction is won or lost. The landlord wants to know three things: what their home will let for, why they should believe you, and what happens next. The OS does most of the preparation for you, from the pre-presentation that arrives before you do to the market research behind your figure. This is how it fits together, in the order you will meet it.",
    steps: [
      {
        title: "The Appraisals Board",
        body: "Market Appraisals lists every appraisal still in play. The tabs along the top count how many sit at each stage, and each tile shows the address, the landlord, when the visit is, who is going, a bar for the seven stages, and a badge when no figure has been recorded yet.",
        image: img("ma-list"),
        why: "The list is sorted worst first: no figure recorded, then no date booked, then the soonest visit. The top tile is always the one to pick up next.",
        how: "Nobody drags an appraisal from stage to stage. The OS works the stage out from what has actually happened: the visit has passed, a figure is recorded, the terms are signed, the landlord's documents are in.",
      },
      {
        title: "Booking the Visit",
        body: "Most appraisals are booked straight from the lead, with Book an appraisal on the lead itself. For a landlord who never came through as a lead, use Book an appraisal on this screen instead: the landlord, the address, the postcode, who is going and when.",
        image: img("ma-book"),
        why: "An appraisal booked without a date shows on the board as needing a time, and that becomes the chase. Book the date whenever you have it.",
        sends:
          "Booked from a lead, the landlord receives a confirmation email with a calendar invite, from your own mailbox, headed 'Confirmed - your market appraisal' with the time. Booked from this screen, nothing is emailed, because there is no address to send it to, and the panel tells you so.",
      },
      {
        title: "The Appraisal File",
        body: "Open a tile and you are on the appraisal's file. The pink head carries the address, a line on where it is up to, and At a glance: the three facts you usually open the file to find. Along the top sit quick links to the presentations that exist, a welcome video recorder and the property file.",
        image: img("ma-file"),
        how: "Mark as won and Mark as lost live here too. Lost is an outcome rather than a stage, and a lost appraisal can be reopened.",
      },
      {
        title: "Next Up",
        body: "Below the head are three cards: the landlord, the appointment, and the sage Next up card. Next up is the only one that changes, and it always holds the single thing to do now: record a video, build the presentation, record the figure, send the terms. Under the cards, Where it's up to lays out all seven stages with the small ticks beneath each.",
        image: img("ma-file-cards"),
        why: "Do what Next up says, each time, and the appraisal moves through every stage in the right order with nothing missed.",
      },
      {
        title: "The Pre-Presentation",
        body: "Before you arrive, the landlord receives a short pre-presentation: a welcome, the appointment, who is coming, why us, and a few questions worth thinking about before the visit. It is made for you when the file is first opened. Next up then asks whether you would like to record a personalised welcome video to go with it, or send it without one.",
        image: img("ma-pre-presentation"),
        caption: "The opening page of the pre-presentation, as the landlord sees it.",
        why: "A landlord who has seen your face and knows what to expect before you ring the bell is already halfway to saying yes.",
        sends:
          "At 9am the day before the visit, the landlord receives 'Before your valuation' with their address, from you, with a button to open the pre-presentation and your video if you recorded one. It cannot go if there is no email address on the file, and the head of the file warns you when that is the case.",
      },
      {
        title: "Building the Presentation",
        body: "Build presentation opens the builder, the deck you take with you on the day. Its five steps run along the top and can be visited in any order. The first, Property, shows what is already known about the home: an estimated value, tenure, bedrooms, type, floor area, council tax band, its history with us, and what the public registers hold on its compliance.",
        image: img("ma-build-property"),
        why: "Check that the address has matched. The details only appear when the match is certain. If it matched a different house, the builder ignores it and tells you, because quoting a neighbour's details to a landlord is worse than quoting none.",
        how: "The grey list at the foot is what to ask the landlord for on the day. None of it is held on a public register, so treat it as a list of questions rather than a list of failures.",
      },
      {
        title: "What Is on the Market",
        body: "On the market shows everything advertised to let near the property right now, from every agent, with photos, the rent and how long each has been listed. Narrow it with the distance slider, bedrooms, type and price. Tick a property and it joins the row of circles in the top corner; those are the ones that go in the deck.",
        image: img("ma-build-market"),
        why: "This is exactly what a tenant is choosing between. Landlords always ask what else is out there, and this answers it with pictures.",
        how: "Pick three or four that are genuinely like for like: the same size, the same type, the same streets. One that is nothing like their home is enough for a landlord to dismiss the whole page.",
      },
      {
        title: "What Has Let, and What We Have Let",
        body: "Recently let shows the homes nearby that have gone let agreed, again from every agent. Above them, What we've let opens our own: on the left, what we have let recently in the district and how long each took; on the right, our homes letting now, each with a tick box.",
        image: img("ma-build-let"),
        why: "Those tick boxes on the right are the most important boxes in the builder. The homes you tick there are the ones the best-price guide in your deck is worked out from.",
        how: "Homes in the same postcode sector start ticked. Keep the ones that make a fair comparison and untick any that do not, such as a four-bed in another town. Show ours further out widens the list when there are too few nearby.",
      },
      {
        title: "How Your Best-Price Guide Is Worked Out",
        body: "The best-price guide is three figures: a low, a middle and a high monthly rent. It is worked out from homes we let ourselves rather than from adverts, so every figure in it rests on a property you can name and talk about with confidence.",
        image: img("ma-build-guide"),
        caption: "On the Market step: the guide going in the presentation, from the homes you ticked, and underneath it the guide from everything found.",
        how: "The chosen homes are put in rent order, and the guide takes the rents a quarter, half and three quarters of the way up the list. That is the middle half of real rents, so one expensive penthouse cannot drag the figure up. The search starts in the same postcode sector and widens to the district, then the whole postcode area, until it has at least four homes to work from.",
        why: "Always read the line under the figure before you quote it. It says how far the homes reach, such as '1 in NN1 4, 2 further out', and warns you when to be careful. 'Only 3 comparables, so treat this as indicative' means it is a starting point. 'Across the wider area' means it is background, not evidence. 'The spread is very wide' means quote from the named homes rather than the range.",
      },
      {
        title: "The Local Market",
        body: "Market sets out the numbers behind the area: how much is advertised against how much has let in the last twelve months, the median asking rent, how long stock is sitting, and how many landlords have already cut their price. Beneath those are five blocks you can put in front of the landlord: how fast it moves, how long stock sits, asking rent by size, what is competing, and who is letting it.",
        image: img("ma-build-marketpic"),
        why: "Months of supply is the figure to lead with. Under three months means homes are letting faster than they come on, which is the case for pricing well rather than pricing low.",
        how: "Only the blocks marked Put on slide reach the landlord. Choose the two or three that make your argument; a deck that shows everything argues nothing.",
      },
      {
        title: "Review, Then Create",
        body: "Review lists every page of the deck on the left, grouped the way the deck is, and shows the real presentation on the right, exactly as the landlord will see it. Switch off any page you want to leave out. Read it through, and when it reads right, press Create presentation.",
        image: img("ma-build-review"),
        how: "A greyed-out page tells you what it is waiting for. The rent guide and the homes behind it only go in when at least three of ours are ticked on Recently let, because two homes make a landlord think we do not know their street. What's on the market needs properties picked, and the local market needs a block put on a slide.",
        sends:
          "Nothing yet. Creating the presentation makes it and a private link to it, which you present from View presentation on the file on the day. The link lasts 14 days after the visit, and the file shows you each time the landlord opens it.",
      },
      {
        title: "After the Visit: Recording the Figure",
        body: "Once the visit has passed, Next up becomes Record the figure: five short questions, one at a time. The rent agreed, the service level, the management fee, the set-up fee, and anything else worth noting. Save the valuation and the appraisal moves on to post-appraisal.",
        image: img("ma-figure"),
        why: "This is the figure that goes in front of the landlord in writing, alongside the terms. It is the one you agreed on the day, not the guide.",
      },
      {
        title: "Sending the Terms",
        body: "Next up now offers Build the post-appraisal: the same presentation, with the figure you agreed, your fees and how to get started. After that, Prepare the presentation and sign takes you to Prepare and send, which asks for four things in order: read the booklet to the last page, confirm the details, sign your half of the contract, and send it.",
        image: img("ma-send"),
        why: "The order is deliberate. The landlord cannot open the contract until your half is signed, and the fees sit on the final pages, so you are asked to read to the end before anything goes.",
        sends:
          "The landlord receives 'Your presentation and your contract' with their address, and buttons to open the presentation and their property file. It comes from The Letting Experts, and any reply comes to you. Afterwards, Next up offers Send a reminder until they have signed.",
      },
      {
        title: "Take-On, Compliance and Won",
        body: "With the terms signed, Next up turns to the take-on: booking the visit for the photos and the description. Then comes AML and compliance, with the landlord's ID and proof of ownership on their portal and the certificates on file. When the listing is created, the appraisal is won, and Next up points you to Listings.",
        image: img("ma-spine"),
        how: "The landlord is chased by email for their property questions until they have answered them, so you do not have to. The ticks under each stage turn green on their own as things arrive.",
      },
    ],
  },
];

export const agentGuideById = (id: string | null | undefined) => AGENT_GUIDES.find((g) => g.id === id) ?? null;
