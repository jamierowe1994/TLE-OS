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
  { point: ['[data-nav="/admin"]'], say: "Click Admin, near the foot of the menu.", done: { path: "/admin" } },
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
  { id: "viewings", about: "Viewings - the viewings diary", steps: [nav("/viewings", "Viewings")] },
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
  { id: "listing.new", about: "Add a new listing", steps: [nav("/listings", "Listings"), press("listings.new", "Add new listing, top right.")] },
  { id: "listing.open", about: "Open a listing's file", steps: [nav("/listings", "Listings"), openRow("listing.drawer", "Click the home you want - its file opens.")] },
  ...(["marketing", "compliance", "documents", "viewings", "applications"] as const).map((tab) => ({
    id: `listing.${tab}`,
    about: `A listing's ${tab} tab${tab === "marketing" ? " - the write-up and photos for the portals" : tab === "compliance" ? " - its certificates" : ""}`,
    steps: [
      nav("/listings", "Listings"),
      openRow("listing.drawer", "Click the home you want - its file opens."),
      press(`listing.tab.${tab}`, `The ${tab.charAt(0).toUpperCase() + tab.slice(1)} tab.`),
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
      nav("/viewings", "Viewings"),
      openRow("appointment.drawer", "Click the viewing in the diary."),
      press("appointment.open-viewing", "Open the viewing file."),
    ],
  },
  {
    id: "viewing.feedback",
    about: "Record feedback on a viewing, or mark a no-show",
    steps: [
      nav("/viewings", "Viewings"),
      openRow("appointment.drawer", "Click the viewing that has happened."),
      { point: ['[data-steve="appointment.open-viewing"]'], say: "Open the viewing file.", done: { present: '[data-steve="viewing.drawer"]' } },
      press("viewing.complete", "Complete the viewing - whether they came, and what they thought."),
    ],
  },
  {
    id: "viewing.note",
    about: "Add a note to a viewing",
    steps: [
      nav("/viewings", "Viewings"),
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
];

export const guideTarget = (id: string) => GUIDE_TARGETS.find((t) => t.id === id) ?? null;




/** Where a guide in progress is remembered, so it survives the page changing. */
export const GUIDE_KEY = "steve-guide";
/** The event that starts one: detail is a target id. */
export const GUIDE_EVENT = "steve-guide";
