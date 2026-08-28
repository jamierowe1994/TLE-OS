"use client";

import { useState } from "react";
import BentoDash from "@/components/BentoDash";
import BlendVideo from "@/components/BlendVideo";
import PageHeader from "@/components/PageHeader";
import WindowScene from "@/components/WindowScene";
import { DASH_TRAY_GROUPS, DEFAULT_LAYOUT, WIDGETS } from "@/components/widgets";

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
  const [customising, setCustomising] = useState(false);
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
        /* Customise rides the search row — one line of chrome, not two. */
        actions={
          <button
            type="button"
            onClick={() => setCustomising((c) => !c)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
              customising
                ? "bg-accent-dark font-semibold text-page"
                : "border border-line/80 text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {customising ? "Done" : "✨ Customise"}
          </button>
        }
      />

      <BentoDash
        registry={WIDGETS}
        defaultLayout={DEFAULT_LAYOUT}
        trayGroups={DASH_TRAY_GROUPS}
        storeKey="tle-dash-layout-v1"
        control={{ on: customising, set: setCustomising }}
      />

      {/* ── He signs off the page ──
          Rendered through BlendVideo, not a bare <video>: Chrome composites
          video on its own hardware layer and can drop mix-blend-mode there
          mid-scroll — the white-plate flash. The isolated eggshell wrapper
          stays as the blend floor; BlendVideo makes what's blended a canvas,
          which the compositor treats as ordinary content on every frame. */}
      {/* He is a SECTION now, not an overlay.
      
          He used to be `fixed` to the viewport corner, which meant he padded
          across whatever happened to be under him — and a dog walking over a
          tile of figures reads as a rendering fault rather than a joke. There
          is no clever way to keep a floating element off arbitrary content;
          the fix is to stop it floating.
      
          So he sits in the flow, after the board, in white space he owns. Add
          a widget and the grid grows and pushes him down; he is always at the
          foot of the page and never on top of anything, because nothing is
          ever underneath him.

          LEFT, not right — the assistant now lives in the bottom-right corner
          of every screen, and two characters in the same corner is a crowd.
          And MIRRORED, so he faces into the page: a character looking off the
          edge leads the eye away from everything that matters, which is the
          one thing a decorative figure must never do. */}
      <div className="pointer-events-none mt-12 hidden justify-start pb-20 pl-2 sm:flex">
        {/* keyed: real alpha, no blending — a fixed layer drops blends, which
            is how the white box came back. .art inverts him in the dark. */}
        <BlendVideo
          keyed
          src="/illustrations/dog-wag-3.mp4"
          className="art pointer-events-none block w-56 -scale-x-100 lg:w-64"
        />
      </div>
    </>
  );
}
