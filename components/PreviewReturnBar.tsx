"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * The way back out of a customer portal.
 *
 * The tenant and landlord portals, and the pre-appraisal deck, are their own
 * products: different layout, different brand, no OS chrome, deliberately not
 * this thing's look. That is right for a customer and a dead end for James,
 * who opens them from the admin hub to look at something and then has only the
 * browser's back button - and on the deck, which navigates within itself, not
 * even that reliably.
 *
 * So this is the same idea as the "viewing as" band: you are somewhere that is
 * not yours, it says so, and getting out is one click from wherever you have
 * wandered to.
 *
 * ── It must never appear for a real customer ──────────────────────────────
 *
 * Shown ONLY when the URL carries ?from=admin, which the hub adds and nothing
 * else does. A tenant following the link in their email has no such parameter
 * and sees exactly what they saw before. That is the whole safety story, and
 * it is why this keys off the query string rather than off a session: these
 * pages are exempt from the session gate and a signed-in check would be both
 * meaningless here and a new reason for the page to talk to the server.
 *
 * Quiet, not loud. ViewAsBar is a red band because an owner reading somebody
 * else's figures and forgetting is a real hazard. Looking at a demo portal is
 * not - the hazard would be a bar so prominent it spoils the thing James is
 * trying to show somebody. So: small, cornered, and out of the way.
 */
function Bar() {
  const from = useSearchParams().get("from");
  if (from !== "admin") return null;

  return (
    <div className="fixed bottom-3 left-3 z-[300] print:hidden">
      <Link
        href="/admin/portals"
        className="flex items-center gap-2 rounded-full border border-black/10 bg-white/95 px-3.5 py-2 text-[12px] text-neutral-700 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] backdrop-blur transition-colors hover:text-black"
      >
        <span aria-hidden>←</span>
        Back to Portals
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Preview
        </span>
      </Link>
    </div>
  );
}

export default function PreviewReturnBar() {
  /* useSearchParams needs a boundary or the whole route opts out of static
     rendering - and these customer pages are static, which is the point of
     them being fast. */
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
