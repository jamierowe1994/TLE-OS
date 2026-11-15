import "server-only";
import { AGENT_ROUTES, AGENT_NAV, navRoutesMismatch, type AgentRoute } from "@/lib/nav";

/**
 * What each screen is for, what you can do on it, and what is not wired yet.
 *
 * ── Why this one is written down when the rest of the map is derived ──────
 *
 * lib/system-map.ts derives everything it can from constants, because a
 * snapshot of a process goes stale and an assistant states a stale thing with
 * confidence. That principle holds — but it has a limit, and this file is it.
 * What a screen DOES lives in JSX, and no constant knows that the Listings
 * board has a search box or that the Compliance tiles are filters. It has to be
 * written.
 *
 * So the honesty is bought a different way, in three parts:
 *
 *   1. COVERAGE IS COMPILED. `SCREENS` is a Record keyed by AgentRoute, so a
 *      screen added to the rail without a description fails the build. The
 *      assistant can never silently not know a screen exists.
 *   2. THE RAIL IS CHECKED, not trusted — `navRoutesMismatch()` runs at module
 *      load, so the route union and the rail cannot quietly diverge.
 *   3. WIRING IS STATED, not implied. See below.
 *
 * ── `wiring` is the whole point of this file ─────────────────────────────
 *
 * James, 29 Aug: he should give "process, then what's wired".
 *
 * Most of this OS is designed ahead of being connected, which is correct for
 * something launching in October — but it means the process an agent should
 * follow and the buttons that currently work are two different things. An
 * assistant that knows only the process walks a pilot agent into a dead
 * button, and then the agent stops believing him about anything.
 *
 * TLE's process is real whether or not the software does it yet. It comes from
 * lib/journey.ts, and it is worth teaching. What must never be implied is that
 * a screen does something it does not. So every screen says which it is, and
 * `caveats` name the specific things that do not work, in the words an agent
 * would use — "book it in REX instead", not "unimplemented".
 *
 * Keep `caveats` current the way you would fix a lie on a tile. A stale caveat
 * here is the failure this whole file exists to prevent, just wearing the
 * opposite sign: telling somebody to go and do it by hand when the OS has
 * quietly started doing it for them.
 */

/** How much of the screen actually works today. */
export type Wiring =
  /** Reads live data and its controls do what they say. */
  | "live"
  /** Real data, but some named controls are not connected. See `caveats`. */
  | "partial"
  /** Placeholder figures or no working controls. Do not send anyone here to do a job. */
  | "shell";

export interface ScreenDoc {
  /** One line: what this screen is for. */
  purpose: string;
  /** Concrete things you can do, using the button labels as they appear. */
  does: string[];
  wiring: Wiring;
  /** Named things that do NOT work, and what to do instead. */
  caveats?: string[];
  /** Where a record goes when it leaves this screen. */
  next?: string;
}

export const SCREENS: Record<AgentRoute, ScreenDoc> = {
  "/dashboard": {
    purpose: "The morning view — what is happening across your lettings business today.",
    does: [
      "Read your own bento board of tiles.",
      "Press Customise to add, remove or resize tiles from the tray, then Done.",
      /* Gurdeep Singh, 14 Oct 2026: "Can you check my emails this morning". */
      "Ask Steve to check your emails: he reads your own Outlook inbox and picks out customers writing about your leads, homes and lets, anything with no reply yet and anything urgent, each linked to its file. Read only - he never sends, deletes, moves or marks anything as read, and only ever your own mailbox. It needs Microsoft 365 connected: Profile, the Connections tab, Connect.",
    ],
    wiring: "partial",
    caveats: ["The board layout is saved in your own browser, so it does not follow you to another device."],
  },

  "/huddles": {
    purpose: "The team's own chat - the same General and huddles as Chats on the TLE OS phone app.",
    does: [
      "Post in General, which everyone on the team can read. Tick Ask as a Question and others answer it in its own thread.",
      "Start a huddle: tick the colleagues you want (nearest first, by the patch each set on the app), name it, and talk to just them.",
      "In a huddle, People shows who is in it, Invite More People adds others, and Leave the Huddle takes you out.",
    ],
    wiring: "live",
    caveats: ["Messages from landlords and tenants are not here; they are on the lead, appraisal and tenancy files, and on the app's Chats > Work."],
  },

  "/maintenance": {
    purpose: "Every job on the managed book, reported through paid: repairs on an urgency, planned jobs like a gas safety on a date.",
    does: [
      "Report a repair: the property, what is wrong, how urgent. Emergency means attend within 24 hours, urgent within 3 days, routine within 14. The clock starts when it is reported.",
      "Plan a certificate: a gas safety, an EICR, a boiler service, an inspection, with the date it is due. Compliance can raise one from a certificate that is coming up.",
      "Open a job for its sheet: what needs doing next, the contractor, the quote and the landlord's authority, the invoice, the timeline under each person's name, and the files on it.",
      "A quote over the landlord's authority waits on their yes and says so; under it, the job is approved on the spot.",
      "The trades book has its own place now: Portfolio > Contractors.",
    ],
    wiring: "live",
    caveats: [
      "Maintenance emails contractors itself: a quote request (to one firm or up to three at once from Raise a job), the works order, the booking and a cancellation, each with the tenants' names, numbers and the access notes. Tenants and landlords get their own emails at each step when the customer email switch is on.",
      "PayProp is read-only to the OS, so marking a job as charged through PayProp records the fact here; the charge is raised in PayProp by hand.",
      "A certificate that comes back from a planned job is filed on the job. Attaching it to the property's compliance file is still done from Compliance.",
    ],
  },

  "/case-studies": {
    purpose: "Homes you have let, written up as case studies for the website: the photos, how it was advertised, how it went and your own notes.",
    does: [
      "List your case studies, drafts and ones on the website, under Settings > Your page (also at /case-studies). The office sees every agent's.",
      "Start one from a let home: open it on Portfolio, or a let listing, and choose Use as a case study from the three-dot menu. It starts from the advert and the photos.",
      "Open one and it shows as the real website page. In Edit, click any words on the page to change them (title, write-up, story, advert, your notes), press Change photo on any photo to swap it, upload one or remove one, and set each fact and the advert section to Shown or Hidden. Preview shows it exactly as it will go out, on a computer or a phone. It saves as you go.",
      "Put it on the website: it shows on the case studies page and on your own page there. Take it off again, copy its link, or remove it.",
    ],
    wiring: "live",
    caveats: [
      "The title shows the street and town, never the house number. Keep landlords and tenants unnamed.",
      "Nothing is written back to the listing: the case study is its own copy.",
    ],
  },
  "/contractors": {
    purpose: "Everyone you can send on a job: who is out today, who is booked in when, and what we owe them.",
    does: [
      "Read the four counts off the live jobs: out today, booked this week, waiting for a date, and what is owed to contractors.",
      "Bookings: today's visits, the next seven days, works orders a contractor has not booked a time for yet, and booked days that went by without the job being marked done.",
      "Contractors: your own book beside the company's. Each row says how many open jobs they have and what they are owed. Open one for their details, their bookings, every job they have done and the money through them.",
      "Log an invoice on a contractor for work with no job on the OS: pick the home, say what it was, the total and their invoice number, and attach the PDF or a photo. It goes on as a finished job and accounts are told.",
      "To pay: every contractor invoice not yet paid, oldest first, and what was paid in the last 90 days.",
    ],
    wiring: "live",
    caveats: [
      "An agent sees their own contractors and the company's. The office sees every agent's too.",
      "Over 30 days unpaid is marked as a flag, not an agreed payment term.",
      "There is nowhere yet for a contractor's insurance or other documents: what is required is with Michael.",
    ],
  },

  "/tools": {
    purpose:
      "The kit that sits alongside your book, grouped by the job it does. The first group is Prospecting — the doors nobody has knocked on yet.",
    does: [
      "See every tool, what it is for, and whether it comes with your package or is bought separately.",
      "Day to Day: Notice Dates (the earliest date a rent increase, a landlord's notice or a tenant's notice can take effect, with the working shown), Calculators, and the Route Planner (your visits for the day, the real drive between each and whether the gaps leave time).",
      "Getting paid: Forecast (where the book lands over the next 12 or 18 months, with dials to try changes) and Generate an Invoice (the fee is worked out from the home's rent and service; check it, produce it with its number, then send it).",
      "Marketing Pack: social posts, carousels, guides and artwork from marketing, ready to post or send on. Learning: the Guides (how each process works, with pictures) and Systems.",
      "Open Launch Pad to read the leads from your ads and where each one has got to.",
    ],
    /* Partial rather than shell since 2 Sep: Landlord Radar opens and is
       live off the capture. Launch Pad opens too, but only as a list. */
    wiring: "partial",
    caveats: [
      "Bond, the prospecting workspace, is locked for agents for now; only the owners can open a preview of it.",
      /* Was "as fresh as the morning sweep", which describes a schedule that
         does not exist. Checked against Railway and against os_radar_runs on
         14 Sep 2026: no cron service calls /api/radar/run, and the 16 runs on
         record are at 08:29, 11:14, 13:00, 16:48, 20:25 - scattered by up to
         nine hours, twice on some days. A cron is exact to the minute. Those
         are somebody remembering. Reword again the day a cron lands. */
      "Launch Pad here is the list only. Working a lead - logging a call, booking, marking it lost - still happens in Launch Pad itself.",
      "The Paid badge describes the tool, not you. Nothing here knows what you have bought, so it will not tell you whether a tool is yours.",
    ],
  },

  "/leads": {
    purpose:
      "Every enquiry, tenant and landlord, in one book. The two sides are different jobs so they are filtered apart.",
    does: [
      "Switch between Tenant and Landlord from the rail.",
      "Press + New lead to add one by hand. It saves in the OS immediately; whether it also reaches REX depends on the Create contacts in REX switch.",
      "Everyone added in the OS is listed above the table under Added here, whether or not REX has them - the ones waiting carry a Push to REX button and the reason they are waiting, the ones that made it carry their REX id.",
      "Search, and filter by source, agent or stage.",
      "Click a lead to open its drawer, then step through the record with Previous and Next.",
      "In the drawer, the single next-action button does that step's work — booking a viewing, booking the appraisal, sending the email, recording the offer.",
      "On a landlord, the last step is Book the appraisal. Pick a day and a time and it creates the appraisal and takes you to its file. Booking the same landlord again moves the appointment rather than making a second one.",
      "A lead given to the wrong agent: press Not my lead in the drawer (beside Mark as lost) to pass it to the right agent, picked from a list of every agent with the towns their work is in, or Back to the office, where owners and the office see it under Not assigned and give it out. Owners and the office see the same button as Reassign, on any lead. The new agent gets it in their bell and the move goes on the lead's activity. REX still shows the old agent: the move is kept in the OS.",
      "Guarantors: a tenant lead has a Guarantors box inside The tenant card. Press Add a guarantor for the guarantor's name, email, phone, how they know the applicant, their address, and which applicant they are for. One applicant can have several. They follow the applicant by email onto the let in Applications and the home in Portfolio. Kept in the OS only, not sent to Propoly.",
      "Translate: a customer's message or enquiry that is not in English has a Translate link under it, which shows it in English and names the language. When writing an email, Translate my reply puts the agent's English into their language to check and use. Nothing is sent until the agent presses Send.",
    ],
    wiring: "live",
    next: "A landlord lead leaves here at Appraisal booked and continues on Market Appraisals. A tenant lead leaves at Application received and continues on Applications.",
  },

  "/market-appraisals": {
    purpose:
      "Everything between a landlord saying yes to a visit and signing terms — booked, prepared, appraised, won.",
    does: [
      "Filter by stage using the tab strip: All open, Booked, Pre-appraisal, Appraisal, Post-appraisal, Take-on & photos, AML & compliance.",
      "Click an appraisal to open its file — the rent guide, the comparables behind it, and what needs doing now.",
      "From the file, Build the presentation makes the deck the landlord opens before you arrive.",
      /* Jade Grewal, 15 Oct 2026, was told terms "go out through REX". They
         do not: this is where they are sent from. */
      "SENDING TERMS OF BUSINESS: open the landlord's appraisal. Once the figure is recorded and the post-appraisal deck is built, the Next up card says Prepare the presentation and sign, which opens Prepare and send. Four steps there, in any order: 1 Look through it (open the booklet - what the landlord will get); 2 Check the details - their home address fills from their record (Change to correct it; if it is blank, type it and press Save their address, or Same as the let property if they live there, or Send without it if they don't have it - the address box on the contract is then left empty), then tick These are right, and the dates are right; 3 Sign your half (Draw up the contract); 4 Send it to the landlord - one email from the agent with the presentation and a link to sign in their own file. Unsigned terms are nudged automatically 2, 5 and 9 days after sending, and Nudge to sign on the appraisal's Next up card chases by hand.",
      "Change the fees: on the appraisal file (top) or under the tick on Prepare and send, for the service, the management fee, a set-up fee and other fees, with why it changed. The deck and the terms both follow, and terms already drawn up or sent are drawn up again. Not once the landlord has signed.",
      "A brand new home with no appraisal goes through + Add new listing on Listings, whose fifth screen draws up the terms to sign and send the same way.",
    ],
    wiring: "partial",
    caveats: [
      /* Was: "You cannot start an appraisal on this screen ... There is no New
         appraisal button here and that is deliberate." Untrue since the Book
         an appraisal button shipped, and the exact failure this file's header
         warns about - a caveat sending somebody away to do by hand what the
         screen had quietly started doing. Corrected 14 Sep 2026. */
      "Book an appraisal here when there is no landlord lead behind it yet: the landlord, then the property, then the time, and they become a lead on the way. If they are already a lead it points you to book from that lead instead, so the lead and the appraisal stay one record.",
      "Stages move on their own, read from the record: the deck sent, the visit passed, the figure recorded, the terms signed, the landlord's documents, the REX listing. Won and Lost are the only moves made by hand.",
      "Booking sends the landlord their confirmation with a calendar file attached, from the public sender with you as reply-to, as long as their record has an email address and Email to customers is on. The file says whether it went.",
      "The appointment goes into your own diary and Outlook. Rearrange or Cancel on the appraisal moves or removes it there too, and Send Again resends the landlord's confirmation.",
      "Won and Lost are their own tabs. A won appraisal's listing carries its landlord, notes, fees and papers across.",
    ],
    next: "A won appraisal becomes a listing.",
  },

  "/listings": {
    purpose: "The properties on the market, as a card board — rent, beds, days on market, and what is missing.",
    does: [
      /* The Available-only switch became a stage tab, and Location is a
         filter rather than a sort - this line described neither by 14 Sep. */
      "Filter by stage on the tabs: All listings, Available, Let agreed, Draft, Missing photos, Needs compliance, Archived.",
      "Open Filters for the sort (Most recent, or rent low to high and high to low), the rent band, the location and the date listed.",
      "Search the board, and switch it between List and Tiles.",
      /* Until 4 Nov 2026 this entry said New listing opened REX, that The
         Details could only be changed in REX and that the write-up was the
         only thing a listing saved back, so Steve answered "how do I take
         this listing off the market?" with "the OS doesn't have a way yet,
         withdraw it in REX". Each line below is the button as it is now. */
      "New listing, top right of the board: five short screens - The Home, The Landlord, The Let (rent, deposit, service and fees), Check, then Terms, drawn up for the agent to sign their half and send. The listing is made at Check, with nothing to do anywhere else.",
      "Click a card for the listing's page: Overview, Enquiries, Viewings, Offers, Compliance, Notes and Activity.",
      "Edit on The Details, on the Overview, changes the rent, deposit, available date, bedrooms, bathrooms, council tax band, type of home, furnishing, type of let and the service. It saves straight to the listing.",
      "Edit the advert, at the top of the page, opens Marketing: edit the portal write-up and press Save. That goes straight out to Rightmove, Zoopla and OnTheMarket - live on the portals in about five to ten minutes. There is nothing else to press afterwards.",
      "Take off the market, at the top of a live listing's page (and in its More options menu): it asks first, then the advert comes off Rightmove, Zoopla and OnTheMarket within the hour. Enquiries, viewings and offers stay on the listing, and Put back on the market, in the same place, puts the advert back up. It is the agent's own press: Steve says where it is and never presses it.",
      "A draft can go Live without Portals from its More options menu: it moves on to viewings and offers without being advertised.",
      "Once a let is in progress, The Advert box on the listing and on the let says whether it is still online. Take Off the Portals takes it down now, in a few short screens that also offer to let the other applicants go and call off booked viewings, or they pick when to be asked: When the holding fee is in, When referencing is done, or I'll decide myself. Nothing comes down by itself.",
      "Open the live advert on Rightmove, Zoopla or OnTheMarket from the Live advert links at the top of the file.",
      "Make an offer, and hand a let property over to Kirstie for pre-tenancy.",
    ],
    wiring: "partial",
    caveats: [
      "Archived is not a REX state and nothing is deleted: a draft goes there once it has sat two months without being published, along with every listing REX holds that came off the market without a tenant. Bring back to drafts returns one for another two months.",
      "Pills like No photos and EPC not filed are telling you what REX is missing, not what this screen failed to load.",
      "A home's address: ask Steve. He changes it in the OS after showing the old and new and a yes - on the managed-home record, or as the OS's own address for a listing - and it shows under the address on the listing and Portfolio pages as Address in the OS. The home's property record in REX is not changed: Steve tells them to change it there too, without naming REX. The push to Propoly uses the OS address for a town or postcode the REX record has blank (never over one REX holds), and says so on the handover run.",
      "Terms of business are not sent from a listing: the Send terms button under Compliance is not switched on. They go from the landlord's appraisal file, Prepare and send (see Market Appraisals). A listing with no appraisal file behind it (most homes that were on the market before the OS) has no Prepare and send: if its terms already went out and are unsigned, chase them from the Terms to sign tile on the Dashboard - Send reminder emails the landlord from your own mailbox (Customise adds the tile if it is not there). If they hold signed terms, Upload them under Compliance. Otherwise it goes to James.",
      "Live advert links only appear for a property that is actually feeding a portal. No links means the feed is not running, not that the screen failed.",
    ],
    next: "A let property hands over to pre-tenancy.",
  },

  "/viewings": {
    purpose:
      "Every viewing and its whole story — the property, who is coming, whether anyone lives there, and whether the confirmations actually went.",
    does: [
      "Switch between Calendar, Diary and Feedback.",
      "Feedback groups every viewing that has been by property, with what was said and REX's Hot / Warm / Cold, and Copy for the landlord puts it on the clipboard with no names in it.",
      "Click a viewing for access details, keys, and the comms checklist showing which confirmations were sent.",
      "Record the outcome, starting with whether they turned up, including a No-show.",
      "Push an offer to the landlord, and couple or uncouple applicants.",
      "Open the Week calendar and click an empty slot to add an appointment.",
    ],
    wiring: "partial",
    caveats: [
      "Appointments added on the week calendar stay in the OS. They do not reach REX, so REX will not know about them.",
      /* Built 14 Sep - the Feedback view, grouped by property, with a
         landlord-ready copy. What is left is not ours to build. */
      "Most viewings have no feedback written up in REX at all - 4 of the last 30. The report shows what is there and names what is missing.",
    ],
    next: "A viewing that goes well produces an application.",
  },

  "/showroom": {
    purpose: "Every journey from the other side of the glass: what the tenant sees at each step, every email that goes out to them, and a place to say what is not right. ",
    does: [
      "Pick Tenant, Landlord or Agent across the top, and a step down the side.",
      "Look at the tenant's own screen for that step, on a computer or a phone - it is the sample tenant, Sophie, and nothing is saved.",
      "Open any email that goes out at that step, and press Email it to me to get it in your own inbox.",
      "Read what the agent does to set the step off, and what is not built yet.",
      "Write what is not right in the box at the bottom; it goes on the list with the step attached.",
    ],
    wiring: "live",
    caveats: [
      "Email it to me sends the sample version, with Sophie's details, to your own address only.",
    ],
  },

  "/applications": {
    purpose: "Every let in progress: applications on REX's statuses, offers accepted in the OS, and lets that only exist in Propoly, with the pre-tenancy stages once one is accepted.",
    does: [
      "Read the four-tile pipeline across REX's statuses.",
      "Show or hide unsuccessful applications.",
      "Choose your columns.",
      "Click an application for the file and the handover.",
      "On a let's file, the Guarantors box under the applicants lists each applicant's guarantors - carried over from the tenant lead by their email - and Add a guarantor puts on another.",
    ],
    wiring: "live",
    caveats: [
      "Referencing is done in Propoly: the deal's stage there says when it is at referencing, and references coming back opens the PLC pack automatically.",
      "Start the PLC check is the brown button on the let's file once the application is with the landlord or accepted. The how-to guide on handing over the PLC pack has the steps; a pack sent back arrives as a notification with the checker's note.",
      "The right-to-rent gap warning is real — it is counting applications with nothing recorded.",
      "A tenant's right to rent expiry date (or no time limit) is recorded by asking Steve - he puts it on the let after a yes, and it shows on the tenant's Their application card as Right to rent expiry. The office's bell reminds them when the follow-up check is due. A Scottish let has no right to rent, so it shows none and takes none.",
    ],
    next: "An accepted application becomes a deal in Propoly and goes to pre-tenancy.",
  },

  "/compliance": {
    purpose: "Which certificates are in date, which are running out, and the whole book behind them.",
    does: [
      "Press any of the four tiles to filter the book by that state.",
      "See what is coming out of compliance over the next month, with days left or days over.",
      "Press Book the {trade} on an urgent row to raise a works order.",
      "Click a property to open its file and upload a certificate.",
    ],
    wiring: "partial",
    caveats: [
      /* Reworded 14 Sep: the old line named a "Tell the landlord" control that
         is not on this screen, which makes the warning look wrong and the rest
         of the file with it. The substance holds - the certificate reminders
         that DO send (app/api/compliance/reminders/run) go to the agent, and
         are off until the compliance_chases switch is armed. */
      "Nothing on this screen emails the landlord. Ring or email them yourself, and note it on the property.",
      "Gas and EICR recording only began in November, so the book is thinner than the real position. EPC looks complete because it was bulk imported.",
      "A renewed certificate overwrites the old one in REX, so this screen cannot tell you what was overdue in the past.",
    ],
  },

  "/inspections": {
    purpose: "Every visit we owe the managed book, the tenant's permission to make it, and what was found. Opened from the Inspections tile on Overview (it is not on the menu).",
    does: [
      "Read the Due list: homes the cadence says are owed a visit, alongside the visits brought across from the old property management system's task list.",
      "Press Book it on a due home to open the visit on the booking form.",
      "Book a day, time, length and who is going: it goes in their diary and Outlook, and the tenant is emailed the time with a button to say it works or ask for another. Or offer a few dates and let the tenant choose on their own link.",
      "See on the visit whether the tenant has confirmed, change the time, or send the confirmation again.",
      "Press Record the visit on the day: the safety checks (alarms, damp, who lives there, meter readings), then each room with Good, Fair or Poor, notes, photos and what happens next, then the write-up.",
      "Send the report to the landlord, with the checks and photos on it, and raise any works orders from the findings.",
    ],
    wiring: "partial",
    caveats: [
      "The cadence - three months then every six - is a sensible guess and has not been signed off by Michael yet. It is a settings document, so it changes without a deploy.",
      /* Built 14 Sep: Raise the works order, on the finding itself. */
      "A finding that asks for a works order carries Raise the works order. Pick the trade and how urgent it is - neither is on the finding, so neither is guessed - and the job opens on Maintenance with the room, the item and what you saw already on it.",
      "The Due list needs REX for the managed book. Where REX is not connected the screen says so rather than showing an empty board.",
      /* The printable report landed 14 Sep - Print the report on a written-up
         visit. Photographs on a finding are still open. */
      /* Photographs landed 14-15 Sep. The one real gap left is the emailed
         copy, whose template is text - see INSPECTION_LANDLORD_REPORT. */
      "Photographs go on a finding and come out on the printed report. The emailed copy is still words only, so send the print when the pictures are the point.",
      /* 1 Oct 2026: the board reads REX PM's own task list (lib/rexpm-tasks). */
      "Until the team books visits here, the Due list is the old property management system's own list, copied across, so the figures match it. Raising a visit from it keeps its due date.",
    ],
  },

  "/overview": {
    purpose: "Property management at a glance: one tile for each part of the job, with what is late and what is coming up.",
    does: [
      "Read the tiles: properties, maintenance, inspections, tenancy reviews, compliance, upcoming vacancies, applications, lettings and, for the owners, rent arrears.",
      "Press View all on a tile to open the screen it comes from.",
      /* James, 21 Oct 2026: these three came off the Portfolio menu and live here. */
      "Inspections, Tenancy Reviews and Move-outs are not on the menu any more: click the Inspections, Tenancy Reviews or Upcoming Vacancies tile here and the whole board opens in a pop-out, with everything the old tab had. Close it with the cross, Esc or Back.",
      "Press Read again at the bottom to refresh every tile.",
    ],
    wiring: "live",
    caveats: [
      "Every figure is read from the screen the tile opens, so the two always agree, and an agent sees their own book just as they do there.",
      "Upcoming vacancies is the Move-outs list: tenancies ending, the late ones and the next 30 days, with homes on the market and let agreed beside them.",
      "Rent arrears is shown to the business owners only.",
    ],
  },

  "/tenancy-reviews": {
    purpose: "Every tenancy coming up to its anniversary, and what was decided about it. Opened from the Tenancy Reviews tile on Overview (it is not on the menu).",
    does: [
      "Read the list of tenancies owed a review, latest first by how late they are, with the agreement and the rent on each.",
      "Press Record review and say what was decided: the rent goes up (with the new rent and the date), renewed at the same rent, left as it is, the tenancy is ending, or something else.",
      "Read what has been decided on the Done tab, and the reviews and rent rises recorded this month at the top.",
    ],
    wiring: "partial",
    caveats: [
      "Until the team records reviews here, the list is the old property management system's own, copied across, so the figures match it. A review recorded here comes off the list straight away.",
      "Recording a review does not change the rent anywhere else yet. The new rent still has to be put through on the tenancy and with the landlord's statement.",
      "Nothing on this screen writes to the tenant or the landlord.",
    ],
  },

  "/move-outs": {
    purpose: "Every tenancy that is ending: the day the tenants go, and the jobs that close it off. Opened from the Upcoming Vacancies tile on Overview (it is not on the menu).",
    does: [
      "Read the list of tenancies ending, the late ones first, with the move-out day, the landlord, how far along it is and any follow-up date.",
      "Press Close move-out and say what happened: they moved out (the day, and which of the check-out, keys, meters, deposit and re-let are done), they are staying after all, or something else.",
      "Read what has been closed on the Done tab, and the figures at the top: moving out, already late, in the next 30 days and closed this month.",
    ],
    wiring: "partial",
    caveats: [
      "Until the team closes move-outs here, the list is the old property management system's own, copied across, so the figures match it. One closed here comes off the list straight away.",
      "A tenancy review recorded as ending lands on this list too, with no move-out day until one is set.",
      "Closing a move-out does not book the check-out, return the deposit or put the home on the market. Those are still done where they are done today.",
    ],
  },

  "/portfolio": {
    /* Rewritten 14 Nov 2026 (James: "make sure he is up to date"). It still
       said "Nothing on this screen writes to REX" and that PayProp's rent was
       not read, so Steve sent agents to REX for changes the home's page makes. */
    purpose: "The whole managed book - every home we manage or collect rent on, its landlord, who lives there and what is due. A home joins at move-in.",
    does: [
      "Search the book by address, landlord, tenant or agent, and filter it by service level, agent, town or certificates needing a look. Office staff see the whole business; an agent sees their own homes.",
      "Open a home for its full page, with the tabs Overview, Tenancy, Compliance, Maintenance, Inspections, Documents and Notes.",
      "The Rent box shows the rent PayProp is billing now and whether it has been paid. Who lives there follows PayProp's tenancy running today, so a new flatmate on a renewal shows and somebody who has left drops off.",
      "Edit on a tenant changes their name, mobile and email. Edit on The Details changes the service, let type, tenancy dates, gas and who lives there.",
      "The landlord card: Edit their details, add their home address, a second email marked Work or Personal, joint landlords and points of contact, their zero deposit opt-out and which job emails they get. A Scottish home also takes the landlord registration numbers there.",
      "Rent review (a Section 13 rent increase) and Serve notice (Section 8) are on the home's page; Tenant gave notice starts the move-out.",
      "Book a property visit, or Record a past visit, for the home's inspections. Report a repair raises a job on Maintenance and ends on its works order.",
      "Email sends the tenants, the landlord or both an email from the home, with any of its certificates or documents attached. Send out logins gives tenants their own account.",
      "Move a home to another agent, Use as a case study, and (compliance and owners) Archive this home once we no longer look after it.",
      "Take on a home brings in one we are taking over from another agent, with its sitting tenants.",
      "The three charts of the book (service, town, rent) are on the PM Dashboard (/overview); pressing a slice opens Portfolio filtered to it.",
    ],
    wiring: "live",
    caveats: [
      "Let Only homes are not on Portfolio: we let them and the landlord looks after them. A Let Only let's details, right to rent included, go on the let's own page in Applications.",
      "A tenant who came over from the old property management system with no contact behind them is kept in the OS: changing their name or email there is saved on the home, not sent anywhere else. A landlord's contact changes are saved back to their main record.",
      "Certificates take a few minutes to read the first time each day and fill in behind the list. Until then the certificate column says it is checking.",
    ],
  },

  "/finances": {
    purpose:
      "Fee income on the accounts' own basis — a fee belongs to the month its batch transferred, net of VAT.",
    does: ["Read your own board of finance tiles.", "Customise the board tile by tile."],
    wiring: "live",
    caveats: [
      "Partner joining fees run through a separate bank account, so they are not here and never will be.",
      "PayProp money only starts in August 2025. Anything earlier is not missing, it does not exist.",
    ],
  },
};

/* The rail and the route union describe the same screens, so they are checked
   against each other once, here, at module load. This throws in development
   the moment they diverge rather than the assistant quietly losing a screen —
   and it cannot throw in front of an agent, because it runs when the server
   loads the module, not when somebody asks a question. */
const mismatch = navRoutesMismatch();
if (mismatch.length) {
  throw new Error(`lib/nav.ts and lib/screens.ts disagree:\n  ${mismatch.join("\n  ")}`);
}

/** The rail's own label for a route, so the assistant calls screens what the rail calls them. */
export function labelFor(route: AgentRoute): string {
  /* Off the rail (Compliance, Inspections, Move-outs ...) it read "/compliance - /compliance" to him (14 Nov 2026). */
  const named: Record<string, string> = { "/overview": "PM Dashboard", "/case-studies": "Case Studies", "/tenancy-reviews": "Tenancy Reviews", "/move-outs": "Move-outs" };
  return AGENT_NAV.find((n) => n.href === route)?.label ?? named[route] ?? route.slice(1).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The screens section of the system prompt.
 *
 * Written as instructions to somebody being shown round rather than as a
 * schema dump: the model reads better from prose than from JSON, and every
 * token here is cached anyway, so clarity costs nothing per request.
 */
export function screensSection(): string {
  const body = AGENT_ROUTES.map((route) => {
    const s = SCREENS[route];
    const lines = [`### ${labelFor(route)} — ${route}`, s.purpose];

    if (s.does.length) {
      lines.push("", "What you can do here:", ...s.does.map((d) => `   · ${d}`));
    }
    if (s.next) lines.push("", `Where it goes next: ${s.next}`);

    if (s.wiring === "shell") {
      lines.push("", "NOT WIRED YET. Do not tell anyone to do a job on this screen.");
    } else if (s.wiring === "partial") {
      lines.push("", "Mostly working, with the exceptions below.");
    }
    if (s.caveats?.length) {
      lines.push("What does NOT work, and what to do instead:", ...s.caveats.map((c) => `   · ${c}`));
    }
    return lines.join("\n");
  }).join("\n\n");

  return `## The screens, and what actually works on each

Every screen below is one an ordinary agent can reach from the rail. When you
name one, write it as a markdown link using EXACTLY the path given — for
example [Market Appraisals](/market-appraisals) — because those become buttons
that take the person straight there. Never invent a path that is not on this
list; a button that goes nowhere is worse than no button.

${body}`;
}
