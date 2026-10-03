/**
 * The agent's own navigation bar (3 Oct 2026). James: "customise the
 * navigation bar, so they can swap out icons that they often use".
 *
 * The bar is three of these, either side of the coral "+", with More always
 * last - More is where everything else lives, so it can never be taken off.
 * Whatever is not on the bar is listed in More, so nothing becomes unreachable.
 *
 * Per phone, like light and dark (lib/m-theme): a cookie, so the server draws
 * the agent's own icons first time instead of flashing the default set.
 */

export type NavId = "home" | "people" | "properties" | "chats" | "tools" | "guides" | "leads" | "applications" | "viewings" | "day" | "steve" | "scan";

export interface NavDest {
  id: NavId;
  href: string;
  label: string;
  /** Line drawing in a 24 box, stroked like the rest of the bar. */
  d: string;
  /** Pages that belong to it, so its icon lights on them. */
  owns: string[];
}

export const NAV_DESTS: NavDest[] = [
  { id: "home", href: "/agent", label: "Home", d: "M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5", owns: [] },
  {
    id: "people",
    href: "/agent/people",
    label: "People",
    d: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2",
    owns: ["/agent/people"],
  },
  { id: "properties", href: "/agent/properties", label: "Properties", d: "M3 20h18M5 20V9l5-4 5 4v11M15 20v-7h4v7M8.5 12h3M8.5 15.5h3", owns: ["/agent/properties"] },
  /* Chats and Tools (James, 3 Oct 2026); Search came off - every page has its own. */
  { id: "chats", href: "/agent/chats", label: "Chats", d: "M3.5 5h11v8h-6L5.5 16v-3h-2zM17.5 9h3v8h-2v3l-3.5-3H10v-1.5", owns: ["/agent/chats"] },
  { id: "guides", href: "/agent/guides", label: "Guides", d: "M4.5 5.5c2.6-.9 5-.6 7.5 1v13c-2.5-1.6-4.9-1.9-7.5-1zM19.5 5.5c-2.6-.9-5-.6-7.5 1v13c2.5-1.6 4.9-1.9 7.5-1z", owns: ["/agent/guides"] },
  { id: "tools", href: "/agent/tools", label: "Tools", d: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM16.5 13.5v6M13.5 16.5h6", owns: ["/agent/tools"] },
  { id: "leads", href: "/agent/leads", label: "Leads", d: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01", owns: ["/agent/leads"] },
  { id: "applications", href: "/agent/applications", label: "Applications", d: "M6.5 3.5h7.5l4 4v13h-11.5zM14 3.5V7.5h4M9.5 12h6M9.5 15.5h6", owns: ["/agent/applications"] },
  { id: "viewings", href: "/agent/viewings", label: "Viewings", d: "M15 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12.2 11.8 4 20M6.5 17.5l2 2M9 15l1.5 1.5", owns: ["/agent/viewings"] },
  { id: "day", href: "/agent/day", label: "Diary", d: "M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4", owns: ["/agent/day", "/agent/event"] },
  { id: "steve", href: "/agent/steve", label: "Steve", d: "M4.5 5h15v10.5h-8L7 19v-3.5H4.5z", owns: ["/agent/steve"] },
  { id: "scan", href: "/agent/id-check", label: "Scan an ID", d: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", owns: ["/agent/id-check"] },
];

/** The order More lists what is not on the bar. */
export const MORE_ORDER: NavId[] = ["chats", "tools", "guides", "steve", "leads", "applications", "viewings", "day", "scan", "home", "people", "properties"];

export const NAV_DEFAULT: NavId[] = ["home", "people", "properties"];
export const NAV_SLOTS = 3;
export const M_NAV_COOKIE = "m-nav";

const byId = new Map(NAV_DESTS.map((d) => [d.id, d]));
export const navDest = (id: NavId) => byId.get(id)!;

/** A cookie value back into three known, different destinations - or the default. */
export function parseNav(raw: string | undefined | null): NavId[] {
  const ids = (raw ?? "").split(".").filter((x): x is NavId => byId.has(x as NavId));
  const unique = [...new Set(ids)];
  return unique.length === NAV_SLOTS ? unique : NAV_DEFAULT;
}

/** Browser only: remember the bar for a year. */
export function saveNav(ids: NavId[]): void {
  document.cookie = `${M_NAV_COOKIE}=${ids.join(".")}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Which icon on the bar the page belongs to. A page with its own icon lights
 * that; everything else of the app's own (Home's family) lights Home when
 * Home is on the bar.
 */
export function activeNav(bar: NavId[], path: string): NavId | null {
  for (const id of bar) {
    if (navDest(id).owns.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) return id;
  }
  if (!bar.includes("home")) return null;
  const homeFamily = ["/agent/day", "/agent/event", "/agent/search", "/agent/leads", "/agent/applications", "/agent/viewings"];
  return path === "/agent" || homeFamily.some((p) => path.startsWith(p)) ? "home" : null;
}
