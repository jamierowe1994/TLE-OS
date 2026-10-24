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
  { id: "steve", label: "Steve", what: "The new Steve character in the corner, and his bubble cut down to the chat with a Report button." },
  { id: "listings", label: "Listings board", what: "The Listings page: type-only header, the filter row, text tabs and the new cards." },
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
  { id: "contractors", label: "Contractors", what: "The contractor list and each contractor's details." },
  { id: "finances", label: "Finances", what: "Income, costs and the figures behind them." },
  { id: "compliance", label: "Compliance", what: "Certificates across the book: what's in date, due and missing." },
  { id: "plc", label: "PLC", what: "Pre-let checks: the queue and the review screen." },
  { id: "advert", label: "Edit advert", what: "The advert editor on a listing." },
  { id: "help", label: "Help", what: "Guides and help." },
  { id: "admin", label: "Admin", what: "Admin's home, People and the admin tools." },
  /* Not a reskin: a new way of working (James, 24 Oct 2026), so it carries its own warning. */
  /* The fade between screens in place of the fold-and-drop (James, 24 Oct 2026): every screen, so its own switch. */
  { id: "fade", label: "Page transitions", what: "Moving between screens: a slow fade out and a slow fade in, in place of the page folding and dropping away." },
  /* The warm page (James, 24 Oct 2026): tried on the dashboard first, then "Push it" for every screen. */
  { id: "warm", label: "Warm page", what: "Every screen's page in warm off-white (#f8f7f4) in place of white, inside the new sidebar. Needs the Sidebar and frame switch on. Light mode only." },
  { id: "terms", label: "Send the terms (signed on our page)", what: "The new Send the Terms screen: the contract on the left, check, sign and send down the right, signed on our page and sealed by DocuSeal. Off, agents send from the drawer and sign in DocuSeal's own box. Landlords sign on our page either way." },
  { id: "builder", label: "Build the presentation", what: "The four-step builder: the home, comparables with the radius map, the figure with the local market cards, then the real deck live. Off, the five-step builder as before." },
  /* The tenant passport as a book (James's design, 24 Oct 2026). A customer screen: anonymous tenants only ever see it at Everyone (app/tenant/(public)/passport). */
  { id: "passport", label: "Tenant passport", what: "The passport as a book with seven stamped steps (James's design). Off, tenants get today's passport. Shown to signed-in staff by the level, and to tenants only at Everyone." },
  { id: "booking", label: "Book a viewing (tenants)", what: "The new five-step booking window: home, time, access, messages, book. On, every place a tenant viewing is booked opens it - the lead, the listing, Viewings and Enquiries - and the landlord's email, the tenant's notice and the access record go out from it when the agent presses Book." },
] as const;

export type LookScreen = (typeof LOOK_SCREENS)[number]["id"];

export const isLookLevel = (v: unknown): v is LookLevel => LOOK_LEVELS.some((l) => l.id === v);
export const isLookScreen = (v: unknown): v is LookScreen => LOOK_SCREENS.some((s) => s.id === v);

/** Who is on, screen by screen. */
export type LookOn = Record<LookScreen, boolean>;

export const ALL_OFF = Object.fromEntries(LOOK_SCREENS.map((d) => [d.id, false])) as LookOn;
