import type { Metadata } from "next";

/**
 * The viewing brochure's own shell (Erleta Vathej, ticket 47b2389c; James,
 * 10 Nov 2026): paper, and nothing else. Outside the OS chrome so the print
 * is the sheet alone, with no sidebar or bar to switch off.
 */
export const metadata: Metadata = {
  title: "Brochure - TLE OS",
  description: "A listing on paper, to hand out at viewings.",
  robots: { index: false, follow: false, nocache: true },
};

export default function BrochureLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
