"use client";

import { useEffect } from "react";
import { PORTAL_WATCH_EVENT, portalList, unwatchPortalSend, updatePortalWatch, watchedPortalSends } from "@/lib/portal-watch";
import { toast } from "@/lib/toast";

/**
 * Follows a listing REX is still sending to the portals, on every page, and
 * says when it is live (James, 6 Nov 2026: "allowing them to carry on whilst
 * we put it into the portals ... poll the system then give them a toast
 * saying it's live").
 *
 * Asks /api/listings/portal-send every 15 seconds for each listing this
 * browser is waiting on (lib/portal-watch). The server sends it again if an
 * older take-off got in first or nothing has run. After half an hour it is
 * reported to the office once, and the agent told; after three hours the
 * watching stops (the listing's page still says where it is). Renders nothing.
 */

const EVERY_MS = 15_000;
const LATE_MS = 30 * 60_000;
const GIVE_UP_MS = 3 * 60 * 60_000;

export default function PortalSendWatcher() {
  useEffect(() => {
    let busy = false;
    const ask = async () => {
      if (busy) return;
      const list = watchedPortalSends();
      if (!list.length) return;
      busy = true;
      try {
        for (const w of list) {
          const age = Date.now() - w.since;
          if (age > GIVE_UP_MS) {
            unwatchPortalSend(w.id, "gave-up");
            continue;
          }
          const late = age > LATE_MS && !w.late;
          try {
            const r = await fetch("/api/listings/portal-send", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: Number(w.id), since: w.since, tries: w.tries, late }),
            });
            if (r.status === 401) return; // signed out: nothing to tell
            const j = (await r.json().catch(() => ({}))) as { ok?: boolean; state?: string; portals?: string[]; refused?: { portal: string; why: string }[]; tries?: number };
            if (j.state === "live") {
              unwatchPortalSend(w.id, "live");
              toast(`${w.name} is live on ${portalList(j.portals)}.`, "ok", 9000);
            } else if (j.state === "failed") {
              unwatchPortalSend(w.id, "failed");
              const first = j.refused?.[0];
              toast(`${w.name} is on ${j.portals?.length ? portalList(j.portals) : "the market"}${first ? `, but ${first.portal} turned it down: ${first.why}` : ", but a portal turned it down"}. Open the listing to see what it needs.`, "bad", 12000);
            } else if (j.state === "off") {
              unwatchPortalSend(w.id, "off");
            } else {
              const patch: { tries?: number; late?: boolean } = {};
              if (typeof j.tries === "number" && j.tries !== w.tries) patch.tries = j.tries;
              if (late) {
                patch.late = true;
                toast(`${w.name} still isn't through to the portals after half an hour. It hasn't been lost - the office has been told and we're still trying.`, "bad", 12000);
              }
              if (Object.keys(patch).length) updatePortalWatch(w.id, patch);
            }
          } catch {
            /* offline a moment: ask again next time */
          }
        }
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(ask, 5000);
    const t = window.setInterval(ask, EVERY_MS);
    const now = () => void ask();
    window.addEventListener(PORTAL_WATCH_EVENT, now);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
      window.removeEventListener(PORTAL_WATCH_EVENT, now);
    };
  }, []);
  return null;
}
