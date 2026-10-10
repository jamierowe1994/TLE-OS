"use client";

import { useEffect } from "react";

/**
 * When a session ends, go and sign in (Rig run 4, P-054, 10 Oct 2026).
 *
 * The middleware answers an API call with no session with a 401 marked
 * x-os-signed-out. Every screen's own fetch would otherwise just fail - "Couldn't
 * refresh just now" - and leave its last figures on screen, badged live. This
 * watches every fetch once, and on that marker (and only that marker: a route
 * refusing on permissions is a different 401/403) sends the browser to
 * /sign-in, coming back to this page.
 */
export default function SignedOutWatch() {
  useEffect(() => {
    const w = window as typeof window & { __osSignedOutWatch?: boolean };
    if (w.__osSignedOutWatch) return;
    w.__osSignedOutWatch = true;
    const original = window.fetch.bind(window);
    let leaving = false;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (!leaving && res.status === 401 && res.headers.get("x-os-signed-out") === "1") {
        leaving = true;
        const here = window.location.pathname + window.location.search;
        window.location.assign(`/sign-in?next=${encodeURIComponent(here)}`);
      }
      return res;
    };
  }, []);
  return null;
}
