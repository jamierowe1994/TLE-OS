import OwnWorkspace from "@/components/OwnWorkspace";
import type { RailGroup } from "@/components/WorkspaceRail";

/**
 * Kirstie's workspace: the run-up to a move-in, at its own address.
 *
 * James, 12 Sep 2026: "when she clicks pre-tenancy, it'll launch her into an
 * admin section, and then we can have the bar on the left-hand side with
 * Dashboard, Board and PLC ... and Knowledge as well."
 *
 * So the agent sidebar gives way to her own rail, in the same frame as the
 * owner's admin rail, and it stays put while the pages beside it change.
 * Dashboard first (James, 5 Sep): the board is where a deal is worked, the
 * dashboard is where she sees what needs working. What moved is the feed
 * the dashboard opens; it is under the rail but not on it. Knowledge is the
 * guides to these screens (James, 13 Sep 2026), not the shared hub that
 * feeds Steve - that stays at /knowledge on her main sidebar.
 */
const RAIL: RailGroup[] = [
  {
    title: null,
    items: [
      { href: "/pre-tenancy/dashboard", label: "Dashboard", icon: "home" },
      { href: "/pre-tenancy", label: "Board", exact: true, icon: "grid" },
      { href: "/pre-tenancy/plc", label: "PLC queue", icon: "list" },
    ],
  },
  {
    title: null,
    rule: true,
    items: [{ href: "/pre-tenancy/knowledge", label: "Knowledge", icon: "note" }],
  },
  /* Kirstie oversees the checker's clean sweep day to day (24 Sep 2026). */
  { title: "Migration", items: [{ href: "/clean-sweep", label: "Clean sweep", icon: "checklist" }] },
];

export default function PreTenancyLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnWorkspace needs="see:pretenancy" rail={RAIL} label="Pre-tenancy">
      {children}
    </OwnWorkspace>
  );
}
