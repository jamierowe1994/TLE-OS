/**
 * THE AREAS OF THE OS, AND HOW FAR EACH ONE IS SWITCHED ON.
 *
 * James and Howard, 15 Sep 2026: scale the pilot down and turn it on one area
 * at a time. Until this existed there was no way to - every agent saw every
 * screen, and the thirteen switches only held back emails and REX writes.
 *
 * ── The four positions ────────────────────────────────────────────────────
 *
 *   hidden    not on the agent's rail, and the page sends them to the dashboard
 *   look      the screen opens and reads, and nothing on it writes or sends
 *   testers   testers (Howard) can act; every other agent looks
 *   everyone  live
 *
 * An area nobody has set is `everyone`, so shipping this changes nothing until
 * somebody moves a switch.
 *
 * ── Who it applies to ─────────────────────────────────────────────────────
 *
 * The `agent` role, and only that. Kirstie (pre-tenancy), Michael (compliance)
 * and marketing each work from their own screens, and hiding Portfolio from
 * the pilot agents must not take Michael's compliance book away from him.
 * Owners and admins always see and do everything.
 *
 * ── Why this file has no imports ──────────────────────────────────────────
 *
 * The middleware reads it at the edge, the rail reads it in the browser, and
 * the admin API reads it on the server. One map, so the three can never
 * disagree about which route belongs to which screen.
 */

/**
 * "practice" (21 Sep 2026, for the three-phase pilot - lib/phases).
 *
 * James: "it's almost like a sandbox, but with real data as well as a couple
 * of test files... without the fear of it messing anything up." Look only
 * could not do that: it refuses every write, so a test file is as frozen as a
 * real one and there is nothing to play with.
 *
 * On practice, a real record is look only and a person's OWN test file works
 * in full. The area map cannot tell the two apart - it has no imports and no
 * database - so it only says "this level needs the target checked", and the
 * middleware asks /api/area-access/target whether the write names one of the
 * caller's own test files (lib/practice-target).
 */
export type AreaLevel = "hidden" | "look" | "practice" | "testers" | "everyone";

export const AREA_LEVELS: { id: AreaLevel; label: string; says: string }[] = [
  { id: "hidden", label: "Hidden", says: "Not on their rail. The page sends them to the dashboard." },
  { id: "look", label: "Look only", says: "Opens and reads. Nothing on it writes or sends." },
  { id: "practice", label: "Practice", says: "Real records are look only. Their own test files work in full." },
  { id: "testers", label: "Testers", says: "Testers can act. Every other agent looks." },
  { id: "everyone", label: "Everyone", says: "Live." },
];

export interface AreaDef {
  id: string;
  label: string;
  phase: 1 | 2;
  /** Page paths this area owns, matched by whole segment. */
  pages: string[];
  /** API paths this area owns. Only their writes are gated. */
  apis: string[];
  /** The dashboard is where a hidden area sends people, so it cannot hide. */
  canHide: boolean;
  /**
   * Set on a single BUTTON with its own switch, inside an area (15 Sep 2026).
   * It can never be further on than the area it sits in: Listings on look
   * only means nobody pushes to the portals, whatever this one says.
   */
  parent?: string;
}

export const AREA_DEFS: AreaDef[] = [
  /* The dashboard's own APIs are the ones that belong to no single screen
     (21 Sep 2026). Until then `apis` was empty and these writes answered to
     no switch at all: Steve's actions include a REX listing update and a send
     from the agent's Outlook, case-state and tasks hang off every record, and
     a certificate can be filed from a listing, an appraisal or an application.
     With no row for the dashboard its level is "everyone", so nothing changes
     for anybody until the dashboard is deliberately put on look or practice -
     which is exactly when these must stop. */
  {
    id: "dashboard", label: "Dashboard", phase: 1, pages: ["/dashboard"],
    apis: [
      "/api/assistant/act", "/api/case-state", "/api/tasks", "/api/my/deal-tasks",
      "/api/compliance", "/api/property-file", "/api/diary",
    ],
    canHide: false,
  },
  {
    id: "leads", label: "Leads", phase: 1, pages: ["/leads"],
    /* + the composer (messages): it is opened from a lead and writes to one. */
    apis: ["/api/leads", "/api/contacts", "/api/lettings-capture", "/api/messages"],
    canHide: true,
  },
  {
    id: "appraisals", label: "Market appraisals", phase: 1, pages: ["/market-appraisals"],
    /* + the three that an appraisal drives but that sat under no area, so no
       switch ever reached them: creating the property in REX, and the
       appraisal's photos, research and the landlord's property answers. */
    apis: [
      "/api/appraisals", "/api/appraisal-email", "/api/presentations", "/api/esign", "/api/docuseal", "/api/video", "/api/record",
      "/api/rex/property", "/api/ma-photos", "/api/ma-research", "/api/property-answers",
    ],
    canHide: true,
  },
  { id: "listings", label: "Listings", phase: 1, pages: ["/listings"], apis: ["/api/listings"], canHide: true },
  /* James, 15 Sep 2026: going live on Rightmove, OnTheMarket and Zoopla is
     the one button in Listings that reaches the public, so it gets its own
     switch - off, look, testers, everyone - separate from the screen. */
  {
    id: "listing-publish", label: "Push to the portals", phase: 1, parent: "listings",
    pages: [], apis: ["/api/listings/publish"], canHide: true,
  },
  /* 15 Sep 2026: saving the Marketing tab and the portal preview into REX -
     rent, deposit, dates, rooms, key features, photo order, and photos and
     floor plans uploaded from the OS. Its own switch so the first saves can
     run with testers before every agent can change a live advert. */
  {
    id: "listing-edit", label: "Edit the advert", phase: 1, parent: "listings",
    pages: [], apis: ["/api/listings/details", "/api/listings/media", "/api/listings/autofill", "/api/listings/create"], canHide: true,
  },
  /* + /api/confirmations: it SENDS the booking, viewing and take-on
     confirmations, and it was under no area - the one door out of a look-only
     Viewings screen that reached a tenant's inbox. */
  { id: "viewings", label: "Viewings", phase: 1, pages: ["/viewings"], apis: ["/api/viewings", "/api/appointments", "/api/confirmations"], canHide: true },
  {
    id: "applications", label: "Applications", phase: 1, pages: ["/applications", "/plc"],
    apis: ["/api/applications", "/api/plc", "/api/pretenancy", "/api/handoff", "/api/handover", "/api/deals", "/api/tenancy-link"],
    canHide: true,
  },
  {
    id: "portfolio", label: "Portfolio", phase: 2, pages: ["/portfolio", "/compliance", "/maintenance", "/inspections"],
    /* Not /api/compliance or /api/property-file: a certificate is filed from a
       listing, an appraisal and an application too, and hiding Portfolio must
       not stop an agent attaching a gas certificate to the listing in front
       of them. */
    apis: ["/api/works-orders", "/api/maintenance", "/api/inspections", "/api/contractors"],
    canHide: true,
  },
  { id: "emails", label: "Emails", phase: 2, pages: ["/emails"], apis: ["/api/campaigns", "/api/email-templates", "/api/scheduled-sends"], canHide: true },
  { id: "finances", label: "Finances", phase: 2, pages: ["/finances"], apis: ["/api/finances", "/api/invoices"], canHide: true },
  { id: "tools", label: "Tools", phase: 2, pages: ["/tools"], apis: ["/api/tools", "/api/postcards", "/api/bond"], canHide: true },
];

/**
 * POSTs that only read. Look only has to let these through, or an agent
 * looking at a screen could not even see whether somebody is already in REX.
 */
export const READ_ONLY_POSTS = [
  "/api/contacts/match",
  "/api/plc/bench",
  "/api/record",
  "/api/esign/poll",
  "/api/listings/describe",
  /* Reads the dates off a certificate and saves nothing - filing it is a
     separate write to /api/compliance/certificates, which stays gated. As a
     "write" it was refused whenever the switch check was slow (Kirstie on
     Listings, 22 Sep), for no protection at all. */
  "/api/compliance/certificates/read",
];

const owns = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** The area a page belongs to, or null. */
export function areaForPage(pathname: string): AreaDef | null {
  return AREA_DEFS.find((a) => a.pages.some((p) => owns(pathname, p))) ?? null;
}

/**
 * The area a WRITE to this API belongs to, or null when it is not gated.
 *
 * The longest match wins, so /api/listings/publish answers to its own switch
 * and not to Listings, which owns everything under /api/listings.
 */
export function areaForWrite(pathname: string, method: string): AreaDef | null {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return null;
  if (READ_ONLY_POSTS.some((p) => owns(pathname, p))) return null;
  let best: AreaDef | null = null;
  let bestLen = -1;
  for (const a of AREA_DEFS) {
    for (const p of a.apis) {
      if (owns(pathname, p) && p.length > bestLen) {
        best = a;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/** What a person's access looks like, as the server works it out. */
export interface AreaAccess {
  /** False for anybody the switches do not apply to. */
  gated: boolean;
  tester: boolean;
  levels: Record<string, AreaLevel>;
}

const RANK: Record<AreaLevel, number> = { hidden: 0, look: 1, practice: 2, testers: 3, everyone: 4 };

/** A button inside an area is never further on than the area itself. */
export function levelOf(access: AreaAccess | null, areaId: string): AreaLevel {
  if (!access || !access.gated) return "everyone";
  const own = access.levels[areaId] ?? "everyone";
  const parentId = AREA_DEFS.find((a) => a.id === areaId)?.parent;
  if (!parentId) return own;
  const parent = levelOf(access, parentId);
  return RANK[parent] < RANK[own] ? parent : own;
}

/** Can this person see the screen at all? */
export function canSee(access: AreaAccess | null, area: AreaDef): boolean {
  return !(area.canHide && levelOf(access, area.id) === "hidden");
}

/** Can this person write or send from the screen? */
export function canAct(access: AreaAccess | null, area: AreaDef): boolean {
  const level = levelOf(access, area.id);
  if (level === "everyone") return true;
  if (level === "testers") return Boolean(access?.tester);
  return false;
}

/**
 * Does a refused write deserve a second look? True on practice, where the
 * answer depends on WHAT is being written to - see the note on AreaLevel.
 */
export function needsTargetCheck(access: AreaAccess | null, area: AreaDef): boolean {
  return levelOf(access, area.id) === "practice";
}

/** Said on the screen and in a refused write, the same words in both places. */
export function lockedSentence(area: AreaDef, level: AreaLevel): string {
  if (area.parent) {
    return level === "testers"
      ? `"${area.label}" is with the testers for now.`
      : `"${area.label}" is not switched on for you yet.`;
  }
  if (level === "practice") {
    return `${area.label} is in practice mode: real records are look only for now, and your own test files work in full. Open one from Practice files to try this.`;
  }
  return level === "hidden"
    ? `${area.label} is not switched on for you yet.`
    : `${area.label} is look only for now: you can open everything, and nothing you do here saves yet. It is switched on as testing finishes.`;
}
