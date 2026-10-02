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
        /* 2 Oct 2026: James swapped the armchair scene for a brick loft
           floating on clouds ("I do love the properties ... lean more towards
           that side"). His transparent PNG, trimmed to its clouds and nothing
           cut or faded at the ends, turned 2 degrees anticlockwise: the
           building's base fell 2 degrees to the right and looked tipped on a
           level rule ("needs to be just twisted slightly").
           The masthead is the standard 268, the same line as every other
           screen. The rule runs through the clouds just under the building's
           base: it stands on the line and the lower clouds (and the slant the
           turn leaves at the bottom edge) go under it. */
        illustration="/illustrations/home/brick-loft-clouds.webp"
        illustrationHeight={245}
        illustrationAspect={2.6836}
        /* Wide art: drawn from 1280px up only, so on a smaller laptop or a
           tablet the greeting keeps the width and the line stays level with
           every other screen - see artFromXl. */
        hideArtOnPhone
        artFromXl
        /* A 1280 laptop with a tall screen has 160px less masthead than a
           1440 one: three quarters size there keeps the greeting on its line. */
        smallXlScale={0.75}
        seat={0.9}
        illustrationCrop
        lineBreak="none"
        /* Pinned to the right edge. The seated inset (166px) is room for a
           figure's legs to hang past the page's button; clouds have no legs,
           so that room goes to the building instead ("a bit bigger still"),
           and the clouds run out to the end of the line. */
        flushRight
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
