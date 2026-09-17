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
    coverCaption: "It starts on the application: Start the PLC check.",
    intro:
      "PLC stands for pre-let compliance. It is the landlord's ID, the safety certificates and the tenant checks that make it legal to let the home, gathered into one pack and read by the compliance team before anything else moves. Nothing goes to the tenancy agreement until they have approved it, so the sooner your pack is with them, the sooner the move-in is safe. It takes about five minutes if the documents are to hand.",
    steps: [
      {
        title: "Where It Starts",
        body: "Once an application is with the landlord or accepted, its file grows a brown button: Start the PLC check. That is the only door into the pack, and it always opens from the application, so nothing you have already recorded has to be typed again. If you have never done one, the quiet link beside it, Never done one? Practise it first, runs exactly the same screens on invented paperwork.",
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
          "Nothing goes when you book. The appraisal file opens on the landlord's confirmation, headed 'Confirmed - your market appraisal' with the time and a calendar invite, from your own mailbox. Read it, change any of the words, and press Send, or Not now. The appointment card then says whether it has gone, and if you move the time it offers to send the new one.",
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
  {
    id: "viewings",
    title: "Booking and Running Viewings",
    blurb:
      "How a viewing is booked from the applicant's lead, what the applicant receives the moment you press Book it, and how your day, your week and the feedback all come together on Viewings.",
    icon: "calendar",
    href: "/viewings",
    minutes: 8,
    cover: img("v-screen"),
    coverCaption: "Viewings: your day, the week around it, and what is still owed feedback.",
    intro:
      "A viewing is the moment a lead becomes a likely tenant, and most of what happens around it now happens for you. You book it from the applicant's lead in a few clicks. It goes into your Outlook calendar, you check the applicant's confirmation and send it, with a head start on their application, and afterwards the feedback you record is kept together, property by property, ready for the landlord. This is how it fits together.",
    steps: [
      {
        title: "Where a Viewing Is Booked",
        body: "Every viewing starts from the applicant's lead. Open the lead and press Book a viewing, which sits under their enquiry. The same button appears as the next step on the lead's track, and again as Book another viewing once one is in.",
        image: img("v-lead-hero"),
        why: "Booking from the lead is what ties the viewing to a person with a phone number and an email address. That is how the confirmation can go out, and how the lead's track moves on without anyone updating it.",
        how: "For now, viewings are not booked from a listing. The listing screen says so and points you to the applicant's lead.",
      },
      {
        title: "Find the Property",
        body: "The first screen is every home on the market. The one they enquired about comes first, then anything on their shortlist, then everything else that is not let agreed. Type a street, an area or a postcode to narrow it, and pick the home they are going to see.",
        image: img("v-find"),
      },
      {
        title: "This One?",
        body: "A quick check before the diary: the photo, the address and the rent. Yes, pick a time carries on; Not this one takes you back to the list.",
        image: img("v-thisone"),
        why: "Two flats in the same building can sit side by side in the list. A viewing booked at the wrong one sends the applicant to the wrong door.",
      },
      {
        title: "Pick a Time",
        body: "The week is laid out half-hour by half-hour, with the appointments already in the diary drawn in. Click an empty half-hour to place the viewing, and drag the bar at its foot if it needs longer than thirty minutes. Leave One of us will be there ticked for an accompanied viewing, or untick it when the applicant is letting themselves in.",
        image: img("v-time"),
        how: "Nothing stops you booking on top of another appointment, so look before you click: anything already booked is drawn in the same columns. Past days cannot be picked. An unaccompanied viewing shows in its own colour on the diary and is marked free rather than busy in Outlook.",
      },
      {
        title: "What Happens When You Press Book It",
        body: "Book it does three things at once. The viewing goes into your Outlook calendar, with the address and the applicant, and a reminder thirty minutes before. Then the applicant's confirmation opens, exactly as they will get it. Click into any of it to change the words, and press Send, or Not now. Nothing goes until you press Send, and the lead's activity shows whether it has gone, with Send confirmation if it has not.",
        image: img("v-email"),
        caption: "The confirmation the applicant receives, shown here on sample details.",
        why: "Send it from here rather than from Outlook. It carries the calendar invite and the passport link, and the OS remembers it went, so the same viewing is never confirmed twice by accident.",
        sends:
          "When you press Send, to the applicant: 'Your viewing is booked. Next, your tenant passport', with the address, the time, a calendar invite, and a link to start their tenant passport. It comes from your own mailbox where that is connected, or from The Letting Experts where it is not, and either way their reply comes straight to you. To you: 'Viewing booked' with the address and time. Nothing goes to the landlord, and there are no texts yet. If the lead has no email address, nothing can be sent, so ring them.",
      },
      {
        title: "Your Day on Viewings",
        body: "Viewings, the screen pictured at the top, is where your appointments live once they are booked. The five tiles count what is coming up, what is on today, the next seven days, the viewings that have happened with no feedback yet, and the ones where feedback is in. Below them, the month sits beside the day you are looking at; click any date to see that day in order, and Print for a run sheet to take with you.",
        why: "Feedback due is the tile to keep at zero. It counts every viewing in the last fortnight where nobody has written down what was said, and that is exactly what a landlord will ring to ask about.",
      },
      {
        title: "The Week Ahead",
        body: "Press Next 7 days and the week opens beneath the month, hour by hour, starting today rather than on Monday. Every block is an appointment; click one to see what it is.",
        image: img("v-week"),
        how: "Viewings, appraisals and take-ons all share the one diary, in their own colours, so you can see where travel is tight before the day arrives.",
      },
      {
        title: "A Quick Look Before You Go",
        body: "Click any appointment and a quick look opens at the side: where it is, with a link to open it in Maps, who is coming, how you get in (keys, whether anyone lives there, any arrangement with the landlord), and the confirmations. Open the viewing file takes you to everything else.",
        image: img("v-quicklook"),
        why: "The access section is the one to read before you set off. A viewing at an occupied home, or with keys that are not in the office, is the one that goes wrong on the doorstep.",
      },
      {
        title: "The Viewing File",
        body: "The viewing file holds the whole of one viewing: the property and its access, who is coming, the confirmations, your notes, where the applicant is up to, and the activity so far. Reschedule and Cancel viewing sit at the top.",
        image: img("v-file"),
        sends:
          "Reschedule sends the applicant 'New time for your viewing' with a fresh calendar invite and moves the entry in your Outlook. Cancel sends 'Your viewing is cancelled' and takes it out of your calendar. Both need the applicant's email address on the viewing; where there is none, the screen tells you, and it is a phone call.",
      },
      {
        title: "After the Viewing: Did They Turn Up?",
        body: "Once a viewing has happened, its quick look offers Open the viewing and record feedback, and the file asks the first question: did they turn up? Press They showed to carry on, or No-show, which is recorded straight away.",
        image: img("v-showed"),
        why: "A no-show is feedback too. A landlord who hears that three people did not turn up learns something about the listing, and so do you.",
        sends:
          "Nothing yet. Once automatic tenant emails are switched on, a no-show is offered a new time with 'Shall We Rebook?', and everyone who did turn up is asked 'How Was It?' two hours after the viewing, with their answers coming back to you.",
      },
      {
        title: "How Did It Land?",
        body: "Then choose how it went: Loved it, offer expected; Offer received; Thinking about it; or Not for them. Write what they actually said, in their words, and press Save feedback. The viewing leaves Feedback due and moves into Feedback in.",
        image: img("v-land"),
        how: "Where feedback was already recorded against the viewing elsewhere, the file shows that instead of the form, so nothing is written twice.",
      },
      {
        title: "Feedback for the Landlord",
        body: "The Feedback tab gathers every viewing that has happened, property by property, with what was said and which ones are still owed a write-up. Only where there is feedback hides the gaps, and Copy for the landlord puts a clean summary of a property's viewings on your clipboard, with the applicants' names taken out, ready to paste into an email.",
        image: img("v-feedback-tab"),
        why: "Landlords judge us on how quickly they hear what people thought. A short, honest summary the day after a run of viewings keeps them onside, especially when the answer is not the one they wanted.",
        sends: "Nothing on its own. Feedback is not sent to the landlord automatically, and it does not appear on their portal yet, so Copy for the landlord is how it reaches them.",
      },
    ],
  },
  {
    id: "listings",
    title: "Getting a Listing Live",
    blurb:
      "From a new address to an advert on Rightmove, Zoopla and OnTheMarket: the Listings board, adding a listing, the Marketing tab and its eighteen boxes, and what happens when you push it to the portals.",
    icon: "home",
    href: "/listings",
    minutes: 9,
    cover: img("l-board"),
    coverCaption: "Listings: every rental we have, live, let agreed or still a draft.",
    intro:
      "A home that is not on the portals is not being seen, and a draft earns nothing. Getting a listing live is three jobs: add it, make the advert good enough to stop someone scrolling, and push it to the portals. The OS checks everything the portals will check before you press the button, so when it lets you push, the advert goes up. This is how it works, in the order you will do it.",
    steps: [
      {
        title: "The Listings Board",
        body: "Listings shows every rental on the book as a tile with its photo, rent, available date, viewings and photo count. The tabs along the top split it up: all listings, available, let agreed, drafts, the ones missing photos, the ones with no EPC, and the archive. Each tile finishes with a line that says where it stands, such as Live, Needs attention or Ready to publish.",
        how: "Filters sorts by newest or by rent, and narrows by rent, location and when it was listed. List swaps the tiles for rows when you want to scan quickly.",
      },
      {
        title: "Drafts That Go Cold",
        body: "A draft that has sat for two months without going live files itself away into Archived, along with any listing that came off the market without a tenant. Nothing is deleted. Search still finds it, and Bring back to drafts puts it on the board again for another two months.",
        image: img("l-archived"),
        why: "It keeps the Draft tab a list of real jobs rather than a wall of homes nobody is working on.",
      },
      {
        title: "Adding a New Listing",
        body: "Press Add new listing. Start typing the address and pick it from the list. If it is a home we have never had, press It is a brand new address and type it in. Then choose what kind of property it is, and set the rent, the deposit, the date it is available, the service and the let type. Create the listing makes it and opens it for you.",
        image: img("l-new-filled"),
        why: "Property type is the one box the portals will not do without, which is why it is asked for here, before anything else.",
        how: "The deposit fills itself in at five weeks' rent until you type over it. Photos, the description and everything else come next, on the listing itself. If the screen says adding listings is not switched on for you yet, ask the office.",
      },
      {
        title: "The Listing File",
        body: "Open any tile and the listing file slides in. The head has the photo, the address, the rent and where it stands, with the property details beside it. Below sit three cards: the landlord, the listing at a glance (enquiries, viewings, applications and photos), and Next up, which always holds the one thing to do now.",
        image: img("l-home"),
      },
      {
        title: "The Marketing Tab",
        body: "Marketing is the advert: the home's facts, the let, the bills and services, the headline and description, the key features, the photos and the floor plans. A ring at the top counts how many of the eighteen required boxes are done, and each one still empty is marked with a star and a soft pink edge.",
        image: img("l-mkt"),
        why: "The eighteen are what the portals need to show the home properly and what tenants filter on: photos, headline, description, at least five key features, rent, deposit, available date, property type, bedrooms, bathrooms, furnishing, council tax band, parking, heating, electricity, water, sewerage and broadband. Miss one and a tenant searching for, say, parking never sees it.",
      },
      {
        title: "Fill It In for Me",
        body: "Press Fill it in for me and the OS does the looking up for you. It reads the photos, the last time the home was listed, the landlord's answers, the property records, the appraisal and the local market, fills in every empty box it can, and writes a headline, a description and the key features. Anything it filled in is marked, so you can see what to check.",
        why: "It is a first draft, not a finished advert. Read every box it filled before you save, especially the room counts and the description, because a landlord will read the advert too.",
        how: "It never overwrites anything you have already typed, and it saves nothing on its own. Rewrite the advert does the same for the words alone when you want another go.",
      },
      {
        title: "Photos and Floor Plans",
        body: "Add photos and Add floor plan open a drop box. The first photo is the main one, the picture on the portals' search results; Make main photo swaps another into that spot. Up to fifty photos and five floor plans.",
        image: img("l-photos"),
        how: "Photos and floor plans go onto the listing the moment they finish uploading, without pressing Save, so check them before you drop them in. Choosing a different main photo is the exception and waits for Save.",
      },
      {
        title: "Saving Your Changes",
        body: "As soon as you change anything, a bar appears at the foot of the tab listing what is not saved yet. Save sends it; Discard puts everything back as it was.",
        image: img("l-savebar"),
        how: "If the listing is already live, the adverts on the portals update within about ten minutes of saving. Heating, furnishing, pets, outside space and floor area are kept with the listing but do not reach the portals yet.",
      },
      {
        title: "Preview on the Portals",
        body: "Preview on the portals shows the advert laid out the way Rightmove, OnTheMarket and Zoopla will show it, one tab each. Anything with a dashed outline can be clicked to change it there and then.",
        image: img("l-preview"),
        why: "It is the quickest way to see the advert as a tenant will: whether the main photo is the right one, whether the headline reads well, and what a portal leaves out when a box is empty.",
      },
      {
        title: "Put It Live",
        body: "On a draft, the Next up card becomes Put it live, with two things to tick: Marketing complete and the EPC filed. It also reminds you about the gas safety certificate and the EICR, which are needed before anyone moves in but do not stop the advert going up. When both ticks are green, press Push to the portals, and then Yes, push it live.",
        image: img("l-putlive"),
        why: "The OS checks the eighteen boxes, the EPC and the portals' own checks before it lets you push, so an advert that goes up is one the portals will take. If the button will not go, hover over it and it tells you what is missing.",
        sends:
          "The advert, to Rightmove, OnTheMarket and Zoopla. It is usually showing within five to ten minutes. No email goes to the landlord or to anyone else.",
      },
      {
        title: "Once It Is Live",
        body: "A live listing shows the day it went live and links to the advert on each portal. Take off the portals asks you to confirm, then pulls the advert from all three; Put back on the portals returns it.",
        image: img("l-takeoff"),
        how: "A listing that has been live cannot be turned back into a draft. Taking it off the portals is the way to pause it, for example while a holding deposit clears.",
        sends: "Taking it off or putting it back updates Rightmove, OnTheMarket and Zoopla together, usually within about ten minutes.",
      },
      {
        title: "Enquiries, Viewings and Applications",
        body: "Once it is live, the listing gathers what comes in. Applications shows the enquiries from the portals and the applications made, and each application opens on the Applications screen. Viewings shows the viewings booked and done. Viewings themselves are booked from the applicant's lead, which is covered in its own guide.",
        image: img("l-live"),
      },
    ],
  },
  {
    id: "applications",
    title: "Applications, from Offer to Handover",
    blurb:
      "How applications reach you, how to read one at a glance, what to do while the landlord decides, and what happens the moment they say yes, up to the hand-off to pre-tenancy.",
    icon: "checklist",
    href: "/applications",
    minutes: 8,
    cover: img("a-board"),
    coverCaption: "Applications: every application still in play, and what to focus on today.",
    intro:
      "An application is the point where a viewing turns into a tenancy, and it is where deals most often go quiet. Applicants apply through our application form, and each application arrives here on its own, with the checks already read out of their answers. Your job is to keep it moving: put it to the landlord, chase the decision, and once the landlord says yes, start the paperwork that gets them moved in. This is how the screen helps you do it.",
    steps: [
      {
        title: "Where Applications Come From",
        body: "You do not type applications in. When an applicant fills in the application form, it lands on Applications with the property, the rent offered, the move-in date and their answers to the four checks. The tenant passport they were invited to when their viewing was booked is what makes that form quick for them.",
        why: "Because nothing is typed twice, what you see is what the applicant told us. If something looks wrong, ask them rather than correcting it by hand.",
      },
      {
        title: "What to Focus On Today",
        body: "The tiles along the top count every application still in play by stage: Received, Communicated (with the landlord), Accepted and Unsuccessful, plus Needs attention. Underneath, What to focus on today gathers them into three jobs: awaiting the landlord's decision, needing attention, and ready to progress.",
        how: "Needs attention means the rent is over 40% of the applicants' income, or they have told us about adverse credit. Neither is a no. Both are conversations to have before the landlord asks.",
      },
      {
        title: "The List",
        body: "Open applications lists each one with the lead applicant, how many others are on it, the property, the rent, the move-in date and where it stands. The button on the right, Open application or View progress, opens the application's file, where the next job is.",
        image: img("a-list"),
        how: "The buttons open the file; they do not send anything. Chasing the landlord is still your call or your email.",
      },
      {
        title: "The Application File",
        body: "The file opens with the property photo, the lead applicant, the rent and move-in date, and the stage it has reached. At a glance tells you when it came in, who it is waiting on, how many of the four checks are done, and whether Right to Rent is recorded for everyone on it.",
        image: img("a-hero"),
      },
      {
        title: "Needs You, the Checklist and the Activity",
        body: "Below the head sit three cards. Needs you lists what to do next and who it is with: you, the landlord, pre-tenancy or the tenant. The checklist shows the four checks: Right to Rent, a landlord reference for the last two years, a guarantor if needed, and no adverse credit. Activity and comments keeps the record, and anything you write there stays on the application for everyone who opens it.",
        image: img("a-cards"),
        why: "A comment on the application is how the next person picks it up without ringing you. Write down the call you just made.",
        how: "The checks are read from the applicant's own answers on the form. The form asks the lead applicant, so the other people on the application are worth a quick question too.",
      },
      {
        title: "The Applicants",
        body: "The Applicants tab has a card for each person on the application: how to reach them, their income, their work and employer, and their answers on Right to Rent, landlord reference, guarantor and credit. Open their file takes you to the lead applicant's own record.",
        image: img("a-applicants"),
      },
      {
        title: "While the Landlord Decides",
        body: "Putting an application to the landlord is still done by you, by phone or email, with what you know about the applicants. Once it is with them the application shows as Landlord decision, and when they answer it moves to Accepted or Unsuccessful.",
        why: "This is where deals go cold. The Awaiting landlord decision tile is the list to work through every morning.",
        sends: "The OS does not send the offer to the landlord; that is still yours. An automatic 'Not This One' email for applicants who are unsuccessful is written and ready but not switched on yet, so for now telling them is your call too.",
      },
      {
        title: "Once the Landlord Says Yes",
        body: "As soon as the application is with the landlord or accepted, Start the PLC check appears at the top of the file. That begins the pre-let compliance pack, which has its own guide, and a practice run if you have never done one.",
        why: "The pack is what lets the tenancy go ahead, and pre-tenancy cannot start their side until it arrives. Start it the day the landlord says yes.",
      },
      {
        title: "Handing Over to the Deal",
        body: "An accepted application shows Hand over to the deal: the landlord, the tenants, the terms, and every certificate the property needs, with a count of anything short. Before this step nothing about the let exists on the deal side; the handover sets up the landlord and the property there and sends the good news.",
        image: img("a-handover"),
        how: "For now the handover is in rehearsal. Rehearse the handover works out every step and writes nothing, while the handover itself still runs the way it always has. When rehearsals keep matching, it is switched on, and the button becomes Hand over to the deal.",
        sends:
          "Nothing while it is in rehearsal. Once it is live, the landlord is emailed that their tenant is confirmed, and each tenant receives 'The Landlord Has Said Yes' with the holding fee (one week's rent, or none in Scotland) and what happens next.",
      },
      {
        title: "Where It Is Up To",
        body: "The track at the foot of the file runs all the way from Received to Move day: the three application stages, then the eight pre-tenancy stages as the deal is worked. Each stop shows what has happened, and Needs you picks up the jobs that come back to you along the way, such as answering pre-tenancy on the PLC pack, setting up a deposit replacement, or finishing the deal.",
        image: img("a-spine"),
        why: "It means you can answer a tenant who rings to ask where things are, without having to ask anyone else first.",
      },
      {
        title: "What Applicants Receive Along the Way",
        body: "Today the applicant hears from us when their viewing is booked, with a link to start their tenant passport, and again once the handover is live and the landlord has said yes. A fuller set of automatic emails is written and waiting to be switched on, and when it is, applicants will hear from us at each step without you having to send anything.",
        sends:
          "Now: the viewing confirmation with the passport link, and 'The Landlord Has Said Yes' once the handover is live. Written and waiting to be switched on: passport reminders at two and seven days, a reminder on the morning of the viewing, 'How Was It?' two hours after it, 'We Have Your Application' when an application arrives, and 'Not This One' if it is unsuccessful.",
      },
    ],
  },
];

export const agentGuideById = (id: string | null | undefined) => AGENT_GUIDES.find((g) => g.id === id) ?? null;
