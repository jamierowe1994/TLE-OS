import { Suspense } from "react";
import IntroGate from "@/components/IntroGate";
import Shell from "@/components/Shell";
import ThemeGate from "@/components/ThemeGate";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeGate>
      <IntroGate>
        {/* Shell reads the query string (?side=tenant) to light the right nav
            child, and Leads reads it to filter. useSearchParams opts a subtree
            out of static prerendering, so Next requires a boundary above it —
            without this the build fails even though dev is perfectly happy.
            Wrapping Shell covers the pages too, since children render inside. */}
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </IntroGate>
    </ThemeGate>
  );
}
