"use client";

import { useEffect, useState } from "react";
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

/**
 * Four bands, matching the portal's greeting — the OS should feel awake.
 *
 * ── Whose name (10 Sep 2026) ─────────────────────────────────────────────
 *
 * It was the word "James", typed in, for everybody: every agent who has ever
 * signed in has been greeted by the owner's name, and an owner viewing as
 * somebody else - which is exactly when you are checking that their account
 * looks right - was greeted as himself on their dashboard.
 *
 * The name comes from /api/auth/me, which reports the SUBJECT, so it is
 * theirs while a view-as is open and their own the rest of the time. Until
 * it answers there is no name at all rather than a guess: a greeting that
 * says the wrong name for half a second is worse than one that arrives a
 * moment late.
 */
function greeting(name: string): string {
  const h = new Date().getHours();
  const who = name ? `, ${name}` : "";
  if (h < 5) return name ? `Still up, ${name}?` : "Still up?";
  if (h < 12) return `Good morning${who}`;
  if (h < 17) return `Good afternoon${who}`;
  if (h < 22) return `Good evening${who}`;
  return name ? `Still up, ${name}?` : "Still up?";
}

export default function Dashboard() {
  const [customising, setCustomising] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    let gone = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: { name?: string } | null } | null) => {
        const first = (j?.user?.name ?? "").trim().split(/\s+/)[0] ?? "";
        if (!gone) setName(first);
      })
      .catch(() => {});
    return () => { gone = true; };
  }, []);
  return (
    <>
      <PageHeader
        title={greeting(name)}
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
        illustrationHeight={450}
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
