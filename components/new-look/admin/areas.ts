import { can, type Capability } from "@/lib/roles";

/**
 * Admin in the new look (lib/new-look "admin", 23 Oct 2026): the same screens
 * as the old rail, grouped into the design's four areas, each with an owner.
 *
 * Every entry the old rail had is here, with the same address and the same
 * capability, so nobody is offered a door that refuses them and nothing that
 * was reachable stops being reachable. Only the grouping and the one-line
 * description are new.
 */

export type AdminTool = {
  href: string;
  label: string;
  says: string;
  needs: Capability;
  exact?: boolean;
  /** Other routes that light this entry - a page shown as its tab. */
  also?: string[];
};

export type AdminArea = {
  id: "overall" | "compliance" | "marketing" | "systems";
  name: string;
  /** Who it belongs to, as the area's head says it. */
  owner: string;
  /** The short form for the rail's group label. */
  ownerShort: string;
  blurb: string;
  tools: AdminTool[];
};

export const ADMIN_AREAS: AdminArea[] = [
  {
    id: "overall",
    name: "Overall",
    owner: "Susan",
    ownerShort: "Susan",
    blurb: "How the business is doing, who's on the team and what's next.",
    tools: [
      { href: "/company-figures", label: "Susan's view", says: "The business figures, live", needs: "see:business" },
      { href: "/admin/people", label: "People", says: "Accounts, roles, invites and password resets", needs: "see:people", also: ["/admin/permissions"] },
      { href: "/admin/team", label: "Team", says: "Everybody, as Kirstie sees them", needs: "manage:people" },
      { href: "/admin/tracking", label: "Tracking", says: "Who uses which part of the OS, and how much", needs: "see:tracking" },
      { href: "/admin/process", label: "Process", says: "How a let runs, and what each person sees", needs: "see:reports" },
      { href: "/admin/todo", label: "To do", says: "Everything waiting on the office", needs: "see:reports" },
    ],
  },
  {
    id: "compliance",
    name: "Compliance",
    owner: "Kirstie and Michael",
    ownerShort: "Kirstie",
    blurb: "Pre-tenancy checks, certificates and the rules we follow.",
    tools: [
      { href: "/pre-tenancy/dashboard", label: "Kirstie's view", says: "Every let on its way to a move-in", needs: "see:pretenancy" },
      { href: "/compliance-desk", label: "Michael's view", says: "Certificates, new documents, agents and works orders", needs: "see:agent-compliance" },
      { href: "/admin/plc-checks", label: "PLC checks", says: "How the pre-let decisions are holding up", needs: "see:reports" },
      { href: "/knowledge", label: "Knowledge", says: "Our rules and the law behind them, for Steve", needs: "edit:knowledge" },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    owner: "Francesca",
    ownerShort: "Francesca",
    blurb: "The brand, the newsroom and what agents can share.",
    tools: [
      { href: "/marketing-hub", label: "Francesca's view", says: "Marketing, the portals and the posts", needs: "see:marketing" },
      { href: "/newsroom", label: "Newsroom", says: "Posts to everybody in the OS", needs: "edit:knowledge" },
      { href: "/guides", label: "Guides", says: "Help pages for Steve's Guides tab", needs: "see:reports" },
    ],
  },
  {
    id: "systems",
    name: "Systems",
    owner: "James",
    ownerShort: "James",
    blurb: "The wiring under everything.",
    tools: [
      { href: "/admin/connections", label: "Wiring", says: "What the OS is connected to, and whether it's healthy", needs: "see:wiring" },
      { href: "/admin/testing", label: "Testing", says: "Which processes have been walked by a person", needs: "see:wiring" },
      { href: "/admin/switches", label: "Switches", says: "Turn features and the new look on and off", needs: "manage:switches" },
      { href: "/admin/tickets", label: "Tickets", says: "What the team reports, sorted A, B and C", needs: "see:prelaunch" },
      { href: "/admin/book-health", label: "Book health", says: "What has drifted across the book, weekly", needs: "see:reports" },
      { href: "/admin/alerts", label: "Phone alerts", says: "What buzzes the office's phones", needs: "manage:switches" },
      { href: "/admin/activity", label: "Activity", says: "Who did what, and when", needs: "manage:people" },
      { href: "/admin/emails", label: "Emails", says: "Every email the OS could send", needs: "see:reports" },
      { href: "/admin/assistant", label: "Steve", says: "What he knows and how he's set up", needs: "see:reports" },
      { href: "/admin/ai-costs", label: "AI costs", says: "What each AI feature costs this month", needs: "see:reports" },
      { href: "/admin/rex-status", label: "REX status", says: "Up, down or automatic, and the changes waiting", needs: "manage:switches" },
      { href: "/admin/propoly", label: "Propoly", says: "Move-in packs from email, and certificates sent to a deal", needs: "see:pretenancy" },
    ],
  },
];

/** The areas as this person can use them: only the tools they hold, only areas with any left. */
export function areasFor(role: string | null | undefined): AdminArea[] {
  return ADMIN_AREAS.map((a) => ({ ...a, tools: a.tools.filter((t) => can(role, t.needs)) })).filter((a) => a.tools.length > 0);
}

export function isAreaId(v: unknown): v is AdminArea["id"] {
  return ADMIN_AREAS.some((a) => a.id === v);
}

const lit = (path: string, t: AdminTool) =>
  (t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`)) || Boolean(t.also?.some((a) => path === a || path.startsWith(`${a}/`)));

/** Which area and tool a route belongs to, for the way back on a sub-page. */
export function whereIs(path: string): { area: AdminArea; tool: AdminTool } | null {
  for (const area of ADMIN_AREAS) {
    const tool = area.tools.find((t) => lit(path, t));
    if (tool) return { area, tool };
  }
  return null;
}
