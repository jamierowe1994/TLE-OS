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

export type AdminTab = {
  href: string;
  label: string;
  needs: Capability;
  /** The data behind it answers owners only (requireOwner), so nobody else is offered it. */
  owner?: true;
  exact?: boolean;
  /** Other routes that light this tab - a sub-page or an older address. */
  also?: string[];
};

export type AdminTool = {
  href: string;
  label: string;
  says: string;
  needs: Capability;
  owner?: true;
  exact?: boolean;
  /** Other routes that light this entry - its tabs and their sub-pages. */
  also?: string[];
  /**
   * The screens bolted together under this one entry, as tabs (James, 24 Oct
   * 2026: "start bolting some of these screens together, adding some tabs to
   * separate them"). Each keeps its own address and its own capability; the
   * entry opens on the first one this person holds.
   */
  tabs?: AdminTab[];
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

const t = (href: string, label: string, needs: Capability, more: Partial<AdminTab> = {}): AdminTab => ({ href, label, needs, ...more });

export const ADMIN_AREAS: AdminArea[] = [
  {
    id: "overall",
    name: "Overall",
    owner: "Susan",
    ownerShort: "Susan",
    blurb: "How the business is doing, who's on the team and what's next.",
    tools: [
      { href: "/company-figures", label: "Susan's view", says: "The business figures, live", needs: "see:business" },
      {
        href: "/admin/people", label: "People", says: "Accounts, roles, invites and permissions", needs: "see:people",
        tabs: [
          t("/admin/people", "People", "see:people", { owner: true, exact: true, also: ["/admin/people/"] }),
          t("/admin/people/invites", "Invites", "see:prelaunch"),
          t("/admin/permissions", "Permissions", "see:roles"),
        ],
      },
      {
        href: "/admin/tracking", label: "Usage", says: "Who uses what, who did what, and what the AI costs", needs: "see:tracking",
        tabs: [
          t("/admin/tracking", "Tracking", "see:tracking", { owner: true }),
          t("/admin/activity", "Activity", "manage:people", { owner: true }),
          t("/admin/ai-costs", "AI costs", "see:reports"),
        ],
      },
      {
        href: "/admin/process", label: "Process", says: "How a let runs, what each person sees, and the demos", needs: "see:reports",
        tabs: [
          t("/admin/process", "Process", "see:reports"),
          t("/admin/onboarding", "Onboarding", "see:reports"),
          t("/admin/tenant-passport", "Tenant passport", "see:reports"),
          t("/admin/plc-demo", "PLC handover", "see:reports"),
        ],
      },
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
      {
        href: "/admin/plc-checks", label: "Pre-let", says: "How the PLC decisions are holding up, Propoly's packs and the standing documents", needs: "see:reports",
        tabs: [
          t("/admin/plc-checks", "PLC checks", "see:reports"),
          t("/admin/propoly", "Propoly", "see:pretenancy"),
          /* Kept once, on every let it applies to: the Easy Read Notes on every
             Scottish let (lib/standing-documents, 29 Oct 2026). */
          t("/admin/standing-documents", "Standing documents", "see:pretenancy"),
        ],
      },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    owner: "Francesca",
    ownerShort: "Francesca",
    blurb: "The brand, the newsroom, Steve and every email we send.",
    tools: [
      { href: "/marketing-hub", label: "Francesca's view", says: "Marketing, the portals and the posts", needs: "see:marketing" },
      {
        href: "/admin/knowledge", label: "Content", says: "Steve, what he knows, the guides and the newsroom", needs: "edit:knowledge",
        tabs: [
          t("/admin/knowledge", "Knowledge", "edit:knowledge"),
          t("/admin/newsroom", "Newsroom", "edit:knowledge"),
          t("/admin/guides", "Guides", "see:reports"),
          t("/admin/assistant", "Steve", "see:business"),
        ],
      },
      {
        href: "/admin/emails", label: "Emails", says: "Every email the OS could send, and what it has sent", needs: "see:marketing",
        tabs: [
          t("/admin/emails", "Every email", "see:marketing"),
          t("/admin/emails/sent", "Sent", "manage:people", { owner: true }),
        ],
      },
    ],
  },
  {
    id: "systems",
    name: "Systems",
    owner: "James",
    ownerShort: "James",
    blurb: "The wiring under everything.",
    tools: [
      {
        href: "/admin/connections", label: "System", says: "Wiring, testing, switches, REX status and phone alerts", needs: "see:wiring",
        tabs: [
          t("/admin/connections", "Wiring", "see:wiring"),
          t("/admin/testing", "Testing", "see:wiring"),
          t("/admin/switches", "Switches", "manage:switches"),
          t("/admin/rex-status", "REX status", "manage:switches"),
          t("/admin/alerts", "Phone alerts", "manage:switches"),
        ],
      },
      {
        href: "/admin/tickets", label: "Issues", says: "Tickets, the office's to do and what has drifted", needs: "see:prelaunch",
        tabs: [
          t("/admin/tickets", "Tickets", "see:prelaunch", { owner: true }),
          t("/admin/todo", "To do", "see:reports", { owner: true }),
          t("/admin/book-health", "Book health", "see:reports"),
        ],
      },
    ],
  },
];

/** May this person open this tab: the capability, and owner-only data for owners only. */
export const holds = (role: string | null | undefined, x: { needs: Capability; owner?: true }) => can(role, x.needs) && (!x.owner || role === "owner");

/** An entry's tabs this person holds; an entry without tabs is its own one tab. */
export function tabsFor(role: string | null | undefined, tool: AdminTool): AdminTab[] {
  const tabs = tool.tabs ?? [{ href: tool.href, label: tool.label, needs: tool.needs, owner: tool.owner, exact: tool.exact, also: tool.also }];
  return tabs.filter((x) => holds(role, x));
}

/**
 * The areas as this person can use them: an entry shows when they hold any of
 * its tabs, opens on the first, and lights for all of them.
 */
export function areasFor(role: string | null | undefined): AdminArea[] {
  return ADMIN_AREAS.map((a) => ({
    ...a,
    tools: a.tools.flatMap((tool) => {
      const tabs = tabsFor(role, tool);
      if (!tabs.length) return [];
      return [{ ...tool, href: tabs[0].href, also: tabs.flatMap((x) => [x.href, ...(x.also ?? [])]), tabs }];
    }),
  })).filter((a) => a.tools.length > 0);
}

export function isAreaId(v: unknown): v is AdminArea["id"] {
  return ADMIN_AREAS.some((a) => a.id === v);
}

const on = (path: string, x: { href: string; exact?: boolean; also?: string[] }) =>
  (x.exact ? path === x.href : path === x.href || path.startsWith(`${x.href}/`)) ||
  Boolean(x.also?.some((a) => (a.endsWith("/") ? path.startsWith(a) : path === a || path.startsWith(`${a}/`))));

/** The tab a route is, within its entry: the most specific match, so /admin/emails/sent is Sent, not Every email. */
export function tabAt(path: string, tabs: AdminTab[]): AdminTab | null {
  const hits = tabs.filter((x) => on(path, x));
  return hits.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

/** Which area, entry and tab a route belongs to, for the tabs on top and the way back on a sub-page. */
export function whereIs(path: string): { area: AdminArea; tool: AdminTool; tab: AdminTab | null } | null {
  for (const area of ADMIN_AREAS) {
    for (const tool of area.tools) {
      const tabs = tool.tabs ?? [{ href: tool.href, label: tool.label, needs: tool.needs, exact: tool.exact, also: tool.also }];
      const tab = tabAt(path, tabs);
      if (tab) return { area, tool, tab };
    }
  }
  return null;
}
