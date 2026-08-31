import OwnWorkspace from "@/components/OwnWorkspace";

/**
 * Kirstie's workspace — the run-up to a move-in, at its own address.
 *
 * Covers the board and /pre-tenancy/plc beneath it. Previously /admin/pre-
 * tenancy, reached through a rail headed Admin that existed only to bounce her
 * here: she held one screen and was shown a menu of ten doors and one key.
 */
export default function PreTenancyLayout({ children }: { children: React.ReactNode }) {
  return <OwnWorkspace needs="see:pretenancy">{children}</OwnWorkspace>;
}
