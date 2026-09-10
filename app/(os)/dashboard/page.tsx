"use client";

import { useState } from "react";
import BentoDash from "@/components/BentoDash";
import BlendVideo from "@/components/BlendVideo";
import PageHeader from "@/components/PageHeader";
import HomeScene, { HOME_SCENE_ASPECT } from "@/components/HomeScene";
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
        /* The greeting carries this page, and at 30 it read as a label rather
           than a welcome. Sized off James's reference. */
        titleSize={42}
        blurb="Here's what's happening with your lettings business today."
        /* James's painted scene, in whichever accent the person picked - the
           file is chosen in CSS off the data-accent already on <html>, so it
           is right on the first frame. See components/HomeScene.

           NOTE: this replaces WindowScene, which drew the sky from the live
           Manchester weather. The painted sky cannot do that. The component
           is still in the repo if that turns out to be a loss worth having
           back. */
        illustrationNode={<HomeScene />}
        illustrationAspect={HOME_SCENE_ASPECT}
        /* Deliberately taller than the header, which is the point of this
           artwork: the window runs off the top of the page and is cut by the
           window edge, the dog sits on the rule, and the sofa front and his
           trailing leg carry on underneath it. 560 leaves his head about 30px
           clear of the cut. */
        illustrationHeight={470}
        /* Only a little deeper than the standard 232. The search bar moving
           to the top gave back the row that used to sit under the rule, so
           the masthead needs far less of its own depth to clear his head. */
        minHeight={240}
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
                : /* bg-page, not transparent: this now sits in the top bar,
                     over the illustration, and a see-through button on a
                     painted window is unreadable. */
                  "border border-line/80 bg-page text-muted hover:border-ink hover:text-ink"
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
