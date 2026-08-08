"use client";

import BentoDash from "@/components/BentoDash";
import BlendVideo from "@/components/BlendVideo";
import PageHeader from "@/components/PageHeader";
import WindowScene from "@/components/WindowScene";

/**
 * The dashboard is now a bento board the agent owns. The DEFAULT layout is
 * the reference dashboard exactly as it was — four stats, three working
 * boxes, the pipeline — so day one looks identical and customisation is a
 * choice, never a chore. Everything that used to be hard-coded here lives in
 * the widget registry (components/widgets.tsx), where each widget also knows
 * how to render deeper as it's given more room.
 */

/** Four bands, matching the portal's greeting — the OS should feel awake. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up, James?";
  if (h < 12) return "Good morning, James";
  if (h < 17) return "Good afternoon, James";
  if (h < 22) return "Good evening, James";
  return "Still up, James?";
}

export default function Dashboard() {
  return (
    <>
      <PageHeader
        title={greeting()}
        blurb="Here's what's happening with your lettings business today."
        /* translate-x cancels the empty margin drawn inside the artwork
           itself (its ink stops 26/520 short of its own right edge), so the
           frame genuinely touches the corner instead of hovering near it. */
        illustrationNode={<WindowScene className="translate-x-[9px]" />}
        lineBreak="none"
        flushRight
      />

      <BentoDash />

      {/* ── He signs off the page ──
          Rendered through BlendVideo, not a bare <video>: Chrome composites
          video on its own hardware layer and can drop mix-blend-mode there
          mid-scroll — the white-plate flash. The isolated eggshell wrapper
          stays as the blend floor; BlendVideo makes what's blended a canvas,
          which the compositor treats as ordinary content on every frame. */}
      <div className="mt-2 flex justify-end pr-6">
        <div className="isolate hidden bg-page sm:block">
          <BlendVideo
            src="/illustrations/dog-wag-3.mp4"
            className="art-video pointer-events-none w-72"
          />
        </div>
      </div>
    </>
  );
}
