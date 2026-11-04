/**
 * STEVE SHOWS YOU WHERE THINGS ARE (James, 18 Sep 2026).
 *
 * "He should be able to highlight the thing on the page that they're needing
 * to find ... if they're on that tab already, he won't point them to that
 * tab. He'll then show them the next thing they need to click on." And it
 * carries across pages: point at Leads, they click, the page changes, he
 * points at the lead, they open it, he points at Add a note.
 *
 * ── A route is a list of steps, and each step knows when it is done ──────
 *
 * Every step names what to point at, what Steve says, and a condition that is
 * TRUE once the step has happened: "they are on /leads", "a lead's file is
 * open", "they clicked it". The guide (components/SteveGuide) always shows the
 * FIRST step that is not yet done. That one rule is the whole of the context
 * awareness: already on Leads, with a lead open, the first two steps are
 * already true and he goes straight to the button.
 *
 * ── What he points at ────────────────────────────────────────────────────
 *
 * Stable handles, never text or classes: the rail's `data-nav="<href>"`
 * (Shell, set for the new-starter tour) and `data-steve="<id>"` on the
 * controls inside pages and drawers. A control that is renamed or restyled
 * keeps its handle; a guide matching on "Add note" would break the day the
 * button said "New note".
 *
 * Pure and shared: the tool on the server offers the targets to the model by
 * id and description, and the guide in the browser walks the route.
 */

export type DoneWhen =
  /** The pathname starts with this (query ignored). */
  | { path: string }
  /** An element matching this is on screen. */
  | { present: string }
  /** They clicked the thing being pointed at. */
  | { clicked: true }
  /** Any of these. */
  | { any: DoneWhen[] };

export type GuideStep = {
  /** Selectors tried in order; the first visible match is spotlit. */
  point: string[];
  /** What Steve says beside it. Short: one line, what to press and why. */
  say: string;
  done: DoneWhen;
};

export type GuideTarget = {
  id: string;
  /** For the model: what this is, in the words somebody would ask for it. */
  about: string;
  steps: GuideStep[];
};

/* ── The pieces routes are built from ─────────────────────────────────── */

const nav = (href: string, label: string, why?: string): GuideStep => ({
  point: [`[data-nav="${href}"]`],
  say: `Click ${label} in the menu on the left${why ? ` - ${why}` : ""}.`,
  done: { path: href.split("?")[0] },
});

/** Leads is a parent in the rail: it opens Add new lead / Tenant / Landlord. */
const toLeads = (side?: "tenant" | "landlord"): GuideStep[] => [
  {
    point: ['[data-nav="/leads"]'],
    say: "Click Leads in the menu on the left.",
    /* Its submenu opening - or, with the rail collapsed (no submenu), just
       arriving on Leads. */
    done: { any: [{ present: '[data-nav="/leads?side=tenant"]' }, { path: "/leads" }] },
  },
  {
    point: [`[data-nav="/leads?side=${side ?? "tenant"}"]`],
    say: side ? `Now ${side === "tenant" ? "Tenant" : "Landlord"} - that is your ${side} leads.` : "Now Tenant or Landlord, whichever side you are after.",
    done: { path: "/leads" },
  },
];

/** Admin's own sidebar, once inside Admin. */
const toAdmin = (href: string, label: string): GuideStep[] => [
  { point: ['[data-nav="/admin"]'], say: "Click Admin, under Your workspaces in the menu on the left.", done: { path: "/admin" } },
  ...(href === "/admin" ? [] : [{ point: [`[data-admin-nav="${href}"]`], say: `Now ${label} in the Admin menu.`, done: { path: href } } as GuideStep]),
];

const press = (id: string, say: string): GuideStep => ({ point: [`[data-steve="${id}"]`], say, done: { clicked: true } });
/** Open a record from its list: point at a row until its drawer is up. */
const openRow = (drawer: string, say: string): GuideStep => ({
  point: ["[data-steve-row]"],
  say,
  done: { present: `[data-steve="${drawer}"]` },
});

/* ── The targets ─────────────────────────────────────────────────────── */

export const GUIDE_TARGETS: GuideTarget[] = [
  /* Screens */
  { id: "dashboard", about: "The dashboard - their day at a glance", steps: [nav("/dashboard", "Dashboard")] },
  { id: "leads", about: "The leads board - every enquiry, tenant and landlord", steps: toLeads() },
  { id: "leads.tenant", about: "Tenant leads", steps: toLeads("tenant") },
  { id: "leads.landlord", about: "Landlord leads", steps: toLeads("landlord") },
  { id: "market-appraisals", about: "Market appraisals - valuations booked with landlords", steps: [nav("/market-appraisals", "Market Appraisals")] },
  { id: "listings", about: "Listings - the homes being let, drafts and live", steps: [nav("/listings", "Listings")] },
  { id: "viewings", about: "Diary (Viewings) - the viewings diary", steps: [nav("/viewings", "Diary")] },
  { id: "applications", about: "Applications - tenants who have applied for a home", steps: [nav("/applications", "Applications")] },
  { id: "admin", about: "Admin overview (owners only)", steps: toAdmin("/admin", "Overview") },
  { id: "admin.people", about: "Admin > People - who has an account", steps: toAdmin("/admin/people", "People") },
  { id: "admin.permissions", about: "Admin > Permissions - what each role can see and do", steps: toAdmin("/admin/permissions", "Permissions") },

  /* Things on those screens. Each route starts from wherever they are: the
     steps already true are skipped. */
  { id: "dashboard.customise", about: "Customise the dashboard - add, move or hide tiles", steps: [nav("/dashboard", "Dashboard"), press("dash.customise", "Customise, top right - then drag tiles about, or add and hide them.")] },
  { id: "lead.new", about: "Add a new lead by hand", steps: [...toLeads(), press("leads.new", "New lead, top right. Their details, then Save.")] },
  {
    id: "lead.note",
    about: "Add a note to a lead's file (what was said on a call, what to remember)",
    steps: [
      ...toLeads(),
      openRow("lead.drawer", "Click the lead you want - their file opens."),
      { point: ["#lead-note"], say: "Type your note in here - what was said, what to remember.", done: { clicked: true } },
      press("lead.save-note", "Then Save note. It goes on their file for everyone to see."),
    ],
  },
  {
    id: "lead.book-appraisal",
    about: "Book a market appraisal for a landlord lead",
    steps: [...toLeads("landlord"), openRow("lead.drawer", "Open the landlord's lead."), press("lead.book-appraisal", "This one - they said yes, book the appraisal.")],
  },
  {
    id: "lead.passport",
    about: "Send a tenant their passport (the form that becomes their application)",
    steps: [...toLeads("tenant"), openRow("lead.drawer", "Open the tenant's lead."), press("lead.passport", "Send passport - it goes to them by email.")],
  },
  { id: "appraisal.book", about: "Book a market appraisal from scratch", steps: [nav("/market-appraisals", "Market Appraisals"), press("ma.book", "Book an appraisal, top right.")] },
  {
    id: "appraisal.presentation",
    about: "Build or update the presentation (the deck) for an appraisal",
    steps: [
      nav("/market-appraisals", "Market Appraisals"),
      { point: ["[data-steve-row]"], say: "Open the appraisal you want.", done: { present: '[data-steve="appraisal.build"]' } },
      press("appraisal.build", "Build presentation - or Update, if there is one already."),
    ],
  },
  /* Jade Grewal, 15 Oct 2026: "how do i sent out terms of business" - and
     she was told they go through REX. They go from the appraisal's Prepare
     and send screen (components/appraisal/PrepareAndSend), which marks each
     of its four steps data-done, so the walk starts at whichever one is
     left: look through the booklet, their home address and the tick, sign
     your half, send. */
  {
    id: "appraisal.terms",
    about: "Send a landlord their terms of business (Prepare and send on the appraisal: check the deck, their home address, tick the details, sign your half, send it). Also how to change the fees before sending",
    steps: [
      nav("/market-appraisals", "Market Appraisals"),
      {
        point: ["[data-steve-row]"],
        say: "Open the landlord's appraisal.",
        done: { any: [{ present: '[data-steve="terms.prepare"]' }, { present: '[data-steve="terms.build-deck"]' }, { present: '[data-steve="terms.step1"]' }] },
      },
      {
        point: ['[data-steve="terms.prepare"]', '[data-steve="terms.build-deck"]'],
        say: "Prepare the presentation and sign, on the Next up card. If it says Build the post-appraisal, build that deck first - the terms go with it.",
        done: { present: '[data-steve="terms.step1"]' },
      },
      {
        point: ['[data-steve="terms.booklet-next"]'],
        say: "This is what the landlord will get. Open it with Next - you don't have to read to the end.",
        done: { present: '[data-steve="terms.step1"][data-done]' },
      },
      {
        point: ['[data-steve="terms.same-as-let"]', '[data-steve="terms.home"]'],
        say: "Their home address goes on the contract. It fills from their record - if it's blank, type it and Save, or press Same as the let property if they live there.",
        done: { present: '[data-steve="terms.home"][data-done]' },
      },
      {
        point: ['[data-steve="terms.tick"]'],
        say: "Check the landlord, fees and dates, then tick. Fees not right? Change the fees, just below the tick.",
        done: { present: '[data-steve="terms.step2"][data-done]' },
      },
      {
        point: ['[data-steve="terms.sign"]'],
        say: "Draw up the contract and sign your half - the landlord can't open theirs until you have.",
        done: { present: '[data-steve="terms.step3"][data-done]' },
      },
      {
        point: ['[data-steve="terms.send"]'],
        say: "Send it. One email from you: the presentation and a link to sign. It nudges them by itself after 2, 5 and 9 days.",
        done: { any: [{ clicked: true }, { present: '[data-steve="terms.step4"][data-done]' }] },
      },
    ],
  },
  {
    id: "appraisal.terms-chase",
    about: "Chase terms of business already sent and not yet signed (Nudge to sign on the appraisal)",
    steps: [
      nav("/market-appraisals", "Market Appraisals"),
      { point: ["[data-steve-row]"], say: "Open the landlord's appraisal.", done: { present: '[data-steve="terms.nudge"]' } },
      press("terms.nudge", "Nudge to sign - a short reminder from you, with their link. It also nudges by itself 2, 5 and 9 days after sending."),
    ],
  },
  { id: "listing.new", about: "Add a new listing (five screens: the home, the landlord, the let, check, then terms to sign and send)", steps: [nav("/listings", "Listings"), press("listings.new", "Add new listing, top right.")] },
  { id: "listing.open", about: "Open a listing's file", steps: [nav("/listings", "Listings"), openRow("listing.drawer", "Click the home you want - its file opens.")] },
  ...(["marketing", "compliance", "documents", "viewings", "applications"] as const).map((tab) => ({
    id: `listing.${tab}`,
    about: `A listing's ${tab} tab${tab === "marketing" ? " - the write-up and photos for the portals" : tab === "compliance" ? " - its certificates" : ""}`,
    steps: [
      nav("/listings", "Listings"),
      openRow("listing.drawer", "Click the home you want - its file opens."),
      /* Documents is inside Compliance, and Marketing is the Edit the advert tile (12 Oct 2026). */
      press(`listing.tab.${tab === "documents" ? "compliance" : tab}`, tab === "marketing" ? "Edit the advert." : tab === "documents" ? "Compliance - the documents are in there." : tab === "applications" ? "Offers." : `${tab.charAt(0).toUpperCase() + tab.slice(1)}.`),
    ],
  })),
  {
    id: "listing.mail-db",
    about: "Mail the database - send a listing to every tenant it suits",
    steps: [nav("/listings", "Listings"), openRow("listing.drawer", "Open the home you want to send out."), press("listing.mail-db", "Mail the database.")],
  },
  {
    id: "viewing.open",
    about: "Open a viewing's file",
    steps: [
      nav("/viewings", "Diary"),
      openRow("appointment.drawer", "Click the viewing in the diary."),
      press("appointment.open-viewing", "Open the viewing file."),
    ],
  },
  {
    id: "viewing.feedback",
    about: "Record feedback on a viewing, or mark a no-show",
    steps: [
      nav("/viewings", "Diary"),
      openRow("appointment.drawer", "Click the viewing that has happened."),
      { point: ['[data-steve="appointment.open-viewing"]'], say: "Open the viewing file.", done: { present: '[data-steve="viewing.drawer"]' } },
      press("viewing.complete", "Complete the viewing - whether they came, and what they thought."),
    ],
  },
  {
    id: "viewing.note",
    about: "Add a note to a viewing",
    steps: [
      nav("/viewings", "Diary"),
      openRow("appointment.drawer", "Click the viewing."),
      { point: ['[data-steve="appointment.open-viewing"]'], say: "Open the viewing file.", done: { present: '[data-steve="viewing.drawer"]' } },
      { point: ['[data-steve="viewing.note"]'], say: "Type it here and press Enter.", done: { clicked: true } },
    ],
  },
  {
    id: "application.comment",
    about: "Add a comment to an application (chased the tenant, waiting on a reference)",
    steps: [
      nav("/applications", "Applications"),
      openRow("application.drawer", "Click the application."),
      { point: ['[data-steve="application.comment"]'], say: "Write it here.", done: { clicked: true } },
      press("application.post", "Then Post comment."),
    ],
  },
  { id: "application.open", about: "Open an application", steps: [nav("/applications", "Applications"), openRow("application.drawer", "Click the application you want.")] },
  { id: "admin.view-as", about: "See the OS as somebody else sees it (Admin > People > View as)", steps: [...toAdmin("/admin/people", "People"), press("people.view-as", "View as - you see exactly what they see.")] },
  { id: "admin.change-role", about: "Change somebody's role (Admin > Permissions)", steps: [...toAdmin("/admin/permissions", "Permissions"), press("perm.set-role", "Make them the role you want - it applies straight away.")] },

  /* ── Put it right yourself: Edit on the record (James, 4 Nov 2026) ──────
     Where each Edit is on a let, a listing and a managed home. The report
     form sends people here when what they are reporting is a detail they
     can change themselves (lib/report-deflect), and Steve can show them from
     "how do I change the move-in date?". A let or a listing is opened from
     its board first; a home's routes start on the home's own page, so Steve
     opens it with the walk-through (open_file walkThrough). */
  {
    id: "edit.let-deal",
    about: "Change a let's move-in date, deposit, rent, holding fee or tenancy length (Edit on The Deal, on the let's page)",
    steps: [
      nav("/applications", "Applications"),
      openRow("application.drawer", "Open the let."),
      press("application.edit-figures", "Edit on The Deal: the move-in date, deposit, rent, holding fee and tenancy length. Change it and Save."),
    ],
  },
  {
    id: "edit.let-tenant",
    about: "Change a tenant's name, mobile or email on a let (People, then Edit on the tenant)",
    steps: [
      nav("/applications", "Applications"),
      openRow("application.drawer", "Open the let."),
      {
        point: ['[data-steve="application.tab.people"]'],
        say: "People - the tenants are in there.",
        done: { any: [{ present: '[data-steve="application.edit-tenant"]' }, { present: '[data-steve="application.tenant-form"]' }] },
      },
      {
        point: ['[data-steve="application.edit-tenant"]'],
        say: "Edit on the tenant whose details are wrong: their name, mobile and email. Change it and Save.",
        done: { any: [{ clicked: true }, { present: '[data-steve="application.tenant-form"]' }] },
      },
    ],
  },
  {
    id: "edit.let-landlord",
    about: "Change a landlord's details on a let, or add another landlord (People, the landlords)",
    steps: [
      nav("/applications", "Applications"),
      openRow("application.drawer", "Open the let."),
      { point: ['[data-steve="application.tab.people"]'], say: "People - the landlords are in there.", done: { present: '[data-steve="application.landlords"]' } },
      {
        point: ['[data-steve="application.landlords"]'],
        say: "Click a landlord's name, mobile or email to change it, or Add additional landlord.",
        done: { clicked: true },
      },
    ],
  },
  {
    id: "edit.listing-details",
    about: "Change a listing's rent, deposit, available date, bedrooms, bathrooms, council tax, furnishing, type of let or service (Edit on The Details, on the listing's page)",
    steps: [
      nav("/listings", "Listings"),
      openRow("listing.drawer", "Open the listing."),
      press("listing.edit-details", "Edit on The Details: rent, deposit, when it's available, bedrooms, bathrooms, council tax, furnishing, the type of let and the service."),
    ],
  },
  {
    id: "edit.listing-landlord",
    about: "Change a listing's landlord or their details, or add another landlord or a contact (Edit on the Landlord, on the listing's Overview)",
    steps: [
      nav("/listings", "Listings"),
      openRow("listing.drawer", "Open the listing."),
      { point: ['[data-steve="listing.tab.overview"]'], say: "Overview - the landlord is on it.", done: { present: '[data-steve="listing.edit-landlord"]' } },
      press("listing.edit-landlord", "Edit on the Landlord: change their details, add another landlord or a contact, or Change landlord if it's somebody else."),
    ],
  },
  {
    id: "edit.listing-registration",
    about: "Add or change a Scottish landlord's registration number and its expiry (Landlord registration, under the Landlord on the listing's Overview)",
    steps: [
      nav("/listings", "Listings"),
      openRow("listing.drawer", "Open the listing."),
      { point: ['[data-steve="listing.tab.overview"]'], say: "Overview - the landlord registration is under the landlord.", done: { present: '[data-steve="listing.edit-registration"]' } },
      press("listing.edit-registration", "Landlord registration: each landlord's number, and when it runs out."),
    ],
  },
  {
    id: "edit.listing-advert",
    about: "Change a listing's description, photos, EPC or anything else the portals show (Edit the advert)",
    steps: [nav("/listings", "Listings"), openRow("listing.drawer", "Open the listing."), press("listing.tab.marketing", "Edit the advert: the description, photos, EPC and everything the portals show.")],
  },
  {
    id: "edit.home-details",
    about: "Change a managed home's service (let only, fully managed, rent collection), type, tenancy start or end date, gas supply or who lives there, or mark it no longer managed (Edit on The Details, on the home's page). Works on that page only: open the home with this as its walkThrough",
    steps: [press("home.edit-details", "Edit on The Details: the service, the type of home, the tenancy dates, the gas supply and who lives here.")],
  },
  {
    id: "edit.home-tenant",
    about: "Change a tenant's mobile, email or name on a managed home (Edit on the tenant, on the home's Overview). Works on that page only: open the home with this as its walkThrough",
    steps: [
      {
        point: ['[data-steve="home.tab.overview"]'],
        say: "Overview - the tenants are on it.",
        done: { any: [{ present: '[data-steve="home.edit-tenant"]' }, { present: '[data-steve="home.tenant-form"]' }] },
      },
      {
        point: ['[data-steve="home.edit-tenant"]'],
        say: "Edit on the tenant whose details are wrong: their mobile, email and name. Change it and Save.",
        done: { any: [{ clicked: true }, { present: '[data-steve="home.tenant-form"]' }] },
      },
    ],
  },
  {
    id: "edit.home-landlord",
    about: "Change a managed home's landlord or their details, or add another landlord (the Landlords card on the home's Overview). Works on that page only: open the home with this as its walkThrough",
    steps: [
      { point: ['[data-steve="home.tab.overview"]'], say: "Overview - the landlords are on it.", done: { present: '[data-steve="landlords.section"]' } },
      { point: ['[data-steve="landlords.section"]'], say: "Click a landlord's name, mobile or email to change it, Add additional landlord, or Change landlord if it's somebody else.", done: { clicked: true } },
    ],
  },
  {
    id: "edit.address",
    about: "Change the address of the listing or managed home they have open (Change address). Works on that page only: open the file with this as its walkThrough",
    steps: [
      { point: ['[data-steve="listing.tab.overview"]'], say: "Overview - the address is on it.", done: { present: '[data-steve="home.change-address"]' } },
      press("home.change-address", "Change address: the whole address with the town and postcode, then Save."),
    ],
  },
];

export const guideTarget = (id: string) => GUIDE_TARGETS.find((t) => t.id === id) ?? pointTarget(id);

/**
 * A one-step guide to any control that carries a data-steve handle, for a
 * link that should land somebody on one button (Do It on Tickets, James
 * 4 Nov 2026: Claude's answer was "press Take Offline", and that should be
 * one press away). It points; the person presses, as with every guide.
 */
export const POINT_PREFIX = "point:";
export function pointTarget(id: string): GuideTarget | null {
  if (!id.startsWith(POINT_PREFIX)) return null;
  const handle = id.slice(POINT_PREFIX.length);
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/i.test(handle)) return null;
  return { id, about: "", steps: [{ point: [`[data-steve="${handle}"]`], say: "Here's the one to press.", done: { clicked: true } }] };
}

/**
 * Whether a route's last step can be reached from this screen: what it points
 * at is here, or sits behind a tab that is not the open one. In the browser
 * only. The report form asks before offering Edit, so somebody whose role
 * has no Edit on this record is never sent looking for one.
 */
export function guideReachable(id: string, doc: Document): boolean {
  const steps = guideTarget(id)?.steps ?? [];
  const last = steps[steps.length - 1];
  if (!last) return false;
  if (last.point.some((sel) => doc.querySelector(sel))) return true;
  const before = steps[steps.length - 2];
  return Boolean(
    before?.point.some((sel) => {
      const el = doc.querySelector(sel);
      return el?.getAttribute("role") === "tab" && el.getAttribute("aria-selected") !== "true";
    })
  );
}




/** Where a guide in progress is remembered, so it survives the page changing. */
export const GUIDE_KEY = "steve-guide";
/** The event that starts one: detail is a target id, or { id, stayOn } for a
 *  guide that belongs to one page and ends when they leave it. */
export const GUIDE_EVENT = "steve-guide";
