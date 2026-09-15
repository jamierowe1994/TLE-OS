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

export type AreaLevel = "hidden" | "look" | "testers" | "everyone";

export const AREA_LEVELS: { id: AreaLevel; label: string; says: string }[] = [
  { id: "hidden", label: "Hidden", says: "Not on their rail. The page sends them to the dashboard." },
  { id: "look", label: "Look only", says: "Opens and reads. Nothing on it writes or sends." },
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
}

export const AREA_DEFS: AreaDef[] = [
  { id: "dashboard", label: "Dashboard", phase: 1, pages: ["/dashboard"], apis: [], canHide: false },
  { id: "leads", label: "Leads", phase: 1, pages: ["/leads"], apis: ["/api/leads", "/api/contacts", "/api/lettings-capture"], canHide: true },
  {
    id: "appraisals", label: "Market appraisals", phase: 1, pages: ["/market-appraisals"],
    apis: ["/api/appraisals", "/api/appraisal-email", "/api/presentations", "/api/esign", "/api/docuseal", "/api/video", "/api/record"],
    canHide: true,
  },
  { id: "listings", label: "Listings", phase: 1, pages: ["/listings"], apis: ["/api/listings"], canHide: true },
  { id: "viewings", label: "Viewings", phase: 1, pages: ["/viewings"], apis: ["/api/viewings", "/api/appointments"], canHide: true },
  {
    id: "applications", label: "Applications", phase: 1, pages: ["/applications", "/plc"],
    apis: ["/api/applications", "/api/plc", "/api/pretenancy", "/api/handoff", "/api/deals", "/api/tenancy-link"],
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
];

const owns = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** The area a page belongs to, or null. */
export function areaForPage(pathname: string): AreaDef | null {
  return AREA_DEFS.find((a) => a.pages.some((p) => owns(pathname, p))) ?? null;
}

/** The area a WRITE to this API belongs to, or null when it is not gated. */
export function areaForWrite(pathname: string, method: string): AreaDef | null {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return null;
  if (READ_ONLY_POSTS.some((p) => owns(pathname, p))) return null;
  return AREA_DEFS.find((a) => a.apis.some((p) => owns(pathname, p))) ?? null;
}

/** What a person's access looks like, as the server works it out. */
export interface AreaAccess {
  /** False for anybody the switches do not apply to. */
  gated: boolean;
  tester: boolean;
  levels: Record<string, AreaLevel>;
}

export const levelOf = (access: AreaAccess | null, areaId: string): AreaLevel =>
  !access || !access.gated ? "everyone" : access.levels[areaId] ?? "everyone";

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

/** Said on the screen and in a refused write, the same words in both places. */
export function lockedSentence(area: AreaDef, level: AreaLevel): string {
  return level === "hidden"
    ? `${area.label} is not switched on for you yet.`
    : `${area.label} is look only for now: you can open everything, and nothing you do here saves yet. It is switched on as testing finishes.`;
}
