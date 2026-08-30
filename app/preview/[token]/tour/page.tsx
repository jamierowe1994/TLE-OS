"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import PreviewShell from "@/components/preview/PreviewShell";
import Tour from "@/components/Tour";

/**
 * The walkthrough, running over a stand-in OS.
 *
 * The Tour component is the real one - same steps, same copy, same spotlight -
 * pointed at PreviewShell instead of the product. `preview` makes it offer
 * itself immediately and remember nothing, so it can be run, closed and run
 * again, which is what somebody does when they are being shown a thing rather
 * than using it.
 */
export default function PreviewTour({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return (
    <>
      <PreviewShell />

      {/* Top right, not bottom left. Bottom left is where the rail's profile
          foot sits, which is one of the things the tour spotlights - these
          buttons landed inside the lit area and collided with it. Top right is
          the only corner with nothing in it: Steve has the bottom right.
          Below the tour's overlay, so they are reachable once it closes. */}
      <div className="fixed right-4 top-4 z-[120] flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("os-tour"))}
          className="rounded-full border border-line/80 bg-panel px-3.5 py-1.5 text-[11.5px] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.5)] transition-colors hover:border-ink/40"
        >
          Show me round again
        </button>
        <Link
          href={`/preview/${token}`}
          className="rounded-full border border-line/80 bg-panel px-3.5 py-1.5 text-[11.5px] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.5)] transition-colors hover:border-ink/40"
        >
          Back
        </Link>
      </div>

      {/* Tour reads the query string, so it needs the same boundary the rest
          of the searchParams readers have. */}
      <Suspense fallback={null}>
        <Tour preview />
      </Suspense>
    </>
  );
}
