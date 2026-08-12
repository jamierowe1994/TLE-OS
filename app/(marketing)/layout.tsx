import { Suspense } from "react";
import MarketingShell from "@/components/MarketingShell";
import ThemeGate from "@/components/ThemeGate";

/**
 * Marketing sits OUTSIDE the agents' shell.
 *
 * Same app, same door, different workspace: the person writing the campaigns
 * has no use for the diary, the leads or the compliance book, and putting
 * their one screen at the bottom of the agents' nav made both jobs look like
 * the same job.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeGate>
      <Suspense fallback={null}>
        <MarketingShell>{children}</MarketingShell>
      </Suspense>
    </ThemeGate>
  );
}
