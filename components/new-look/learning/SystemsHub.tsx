"use client";

import Link from "next/link";
import { Mast } from "@/components/new-look/Parts";
import { JOURNEYS as TOUR } from "@/lib/learning/systems";
import type { JourneyId } from "@/lib/learning/systems-types";
import { JourneyCover } from "./Covers";
import { Arrow, Back } from "./LearningHub";

/**
 * Tools > Learning > Systems (James, 26 Oct 2026): "similar to showroom but
 * better, with the new updated style... almost like a virtual tour. They'll be
 * able to click into each section, so it'll have a bunch of different things,
 * like landlord view or whatever, and they can see the emails and the stuff."
 *
 * One illustrated tile per journey, each opening that journey's tour. Nothing
 * here links to the old Showroom (James: nothing old). The file count on each
 * tile is read from the tour itself (lib/learning/systems) and only shows once
 * that journey has files.
 */

export const JOURNEYS: { side: JourneyId; name: string; says: string; tone: string }[] = [
  { side: "landlord", name: "The Landlord's Journey", says: "From the valuation enquiry to a let and a managed home: the decks, the terms, the portal and every email on the way.", tone: "clay" },
  { side: "tenant", name: "The Tenant's Journey", says: "From the first email to the day they get the keys: the passport, the viewing, the offer and moving in.", tone: "sage" },
  { side: "agent", name: "Your Side of the Desk", says: "The same journeys from your chair: the screens you work in, the emails you send and the ones that come to you.", tone: "brown" },
];

function filesIn(side: JourneyId): number {
  const j = TOUR.find((x) => x.id === side);
  return j ? j.folders.reduce((n, f) => n + f.files.length, 0) : 0;
}

export default function SystemsHub() {
  return (
    <div data-look="new" className="nl-page nl-rise nl-lr">
      <Back href="/tools/learning" label="Learning" />
      <Mast title="Systems" blurb="Take the tour. Each journey walks through the system one step at a time: what the other person sees, the emails that go, and what you press to set it off." />
      <div className="nl-lr-journeys">
        {JOURNEYS.map((j, i) => {
          const n = filesIn(j.side);
          return (
            <Link key={j.side} href={`/tools/learning/systems/${j.side}`} className={`nl-lr-journey is-${j.tone}`} style={{ animationDelay: `${80 + i * 80}ms` }}>
              <span className="nl-lr-journey-art" aria-hidden>
                <JourneyCover id={j.side} />
                {n > 0 && <b>{n === 1 ? "1 file" : `${n} files`}</b>}
              </span>
              <span className="nl-lr-journey-name">{j.name}</span>
              <span className="nl-lr-journey-says">{j.says}</span>
              <span className="nl-lr-door-go">
                Start the tour <Arrow />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
