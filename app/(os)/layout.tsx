import { Suspense } from "react";
import IntroGate from "@/components/IntroGate";
import Shell from "@/components/Shell";
import ThemeGate from "@/components/ThemeGate";
import ViewAsBar from "@/components/ViewAsBar";
import ReportBug from "@/components/ReportBug";

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
          <ReportBug />
        </Suspense>
      </IntroGate>
    </ThemeGate>
  );
}
