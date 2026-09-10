"use client";

import { useEffect, useState } from "react";
import BentoDash from "@/components/BentoDash";
import PageHeader from "@/components/PageHeader";
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
        /* Its bottom edge is the rug, so the rug IS the rule and nothing
           sits below the line - which is what the fall needs. Anything under
           the rule is hidden the moment the masthead starts to drop, so a
           figure that hangs below it loses its legs the instant you navigate.
           Every illustration in the OS now stops at the line for that reason.

           Bigger than the shared 250 because it is the home screen and the
           scene is wide rather than tall - 330 gives it about 458 across,
           which still leaves the greeting its one line. */
        illustration="/illustrations/home/armchair.webp"
        illustrationHeight={330}
        illustrationAspect={1.3879}
        /* Pushed down so the rug runs INTO the line rather than stopping
           politely above it - the bottom 6% goes under and is erased, which
           takes the front of the rug and a little of his shoe. That is what
           makes it sit in the page rather than on it. */
        seat={0.94}
        illustrationCrop
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

      </>
  );
}
