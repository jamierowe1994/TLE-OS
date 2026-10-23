"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import LineIcon from "@/components/LineIcon";
import { openGuide } from "@/lib/guide-sheet";
import { useNewLook } from "@/lib/use-new-look";
import { Mast } from "@/components/new-look/Parts";
import { areaForPage, canSee, type AreaAccess } from "@/lib/area-map";

/**
 * Help in the new look (lib/new-look "help", 23 Oct 2026).
 *
 * The design's Help is a type-only masthead with Take the tour; under it the
 * same shelf the old page draws: the pop-up guides (lib/agent-guides, opened
 * over the page through lib/guide-sheet exactly as before), the back office
 * walkthroughs for those the Showroom is open to, and the written guides.
 * With the switch off the old page is drawn untouched.
 */

export type HelpData = {
  tourUrl: string;
  howTo: { id: string; title: string; blurb: string; icon: string; steps: number; minutes: number }[];
  backOffice: { id: string; title: string; lead: string; scenes: number }[];
  shelves: { name: string; items: { slug: string; title: string; blurb: string; icon: string; minutes: number; ready: boolean }[] }[];
};

export default function HelpLook({ old, data }: { old: ReactNode; data: HelpData }) {
  const look = useNewLook("help");
  if (look === null) {
    return (
      <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Opening Help…
      </p>
    );
  }
  if (!look) return <>{old}</>;
  return <HelpNew data={data} />;
}

/* The guides' doodle names, as the new look's line icons. */
const ICONS: Record<string, string> = {
  shield: "shield",
  calendar: "calendar",
  home: "home",
  checklist: "checklist",
  dashboard: "dashboard",
  "trend-up": "target",
  "magic-wand": "rocket",
};
const iconOf = (name: string) => ICONS[name] ?? "note";

const Chevron = () => (
  <svg className="nl-help-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

function HelpNew({ data }: { data: HelpData }) {
  /* The back office walkthroughs open in the Showroom, so they show only to
     somebody the Showroom is open to, asked the way the sidebar asks
     (as components/BackOfficeGuideCards). Nothing is drawn until it answers. */
  const [showroom, setShowroom] = useState<boolean | null>(null);
  useEffect(() => {
    let gone = false;
    const area = areaForPage("/showroom");
    fetch("/api/area-access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gone) return;
        const access: AreaAccess | null = j && typeof j.gated === "boolean" ? { gated: j.gated, tester: Boolean(j.tester), levels: j.levels ?? {} } : null;
        setShowroom(Boolean(access) && (!area || canSee(access, area)));
      })
      .catch(() => !gone && setShowroom(false));
    return () => {
      gone = true;
    };
  }, []);

  /* Opening the tour ticks it on Get Set for Launch, as the dashboard's card does. */
  const tookTour = () => {
    void fetch("/api/launch/ready", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tour: true }) }).catch(() => {});
  };

  return (
    <div data-look="new" data-screen="help" className="nl-page nl-rise nl-help">
      <Mast
        title="Help"
        blurb="How each part of the system works, step by step, with pictures of the real screens."
        actions={
          <a href={data.tourUrl} target="_blank" rel="noopener noreferrer" className="nl-btn nl-btn--primary" onClick={tookTour}>
            <TourIcon /> Take the tour
          </a>
        }
      />

      {/* Step by step: these pop up over the screen rather than opening a page,
          the same as they do from Steve's Guides tab. */}
      <section className="nl-help-sec">
        <div className="nl-help-sec-head">
          <h2 className="nl-section-title">How It Works</h2>
          <span className="nl-meta">Opens over the page you&apos;re on</span>
        </div>
        <ul className="nl-help-rows">
          {data.howTo.map((g) => (
            <li key={g.id}>
              <button type="button" className="nl-help-row" onClick={() => openGuide(g.id)}>
                <span className="nl-help-ic"><LineIcon name={iconOf(g.icon)} size={17} /></span>
                <span className="nl-help-text">
                  <span className="nl-help-title">{g.title}</span>
                  <span className="nl-help-blurb">{g.blurb}</span>
                </span>
                <span className="nl-mono nl-help-len">{g.steps} steps · {g.minutes} min</span>
                <Chevron />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {showroom && data.backOffice.length > 0 && (
        <section className="nl-help-sec">
          <div className="nl-help-sec-head">
            <h2 className="nl-section-title">The Back Office, Step by Step</h2>
            <span className="nl-meta">A guide and a live demo of each</span>
          </div>
          <ul className="nl-help-rows">
            {data.backOffice.map((j) => (
              <li key={j.id}>
                <Link href={`/showroom?side=backoffice&step=${j.id}`} className="nl-help-row">
                  <span className="nl-help-ic"><LineIcon name="rocket" size={17} /></span>
                  <span className="nl-help-text">
                    <span className="nl-help-title">{j.title}</span>
                    <span className="nl-help-blurb">{j.lead}</span>
                  </span>
                  <span className="nl-mono nl-help-len">{j.scenes} scenes</span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.shelves.map((s) => (
        <section key={s.name} className="nl-help-sec">
          <div className="nl-help-sec-head">
            <h2 className="nl-section-title">{s.name}</h2>
          </div>
          <ul className="nl-help-rows">
            {s.items.map((g) => (
              <li key={g.slug}>
                {g.ready ? (
                  <Link href={`/guides/${g.slug}`} className="nl-help-row">
                    <span className="nl-help-ic"><LineIcon name={iconOf(g.icon)} size={17} /></span>
                    <span className="nl-help-text">
                      <span className="nl-help-title">{g.title}</span>
                      <span className="nl-help-blurb">{g.blurb}</span>
                    </span>
                    <span className="nl-mono nl-help-len">{g.minutes} min read</span>
                    <Chevron />
                  </Link>
                ) : (
                  /* Listed but not openable: a card that opens onto a stub
                     teaches a reader the shelf cannot be trusted. */
                  <div className="nl-help-row is-soon" aria-disabled>
                    <span className="nl-help-ic"><LineIcon name={iconOf(g.icon)} size={17} /></span>
                    <span className="nl-help-text">
                      <span className="nl-help-title">{g.title}</span>
                      <span className="nl-help-blurb">{g.blurb}</span>
                    </span>
                    <span className="nl-help-len nl-meta">Being written</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

    </div>
  );
}

/** The design's tour pin. */
function TourIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    </svg>
  );
}
