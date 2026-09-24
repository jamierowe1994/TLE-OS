"use client";

import { useEffect } from "react";

/**
 * Every email link on the agent screens opens in a new tab.
 *
 * Howard, 24 Sep 2026: "Email them" after booking a viewing opened Outlook
 * 365 in the same window, and he lost his place in the OS. A browser that
 * hands mailto: to Outlook on the web does it in the tab that was clicked.
 * Twenty-odd plain mailto links across the OS all behave that way, so it is
 * fixed once here rather than link by link: the link is given a new-tab
 * target at the moment it is clicked. A desktop mail app still opens as it
 * always did.
 *
 * Sending from the OS itself (with a reference to match the reply) waits on
 * OUTBOUND_COMPOSER_SEND, which is off.
 */
export default function MailLinksNewTab() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href^='mailto:' i]") as HTMLAnchorElement | null;
      if (!a || a.target) return;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
