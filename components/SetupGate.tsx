"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSetup } from "@/lib/setup-store";
import { setupComplete } from "@/lib/setup";

/**
 * Nobody reaches the OS with an account that is not finished being set up.
 *
 * ── Why this is a gate and not a nag ──────────────────────────────────────
 *
 * The one step that matters is REX. Every figure an agent sees is their own
 * work read out of it, so an account without it reaches a dashboard of empty
 * tiles. That does not look like an unfinished setup, it looks like a broken
 * product - and during a pre-launch, where we are asking people to report
 * exactly that kind of thing, we would be manufacturing our own false bug
 * reports. Email is skippable; REX, the pre-launch explanation and the
 * appearance choice are not.
 *
 * ── Fail open, deliberately ───────────────────────────────────────────────
 *
 * If there is no database, this does nothing. It cannot know whether somebody
 * is set up, and locking every agent out of the OS on the strength of a query
 * that did not answer is a far worse failure than letting a half-set-up
 * account through. This is a guide rail, not a lock: nothing here protects
 * anything, it just stops somebody starting in the wrong place.
 */
export default function SetupGate() {
  const router = useRouter();
  const { view, ready } = useSetup();
  /* Redirect at most once. router.push does not unmount this component before
     the new route commits, so a second pass would fire again on the same
     stale view and fight the navigation. */
  const sent = useRef(false);

  useEffect(() => {
    if (!ready || sent.current) return;
    if (!view.db || !view.signedIn) return;
    if (setupComplete(view)) return;
    sent.current = true;
    router.replace("/setup");
  }, [ready, view, router]);

  return null;
}
