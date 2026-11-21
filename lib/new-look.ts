/**
 * The new look (Claude Design, 23 Oct 2026), brought in one screen at a time.
 *
 * James: "What I don't want to do is overhaul everything in one go and have
 * everyone freak out." So each reskinned screen has its own switch in Admin >
 * Switches, and the old screen stays in the code underneath until the new one
 * has bedded in. Nothing here changes data, permissions or what a button does -
 * only the markup and the paint around them.
 *
 * Positions run from nobody to everybody: off, only me (whoever set it), owners (James and Susan, to
 * look at it on real data), testers (the area testers list), everyone.
 *
 * The scoped colours and type live in app/new-look.css under [data-look="new"],
 * so a reskinned screen repaints itself and whatever older pieces sit inside it,
 * and nothing outside it moves.
 */

export type LookLevel = "off" | "me" | "owners" | "testers" | "everyone";

export const LOOK_LEVELS: { id: LookLevel; label: string; says: string }[] = [
  { id: "off", label: "Off", says: "Everybody sees the screen as it is today." },
  /* James, 23 Oct 2026: "push this so only I can see it". Owners is four people
     (James, Susan, Sean, Howard), so this is narrower: whoever set it, alone. */
  { id: "me", label: "Only me", says: "Only the person who set it sees the new look - it says who underneath." },
  { id: "owners", label: "Owners", says: "James and Susan see the new look. Nobody else does." },
  { id: "testers", label: "Testers", says: "Owners and the testers on the list above see it." },
  { id: "everyone", label: "Everyone", says: "Live for the whole team." },
];

export const LOOK_SCREENS = [
  { id: "nav", label: "Sidebar and frame", what: "The sidebar as the design has it: flat, full height, one straight line down to a white page, no rounded panel. Every screen sits in it." },
  { id: "orb", label: "Steve as an orb", what: "Steve drawn as a moving coral ball everywhere he appears: always turning inside, quicker when he's thinking, pulsing as you type to him, wobbling when pressed. Off, the character." },
  { id: "steve", label: "Steve", what: "The new Steve character in the corner, and his bubble cut down to the chat with a Report button." },
  { id: "listings", label: "Listings board", what: "The Listings page: type-only header, the filter row, text tabs and the new cards." },
  { id: "spine", label: "Graded progress line", what: "The listing's progress line fills in sage, pale at the start to dark at the stage it's on, instead of black then coral." },
  { id: "listing", label: "Listing page", what: "One listing: the head with its two jobs, the big photo beside The Details, the progress line and the tabs." },
  { id: "settings", label: "Settings", what: "Your Profile, every tab: the form with the landlord's preview, appearance, connections, automations and the rest." },
  /* The rest of the site (James, 23 Oct 2026): built behind these, each turned on when he's ready. */
  { id: "dashboard", label: "Dashboard", what: "The greeting, today's diary and the figures, laid out as the design has them." },
  { id: "huddles", label: "Huddles", what: "The team chats: the list of huddles and the conversation beside it." },
  { id: "leads", label: "Leads board", what: "Leads: the header, filter row, text tabs and the new rows." },
  { id: "lead", label: "Lead page", what: "One lead: the head, their details, the timeline and what happens next." },
  { id: "appraisals", label: "Market Appraisals board", what: "Market Appraisals: the list of booked and done appraisals with their stages." },
  { id: "appraisal", label: "Appraisal page", what: "One appraisal: the stages from booking to terms, the landlord and the home." },
  { id: "diary", label: "Diary", what: "The diary: the week and month views and the appointment drawer." },
  { id: "applications", label: "Applications board", what: "Applications: lets in progress, their stage and what each is waiting on." },
  { id: "application", label: "Application page", what: "One let in progress: the tenants, the checks, the documents and the handover." },
  { id: "portfolio", label: "Portfolio", what: "Portfolio and the list of homes under management." },
  { id: "property", label: "Property page", what: "One managed home: rent, tenancy, certificates, works and documents." },
  { id: "overview", label: "Back-office Overview", what: "The back office at a glance." },
  { id: "maintenance", label: "Maintenance", what: "Repairs and planned jobs, grouped as the design has them." },
  /* One job's own page (James, 25 Oct 2026: "it pulled through this old view... redesign this with the new style in mind"). */
  { id: "job", label: "Job page", what: "One repair or planned job: the head, the stage it's at, the progress and its actions, in the new style. Off, the page as it is." },
  { id: "contractors", label: "Contractors", what: "The contractor list and each contractor's details." },
  { id: "tools", label: "Tools", what: "The Tools page in the new style: each group's tools as tiles, with Learning and its Library. Off, the page as it is." },
  { id: "finances", label: "Finances", what: "Income, costs and the figures behind them." },
  { id: "compliance", label: "Compliance", what: "Certificates across the book: what's in date, due and missing." },
  { id: "plc", label: "PLC", what: "Pre-let checks: the queue and the review screen." },
  { id: "advert", label: "Edit advert", what: "The advert editor on a listing." },
  { id: "help", label: "Help", what: "Guides and help." },
  { id: "admin", label: "Admin", what: "Admin's home, People and the admin tools." },
  /* Not a reskin: a new way of working (James, 24 Oct 2026), so it carries its own warning. */
  /* The fade between screens in place of the fold-and-drop (James, 24 Oct 2026): every screen, so its own switch. */
  { id: "fade", label: "Page transitions", what: "Moving between screens: a slow fade out and a slow fade in, in place of the page folding and dropping away." },
  /* The entrance (James, 26 Oct 2026): the painting no longer fits the new look. */
  { id: "entrance", label: "Entrance", what: "The first screen of a visit: a coral line comes in from the left, writes TLE, runs flat, writes OS and leaves to the right, then fades into the page as it pops in. Once a visit, never on a refresh. Off, the painting and the logo." },
  /* Steve's entrance (James, 21 Nov 2026): made in Blender, with sound. Wins over Entrance when both are on. */
  { id: "entrancesteve", label: "Entrance: Steve", what: "The first screen of a visit, in 3D: the letters TLE OS drop onto linen, one lands crooked, Steve rolls in, knocks it straight, looks at you and jumps out of the top as the page opens. Three seconds, four versions picked at random, with a quiet sound each person can turn off in Profile. Once a visit, never on a refresh. Off, whatever Entrance says." },
  /* Not a reskin (James, 5 Nov 2026): the November 2026 terms, with the questions about the home asked before the
     contract, a check for the agent before sending, and the landlord's bank details on the contract. */
  { id: "termsqs", label: "Questions before signing", what: "Terms go out on the November 2026 wording: bank details and the landlord declarations on page 2. Sending, the agent sees what the landlord will be asked about the home and answers what they know (never gas or bank details); the landlord answers the rest a few questions at a time before the contract opens. Off, the October terms and no questions first." },
  { id: "terms", label: "Send the terms (signed on our page)", what: "The new Send the Terms screen: the contract on the left, check, sign and send down the right, signed on our page and sealed by DocuSeal. Off, agents send from the drawer and sign in DocuSeal's own box. Landlords sign on our page either way." },
  /* The tenant passport as a book (James's design, 24 Oct 2026). A customer screen: anonymous tenants only ever see it at Everyone (app/tenant/(public)/passport). */
  { id: "passport", label: "Tenant passport", what: "The passport as a book with seven stamped steps (James's design). Off, tenants get today's passport. Shown to signed-in staff by the level, and to tenants only at Everyone." },
  { id: "search", label: "Search (floating)", what: "Search for anything as floating boxes: the search bar on its own at the top, and the recents or the results each in their own box over a darkened page. Off, the search box as it is." },
  /* The agents' phone app (James, 27 Oct 2026: "bring it in line with what we've got ... minimalistic but gets to
     the point"). The installed app and the iPhone app both open /agent, so one switch covers both. */
  { id: "app", label: "Phone app", what: "The agents' phone app, home screen and iPhone: white, the orange action, type-only headings with no paintings, line icons, text tabs and fewer words. Off, the pastel app as it is." },
  /* The landlord and tenant portals in the house's square style (James, 18 Nov 2026: "bring them in line with
     what the rest of the portal and the website look like"). Customer screens: a landlord or tenant is never
     signed in to the OS, so they only see it at Everyone (lib/portal-look); below that, staff the level covers. */
  { id: "portals", label: "Landlord and tenant portals", what: "The landlord's and the tenant's own pages in the house style: cream sidebar, square boxes, titles in the condensed capitals, brown buttons, no pink. At Everyone, every landlord and tenant sees it; below that, only the staff it covers (the sample portals). Off, today's look." },
  { id: "booking", label: "Book a viewing (tenants)", what: "The new five-step booking window: home, time, access, messages, book. On, every place a tenant viewing is booked opens it - the lead, the listing, Viewings and Enquiries - and the landlord's email, the tenant's notice and the access record go out from it when the agent presses Book." },
  /* Not a reskin (James, 4 Nov 2026): nearly half the reports were things agents could fix themselves (lib/report-deflect). Needs Steve's new look. */
  /* Not a reskin (James, 18 Nov 2026): 11 of 18 decks sent in November were never opened and nothing told the agent;
     and terms were sent from the home's Compliance tab while the appraisal's valuation had never gone. */
  { id: "decknudge", label: "Valuation deck nudges", what: "The agent's bell says when a valuation deck hasn't been opened two days after it went, when the landlord has just opened it, and when a pre-appraisal is unopened before the visit. Sending terms from a home's Compliance tab, the agent is pointed to the appraisal first if its valuation never went out. Nothing goes to a landlord. Off, none of it." },
  { id: "portalwhy", label: "Why it won't go to the portals", what: "When the portals' own checks stop a listing, Push to the portals says what is missing in plain words and takes the agent to it, in Edit the Advert and on the listing. A relet that lands on a listing already there with no agent named puts the agent pressing Relet on it. Off, the button only says the portals' checks haven't passed, and a relet leaves the agent blank." },
  /* Not reskins (Stuart Roper, 18 Nov 2026): files on an email, and a free report a landlord gets before any appraisal is booked. */
  { id: "attach", label: "Attach files to an email", what: "The Write an Email window gets Attach Files: up to 10 files, 20MB together, sent with the email. Up to 3MB together it goes from the agent's own Outlook as now; above that Outlook will not take it, so it goes from The Letting Experts with the agent's address to reply to, and the window says so before Send. Off, no attachments." },
  { id: "quickreport", label: "Free rental report for a landlord", what: "The Write an Email window to a landlord gets Generate Report: pick Rental Report (their home, with what homes its size are advertised for nearby) or Market Report (their area), check the two pages, and it is attached to the email as a PDF. Every figure is read live from the adverts when it is made; if they can't be read, no report. Nothing is sent until the agent presses Send. Off, no button." },
  /* Not a reskin (James and Michael Healy, 19-20 Nov 2026): in Scotland a rent rise is the prescribed rent-increase
     notice, not a Section 13 (lib/rent-reviews). On in the demo copy whatever the level (lib/new-look-store). */
  { id: "scotrent", label: "Scottish rent review (rent increase notice)", what: "On a Scottish home, Rent review in the three-dots menu opens the rent-increase notice (s.22, PRT): the notice on the left, four steps on the right, checked dates, then each tenant emailed the PDF from the agent's Outlook, the notice saved to the home's Documents, accounts told to amend PayProp, and Michael's Rent Reviews tab on the compliance desk. English homes keep the Section 13. Off, Scottish homes get the Section 13 checklist as now." },
  /* Not a reskin (Dan, ticket b7a79378, 20 Nov 2026): a pre-management home where the landlord settled with the contractor. Needs the Job page's new look. */
  { id: "landlordpaid", label: "Landlord paid directly on a job", what: "On a job's Who's Being Paid step, a third choice: The Landlord Paid Directly. It records who said so and when on the job, shows the invoice and payment as Not needed and closes the job as settled. Nothing goes to accounts, nothing is added to the payment run and there is no invoice to the landlord; the contractor's invoice or the landlord's receipt can still go on the job with Add a File. Off, the contractor or the agent only, as now." },
  { id: "fixit", label: "Report: put it right yourself", what: "A report from a listing, a let or a home that something is wrong, missing or can't be changed gets Steve's offer first: Edit on the record, and he shows where it is. A how-do-I gets his answer first. Send it to James anyway is always there. Off, every report goes straight to James." },
] as const;

export type LookScreen = (typeof LOOK_SCREENS)[number]["id"];

export const isLookLevel = (v: unknown): v is LookLevel => LOOK_LEVELS.some((l) => l.id === v);
export const isLookScreen = (v: unknown): v is LookScreen => LOOK_SCREENS.some((s) => s.id === v);

/** Who is on, screen by screen. */
export type LookOn = Record<LookScreen, boolean>;

export const ALL_OFF = Object.fromEntries(LOOK_SCREENS.map((d) => [d.id, false])) as LookOn;
