import { Suspense } from "react";
import IntroGate from "@/components/IntroGate";
import Shell from "@/components/Shell";
import ThemeGate from "@/components/ThemeGate";
import ViewAsBar from "@/components/ViewAsBar";
import HelpDock from "@/components/HelpDock";
import SetupGate from "@/components/SetupGate";
import Tour from "@/components/Tour";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeGate>
      <IntroGate>
        {/* Shell reads the query string (?side=tenant) to light the right nav
            child, and Leads reads it to filter. useSearchParams opts a subtree
            out of static prerendering, so Next requires a boundary above it —
            without this the build fails even though dev is perfectly happy.
            Wrapping Shell covers the pages too, since children render inside. */}
        {/* Above Shell, so it sits across the whole window rather than inside
            the content column — an owner must not be able to scroll away from
            the fact that they are wearing somebody else's face. */}
        <ViewAsBar />
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
        {/* Follows the agent everywhere, because the report has to be one click
            from the page that caused it. Also carries the page tracker. */}
        <Suspense fallback={null}>
          <HelpDock />
        </Suspense>
        {/* Sends anybody whose account is not finished back to /setup. Renders
            nothing; it is here rather than in Shell so it still runs on the
            admin screens, which hide the rail. */}
        <SetupGate />
        {/* Last, so its overlay sits above the rail, the content and Steve.
            Reads ?tour=choose, so it needs the same Suspense boundary the
            rest of the searchParams readers have. */}
        <Suspense fallback={null}>
          <Tour />
        </Suspense>
      </IntroGate>
    </ThemeGate>
  );
}
