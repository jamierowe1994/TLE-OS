"use client";

import { useEffect } from "react";
import CrashScreen from "@/components/CrashScreen";
import { autoReport } from "@/lib/auto-report";
import { isLostConnection } from "@/lib/lost-connection";

/**
 * A screen inside the phone app threw while rendering (Stuart Roper, ticket
 * 77d8e8a9, 13 Nov 2026).
 *
 * Until this the app had no error screen of its own, so anything that broke
 * on one of its pages went past the app to app/global-error.tsx and the
 * agent was told "The OS stopped, not just this screen" - the bar, the theme
 * and Steve all gone - when only one page had failed, and in his case only
 * because the phone lost signal while it loaded. This keeps the app around
 * the broken page, as app/(os)/error.tsx does for the desktop.
 */
export default function AgentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  /* Filed as it happens, as on the desktop. A dropped connection is not ours
     to fix, so it is not filed; the person can still send it. */
  useEffect(() => {
    if (isLostConnection(error)) return;
    autoReport({ what: "screen crashed", message: `${error.message || "unknown"}${error.digest ? ` (digest ${error.digest})` : ""}` });
  }, [error]);
  return <CrashScreen error={error} reset={reset} picture={false} />;
}
