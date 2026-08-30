/**
 * The rail — the OS's list of screens, and the only one.
 *
 * Lifted out of components/Shell.tsx on 29 Aug so that something other than the
 * sidebar can read it. The assistant needs to know what screens exist in order
 * to send anyone to one, and the moment that list is typed out a second time it
 * starts to rot: a screen gets renamed in the rail, the assistant keeps sending
 * people to the old name, and nothing anywhere reports a problem.
 *
 * So there is one array. The rail renders it, `lib/screens.ts` describes it, and
 * the assistant's route allowlist is built from it. Add a screen here and every
 * one of those three follows; add it anywhere else and the build tells you.
 *
 * Deliberately client-safe — no `server-only`, no prose, nothing heavy. Shell is
 * a client component and this ships to the browser with it, so the descriptions
 * of what each screen DOES live in lib/screens.ts (server-only) rather than
 * here, where they would be dead weight in every page load.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string }[];
};

/** FRONT OF HOUSE — the tenancy being made. */
export const FRONT: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  // Tenant-side and landlord-side are different jobs — same inbox, different
  // questions — so Leads opens rather than just navigating.
  {
    href: "/leads",
    label: "Leads",
    icon: "target",
    children: [
      { href: "/leads?side=tenant", label: "Tenant" },
      { href: "/leads?side=landlord", label: "Landlord" },
    ],
  },
  /* Straight after Leads, because that is the order the landlord side runs
     in: a landlord lead becomes an appraisal BEFORE there is anything to list.
     It sat after Viewings, which is the tenant side's order and made the rail
     read as one queue when it is two. */
  { href: "/market-appraisals", label: "Market Appraisals", icon: "trend-up" },
  { href: "/listings", label: "Listings", icon: "home" },
  { href: "/viewings", label: "Viewings", icon: "calendar" },
  { href: "/applications", label: "Applications", icon: "checklist" },
];

/** BACK OFFICE — the book being run. */
export const BACK: NavItem[] = [
  { href: "/compliance", label: "Compliance", icon: "shield" },
  /* Back office rather than Marketing: this is the audit of what already goes
     out under our name, not a place to write anything new. */
  { href: "/emails", label: "Emails", icon: "mail" },
  { href: "/portfolio", label: "Portfolio", icon: "folder" },
  { href: "/finances", label: "Finances", icon: "wallet" },
  /* Tools used to sit second in FRONT, above Leads, and the argument for it
     was good: everything in FRONT assumes somebody already put their hand up,
     and Tools is where the doors nobody has knocked on yet are worked.

     James moved it here on 30 Aug while writing the new-starter tour, and the
     reason overrides that argument rather than disagreeing with it. FRONT is
     what an agent opens every morning in the order the day runs; prospecting
     is a thing you go and do deliberately, not a thing waiting for you. Second
     in the rail gave it the weight of a daily queue it does not have, and it
     is the one screen in the rail still marked `shell` in lib/screens.ts —
     a new agent met an empty room two clicks into their first tour.

     Last in the back office, not first: Compliance → Emails → Portfolio →
     Finances is the running of the book, and Tools is what you reach for once
     that book needs feeding. */
  { href: "/tools", label: "Tools", icon: "rocket" },
  /* Marketing is deliberately NOT here. It's a different workspace for a
     different person, reached from the door — a nav that lists everything
     everyone might do is how an OS starts to feel like a filing cabinet. */
];

/**
 * Owner only, and rendered only once /api/auth/me says so.
 *
 * A separate group rather than an entry in BACK OFFICE: the back-office rail
 * is an agent's working day, and an environment switch does not belong one
 * slip away from Compliance. Admin has its own sub-rail once you are inside.
 */
export const ADMIN: NavItem[] = [{ href: "/admin", label: "Admin", icon: "shield" }];

/**
 * Every screen an ordinary agent can reach from the rail.
 *
 * Admin is excluded on purpose. This is what the assistant is allowed to send
 * somebody to, and most of the people asking him questions are partner agents
 * who would hit a permission wall — an offer to take you somewhere you cannot
 * go is worse than no offer.
 */
export const AGENT_NAV: NavItem[] = [...FRONT, ...BACK];

/**
 * The same list as a union of literals, so `lib/screens.ts` can be forced to
 * describe every one of them.
 *
 * This is the anti-drift mechanism, and it is the honest version of it. What a
 * screen DOES cannot be derived from a constant the way stage names can — it
 * lives in JSX — so it has to be written down, and anything written down can go
 * stale. What the compiler CAN guarantee is that nothing is ever missed: add a
 * screen to the rail without describing it and the build fails on the spot,
 * rather than the assistant quietly not knowing the screen exists.
 *
 * Kept beside the arrays above so the two cannot separate. If they ever
 * disagree, `assertRoutesCovered` below says so out loud.
 */
export const AGENT_ROUTES = [
  "/dashboard",
  "/leads",
  "/market-appraisals",
  "/listings",
  "/viewings",
  "/applications",
  "/compliance",
  "/emails",
  "/portfolio",
  "/finances",
  "/tools",
] as const;

export type AgentRoute = (typeof AGENT_ROUTES)[number];

/**
 * The rail and the route union describe the same thing twice, which is exactly
 * the duplication this file exists to prevent — so it is checked rather than
 * trusted. Called once at module load in lib/screens.ts.
 */
export function navRoutesMismatch(): string[] {
  const nav = AGENT_NAV.map((n) => n.href).sort();
  const listed = [...AGENT_ROUTES].sort();
  return [
    ...nav.filter((h) => !listed.includes(h as AgentRoute)).map((h) => `${h} is in the rail but not in AGENT_ROUTES`),
    ...listed.filter((h) => !nav.includes(h)).map((h) => `${h} is in AGENT_ROUTES but not in the rail`),
  ];
}
