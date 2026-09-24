import OwnWorkspace from "@/components/OwnWorkspace";
import type { RailGroup } from "@/components/WorkspaceRail";

/**
 * The clean sweep's workspace (24 Sep 2026): one screen, the checker's, going
 * home by home before REX PM is switched off. Michael and Kirstie reach it
 * from their own rails; the checker is given the compliance role.
 */
const RAIL: RailGroup[] = [
  { title: null, items: [{ href: "/clean-sweep", label: "Clean sweep", exact: true, icon: "checklist" }] },
  { title: "Elsewhere", items: [{ href: "/compliance-desk", label: "Compliance desk", icon: "shield" }] },
];

export default function CleanSweepLayout({ children }: { children: React.ReactNode }) {
  return (
    <OwnWorkspace needs="see:clean-sweep" rail={RAIL} label="Clean sweep">
      {children}
    </OwnWorkspace>
  );
}
