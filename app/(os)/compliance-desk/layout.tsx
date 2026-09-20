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
      { href: "/compliance-desk/properties", label: "Properties", icon: "shield" },
      { href: "/compliance-desk/verify", label: "To verify", icon: "checklist" },
      { href: "/compliance-desk/agents", label: "Agents", icon: "user" },
      { href: "/compliance-desk/works", label: "Works orders", icon: "setting" },
    ],
  },
];

export default function ComplianceDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnWorkspace needs="see:agent-compliance" rail={RAIL} label="Compliance">
      {children}
    </OwnWorkspace>
  );
}
