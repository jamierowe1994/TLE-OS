"use client";

import { useEffect, useState } from "react";
import CrashScreen from "@/components/CrashScreen";
import { autoReport, whereItHappened } from "@/lib/auto-report";
import { isLostConnection } from "@/lib/lost-connection";
import { newBuildIsLive } from "@/lib/new-build";

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
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    /* A dropped connection ("Load failed") is the network, not a fault of
       ours, and is not filed (ticket 77d8e8a9, 13 Nov 2026). */
    if (isLostConnection(error)) return;
    /* A tab still on the build before a deploy (ticket 038f44d4, 18 Nov 2026:
       a Compliance desk open since before 11 Nov read the new tracker's
       chases as the old list and crashed on "C.chases.map is not a
       function"). Whatever the words, a crash on an old build is the update,
       so it says to refresh rather than filing a fault; if it happens again
       after the refresh, it is filed then. */
    let live = true;
    void newBuildIsLive().then((isNew) => {
      if (!live) return;
      if (isNew) setUpdated(true);
      else autoReport({ what: "screen crashed", message: `${error.message || "unknown"}${error.digest ? ` (digest ${error.digest})` : ""}`, detail: whereItHappened({ error }) });
    });
    return () => {
      live = false;
    };
  }, [error]);
  return <CrashScreen error={error} reset={reset} picture={false} updated={updated} />;
}
