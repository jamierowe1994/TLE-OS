"use client";

import CrashScreen from "@/components/CrashScreen";

/**
 * The layout itself went down, so React has nothing left to render into.
 *
 * Next replaces the ROOT layout with this, which means no stylesheet, no
 * fonts and no theme - hence CrashScreen carrying its own inline styling.
 * Rare, and the one case where an agent would otherwise be looking at a blank
 * white page with a line of framework text on it.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ margin: 0, background: "#fdfbf9" }}>
        <CrashScreen
          error={error}
          reset={reset}
          headline="The OS stopped, not just this screen"
          what="Something went wrong underneath the whole page. It is ours to fix, and the report below carries everything we need to find it."
          picture={false}
        />
      </body>
    </html>
  );
}
