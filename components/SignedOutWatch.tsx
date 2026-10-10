"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";

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
    let toldAt = 0;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      /* Paused for opening too much too fast (the middleware's pace cap):
         said once a minute, in the middleware's own words, rather than as
         every panel's "couldn't load". */
      if (res.status === 429 && res.headers.get("x-os-paused") === "1" && Date.now() - toldAt > 60_000) {
        toldAt = Date.now();
        res
          .clone()
          .json()
          .then((j: { error?: string }) => toast(j.error ?? "TLE OS has paused for a few minutes.", "bad"))
          .catch(() => toast("TLE OS has paused for a few minutes.", "bad"));
      }
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
