"use client";

import { useState } from "react";
import BentoDash from "@/components/BentoDash";
import PageHeader from "@/components/PageHeader";
import {
  FINANCE_DEFAULT_LAYOUT, FINANCE_TRAY_GROUPS, FINANCE_WIDGETS,
} from "@/components/widgets-finance";

/**
 * The money page, as a board the agent owns: the same bento machine as the
 * dashboard, pointed at fees, take-home, the platform and the year ahead.
 * Customise rides the search row like the home screen, so the two feel like
 * one product. Everything on the board is live at the rates an owner sets.
 */
export default function Finances() {
  const [customising, setCustomising] = useState(false);
  return (
    <>
      <PageHeader
        title="Finances"
        blurb="Your money, as a second dashboard: what the book earns this month, what comes to you, and where next month lands. Customise it like the home screen."
        /* Her own desk, the "Progress looks good on you" mug: the one scene
           in the set that is about the person's own numbers rather than a
           property. Not used anywhere else in the OS (James, 11 Sep 2026:
           "it shouldn't be an image that we've already used"). */
        illustration="/brand/art/agent-desk.png"
        illustrationHeight={330}
        illustrationAspect={1.2604}
        /* The desk front runs into the line, so she sits in the page rather
           than on the rule - the same trick as the armchair on the dashboard. */
        seat={0.93}
        illustrationCrop
        lineBreak="none"
        illustrationNudge={-34}
        actions={
          <button
            type="button"
            onClick={() => setCustomising((c) => !c)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
              customising
                ? "bg-accent-dark font-semibold text-page"
                : "border border-line/80 bg-page text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {customising ? "Done" : "✨ Customise"}
          </button>
        }
      />

      <BentoDash
        registry={FINANCE_WIDGETS}
        defaultLayout={FINANCE_DEFAULT_LAYOUT}
        trayGroups={FINANCE_TRAY_GROUPS}
        /* v2: the board was redrawn on 11 Sep 2026, so everybody opens on the
           new default once; a board saved under v1 is left where it was. */
        storeKey="tle-finance-layout-v2"
        control={{ on: customising, set: setCustomising }}
      />
    </>
  );
}
