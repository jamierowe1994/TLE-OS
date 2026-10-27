import OwnWorkspace from "@/components/OwnWorkspace";
import type { RailGroup } from "@/components/WorkspaceRail";

/**
 * Michael's workspace: compliance, at its own address.
 *
 * James, 20 Sep 2026: "We need to sort out Michael's view." Susan, Francesca
 * and Kirstie each had a workspace of their own; Michael had two loose screens
 * on the agent sidebar and nothing for half of his job. The rail is his job in
 * the order he said it:
 *
 *   Dashboard     what needs him today
 *   Properties    "the properties are all compliant, so anything that's
 *                 overdue is massively important"
 *   To verify     "all of the new files ... get verified and taken off the list"
 *   Agents        "all of the agents are compliant"
 *   Works orders  "the last thing that he does is check on works orders"
 *
 * Verified and Sent (Jo, 21-22 Oct 2026) are tabs on To verify, not rail
 * entries: what has been checked and is waiting to go to the tenants, inside
 * the 28 days, and what has gone.
 *
 * Sections (7 Oct 2026) sits under To verify: the agents' Section 13 and
 * Section 8 checklists, waiting for his approval before he serves them.
 *
 * Names that say what each one is (James, 27 Oct 2026: "we should label these
 * better ... it needs to be more obvious what they are"): To verify is "Gas &
 * Electric Check" - its first tab is gas and EICR, Other Documents its second -
 * and Sections is "Section 8 & 13". Title Case throughout.
 *
 * Same frame as Kirstie's (app/(os)/pre-tenancy/layout): the agent sidebar
 * gives way to this rail and it stays put while the pages beside it change.
 * Properties and Agents are the screens that already existed, drawn here so
 * they sit inside the rail; their old addresses still open them.
 */
const RAIL: RailGroup[] = [
  {
    title: null,
    items: [
      { href: "/compliance-desk", label: "Dashboard", exact: true, icon: "home" },
      { href: "/compliance-desk/properties", label: "Property Compliance", icon: "shield" },
      { href: "/compliance-desk/verify", label: "Gas & Electric Check", icon: "checklist", also: ["/compliance-desk/verified"] },
      { href: "/compliance-desk/sections", label: "Section 8 & 13", icon: "file-contract" },
      { href: "/compliance-desk/plc", label: "PLC Queue", icon: "list" },
      { href: "/compliance-desk/id-checks", label: "ID Checks", icon: "user" },
      { href: "/compliance-desk/agents", label: "Agent Compliance", icon: "user" },
      { href: "/compliance-desk/works", label: "Works Orders", icon: "setting" },
    ],
  },
  /* The REX PM clean sweep (24 Sep 2026) - the checker's screen, which
     Michael oversees for the compliance half. */
  { title: "Migration", items: [{ href: "/clean-sweep", label: "Clean sweep", icon: "checklist" }] },
  { title: "Elsewhere", items: [{ href: "/pre-tenancy/dashboard", label: "Pre-tenancy", icon: "checklist" }] },
];

export default function ComplianceDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnWorkspace needs="see:agent-compliance" rail={RAIL} label="Compliance">
      {children}
    </OwnWorkspace>
  );
}
