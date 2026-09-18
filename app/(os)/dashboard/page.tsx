"use client";

import { useEffect, useState } from "react";
import BentoDash from "@/components/BentoDash";
import PageHeader from "@/components/PageHeader";
import QuickLinks from "@/components/QuickLinks";
import { DASH_TRAY_GROUPS, DEFAULT_LAYOUT, WIDGETS } from "@/components/widgets";
import { fetchMe } from "@/lib/me";

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
  /* ON A PHONE, THE DASHBOARD IS TODAY'S CALENDAR (James, 18 Sep 2026: "when
     we log in on mobile view only, we should just show them what their diary
     looks like today"). Width and a touch pointer together, the same test as
     sign-in, so a narrow laptop window or a tablet never moves. "Open the
     Full OS" in the phone menu comes here with ?full=1, which holds for the
     rest of that visit. */
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("full") === "1") sessionStorage.setItem("os-full", "1");
      if (sessionStorage.getItem("os-full") === "1") return;
    } catch {
      /* No storage: the phone check alone decides. */
    }
    if (window.matchMedia("(max-width: 640px) and (pointer: coarse)").matches) window.location.replace("/m");
  }, []);
  const [customising, setCustomising] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => {
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
        /* Nothing sits below the line - which is what the fall needs. Anything
           under the rule is hidden the moment the masthead starts to drop, so a
           figure that hangs below it loses its legs the instant you navigate.
           Every illustration in the OS now stops at the line for that reason.

           Bigger than the shared 250 because it is the home screen and the
           scene is wide rather than tall - 330 gives it about 400 across,
           which still leaves the greeting its one line. */
        illustration="/illustrations/home/armchair.webp"
        /* 13 Sep, later: bigger, and sat further under the line (James: "it
           looks better when the images are coming from underneath the line").
           400 tall with the rule crossing at 0.80 keeps 320 above the line -
           a touch more masthead than before - and hides the bottom fifth: the
           chair legs, the table's base and the shoes are under the line now. */
        illustrationHeight={400}
        /* And the masthead itself a touch taller than the shared 268, so the
           bigger scene has room above the rule and the head clears the search
           row (James, 13 Sep 2026). */
        minHeight={300}
        /* 13 Sep: James swapped in the stripped-down version of the same scene
           - the dog, the books, the framed print, the magazines and the rug are
           all gone, and it comes on a transparent ground instead of white. The
           file is trimmed to its content, so the aspect moved 1.3879 -> 1.2113
           and the seat had to move with it: the rug used to be the bottom edge,
           and now the lowest thing in the drawing is the front shoe on its own.
           0.88 would have taken the whole foot. */
        illustrationAspect={1.2113}
        /* The biggest drawing in the OS, on the smallest screen it has to
           share with a three-line greeting. Below 640px it goes and the words
           take the width - see hideArtOnPhone. */
        hideArtOnPhone
        /* The rug was what tied the furniture to the ground, and it has gone
           with it, so the line has to do that job instead: at 0.92 the side
           table's ring base lands ON the rule, the chair legs come down to it
           and the front shoe runs INTO it. Tried 0.97 first - everything
           hovered 30px above the line with nothing under it - and 0.895, which
           chopped the front leg of the chair. */
        seat={0.8}
        illustrationCrop
        lineBreak="none"
        /* Off the right edge, and back from it.
           flushRight pinned the scene to right-0 and the masthead cropped its
           corner - James, 10 Sep: "it feels like it's getting the edge cut
           off". It keeps the standard inset now and comes in a further 34px,
           so the whole vignette is inside the frame. */
        illustrationNudge={-34}
        /* Customise rides the search row — one line of chrome, not two.
           The agent's quick links sit to its right (components/QuickLinks):
           pills they picked themselves, and in customise mode the circle that
           adds them. */
        actions={<>
          <button data-steve="dash.customise"
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
          <QuickLinks customising={customising} />
        </>}
      />

      <BentoDash
        registry={WIDGETS}
        defaultLayout={DEFAULT_LAYOUT}
        trayGroups={DASH_TRAY_GROUPS}
        storeKey="tle-dash-layout-v1"
        control={{ on: customising, set: setCustomising }}
      />

      </>
  );
}
