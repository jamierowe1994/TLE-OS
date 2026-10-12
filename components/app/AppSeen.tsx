"use client";

import { useEffect } from "react";

/**
 * Notes that somebody has opened the phone app, once a visit (James, 12 Oct
 * 2026: "I'll be interested to see who's using the mobile app"). Feeds the
 * Phone app tick on Admin > Launch and the agent's own checklist.
 *
 * How they opened it: the iPhone app says so in its user agent (TLEOSApp/),
 * a home-screen install runs standalone, anything else is a phone browser.
 */
export default function AppSeen() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("app-seen")) return;
      sessionStorage.setItem("app-seen", "1");
    } catch {
      /* No storage: say it anyway. One small write a page load is fine. */
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    const app = /TLEOSApp\//.test(navigator.userAgent) ? "ios" : standalone ? "homescreen" : "browser";
    void fetch("/api/launch/ready", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app }),
    }).catch(() => {});
  }, []);
  return null;
}
