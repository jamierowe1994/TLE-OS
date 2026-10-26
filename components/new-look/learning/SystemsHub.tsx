"use client";

import Link from "next/link";
import { Mast } from "@/components/new-look/Parts";
import { BACK_OFFICE } from "@/lib/showroom/back-office";
import { STEPS_FOR, type ShowroomSide } from "@/lib/showroom/content";
import { Arrow, Back } from "./LearningHub";

/**
 * Tools > Learning > Systems (James, 26 Oct 2026): "similar to showroom but
 * better, with the new updated style... almost like a virtual tour. They'll be
 * able to click into each section, so it'll have a bunch of different things,
 * like landlord view or whatever, and they can see the emails and the stuff."
 *
 * One door per journey, from the Showroom's own content (lib/showroom), so a
 * stop added there is on the tour too. Each opens the tour (./TourNew).
 */

export const JOURNEYS: { side: ShowroomSide; name: string; says: string; tone: string }[] = [
  { side: "landlord", name: "The Landlord's Journey", says: "From the valuation enquiry to a let and a managed home: the decks, the terms, the portal and every email on the way.", tone: "clay" },
  { side: "tenant", name: "The Tenant's Journey", says: "From the first email to the day they get the keys: the passport, the viewing, the offer and moving in.", tone: "sage" },
  { side: "agent", name: "Your Side of the Desk", says: "The same journeys from your chair: the screens you work in, the emails you send and the ones that come to you.", tone: "brown" },
];

function Art({ side }: { side: ShowroomSide | "office" }) {
  const p = {
    landlord: (
      <>
        <path d="M3.5 11L12 4l8.5 7" />
        <path d="M6 9.5V20h12V9.5" />
        <path d="M10 20v-5h4v5" />
      </>
    ),
    tenant: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5" />
      </>
    ),
    agent: (
      <>
        <rect x="3" y="4.5" width="18" height="12" rx="2" />
        <path d="M8.5 20h7M12 16.5V20" />
      </>
    ),
    office: (
      <>
        <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" />
      </>
    ),
  }[side];
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p}
    </svg>
  );
}

export default function SystemsHub() {
  return (
    <div data-look="new" className="nl-page nl-rise nl-lr">
      <Back href="/tools/learning" label="Learning" />
      <Mast title="Systems" blurb="Take the tour. Each journey walks through the system one stop at a time: what the other person sees, the emails that go, and what you press to set it off." />
      <div className="nl-lr-journeys">
        {JOURNEYS.map((j, i) => (
          <Link key={j.side} href={`/tools/learning/systems/${j.side}`} className={`nl-lr-journey is-${j.tone}`} style={{ animationDelay: `${80 + i * 80}ms` }}>
            <span className="nl-lr-journey-art">
              <Art side={j.side} />
              <b>{STEPS_FOR[j.side].length} stops</b>
            </span>
            <span className="nl-lr-journey-name">{j.name}</span>
            <span className="nl-lr-journey-says">{j.says}</span>
            <span className="nl-lr-door-go">
              Start the tour <Arrow />
            </span>
          </Link>
        ))}
        <Link href="/showroom?side=backoffice" className="nl-lr-journey is-coral" style={{ animationDelay: `${80 + JOURNEYS.length * 80}ms` }}>
          <span className="nl-lr-journey-art">
            <Art side="office" />
            <b>{BACK_OFFICE.length} walkthroughs</b>
          </span>
          <span className="nl-lr-journey-name">The Back Office</span>
          <span className="nl-lr-journey-says">Compliance, a repair from every door, the gas safety, visits and planned work, and a deposit with Flatfair, as live demos on the real screens.</span>
          <span className="nl-lr-door-go">
            Open the walkthroughs <Arrow />
          </span>
        </Link>
      </div>
    </div>
  );
}
