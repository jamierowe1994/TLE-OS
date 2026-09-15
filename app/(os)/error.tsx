"use client";

import { useEffect } from "react";
import CrashScreen from "@/components/CrashScreen";
import { autoReport } from "@/lib/auto-report";

/**
 * A screen inside the OS threw while rendering.
 *
 * Next shows its own words for this - "Application error: a client-side
 * exception has occurred" - which is the last thing a pilot agent should be
 * reading on a Monday morning. This puts our words there instead, and one
 * button that files the whole thing: the route, the stack and the last few
 * steps. No picture: React has already torn the screen down, so there is
 * nothing left to photograph. The timeout bar in Watchdog does take one,
 * because there the screen is still sitting behind the panel.
 *
 * It sits inside the OS layout, so the rail, the theme and Steve are all
 * still there and the person is not thrown out of the product. A crash in the
 * layout itself lands on app/global-error.tsx instead.
 */
export default function OsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  /* Filed the moment it happens (15 Sep 2026), whether or not they press the
     button - most people who hit a crash reload and say nothing. */
  useEffect(() => {
    autoReport({ what: "screen crashed", message: `${error.message || "unknown"}${error.digest ? ` (digest ${error.digest})` : ""}` });
  }, [error]);
  return <CrashScreen error={error} reset={reset} picture={false} />;
}
