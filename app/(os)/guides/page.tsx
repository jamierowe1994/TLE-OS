import Link from "next/link";
import BackOfficeGuideCards from "@/components/BackOfficeGuideCards";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { GUIDES, GUIDE_SECTIONS } from "@/lib/guides";
import { AGENT_GUIDES } from "@/lib/agent-guides";
import GuideButton from "@/components/GuideButton";
import { BACK_OFFICE } from "@/lib/showroom/back-office";
import HelpLook from "@/components/new-look/help/HelpLook";
import { TOUR_URL } from "@/lib/launch";

/**
 * Help: the guide shelf, reached from Help at the foot of the sidebar
 * (components/LaunchNav, 11 Oct 2026). Every agent can open it, so nothing on
 * it is written to James: the "where these are going" notes that sat at the
 * foot of the page came off when it became the agents' Help.
 */

export const dynamic = "force-dynamic";

export default function GuidesPage() {
  const sections = GUIDE_SECTIONS.map((s) => ({
    name: s,
    items: GUIDES.filter((g) => g.section === s),
  })).filter((s) => s.items.length > 0);
  const backOffice = BACK_OFFICE.map((j) => ({ id: j.id, title: j.title, lead: j.lead, scenes: j.scenes(j.ways?.[0]?.id ?? "portal").length }));

  /* The new look (lib/new-look "help", 23 Oct 2026) draws the same shelf its
     own way; with the switch off, the page below is drawn exactly as it was. */
  return (
    <HelpLook
      data={{
        tourUrl: TOUR_URL,
        howTo: AGENT_GUIDES.map((g) => ({ id: g.id, title: g.title, blurb: g.blurb, icon: g.icon, steps: g.steps.length, minutes: g.minutes })),
        backOffice,
        shelves: sections.map((sec) => ({ name: sec.name, items: sec.items.map((g) => ({ slug: g.slug, title: g.title, blurb: g.blurb, icon: g.icon, minutes: g.minutes, ready: g.ready })) })),
      }}
      old={
    <>
      <PageHeader
        title="Help"
        blurb="How each part of the system works, step by step, with pictures of the real screens."
        /* Nothing on this page is searchable, and a bar offering to find
           properties and tenants on a shelf of documents is a promise the page
           cannot keep. */
        search={false}
      />

      {/* Step by step: these pop up over the screen rather than opening a page,
          the same as they do from Steve's Guides tab. */}
      <section className="fade-up mt-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">How it works</p>
        <div className="mt-3 flex flex-col gap-3">
          {AGENT_GUIDES.map((g) => (
            <GuideButton
              key={g.id}
              id={g.id}
              icon={false}
              className="block-pop block w-full rounded-2xl border border-line/80 bg-panel p-5 text-left"
            >
              <span className="flex flex-wrap items-baseline gap-2.5">
                <DoodleIcon name={g.icon} size={18} className="self-center text-accent-dark" />
                <span className="hand text-[17px]">{g.title}</span>
                <span className="text-[10.5px] text-muted">
                  {g.steps.length} steps · {g.minutes} min
                </span>
                <span className="ml-auto text-muted">→</span>
              </span>
              <span className="mt-1.5 block max-w-2xl text-[12px] leading-relaxed text-muted">{g.blurb}</span>
            </GuideButton>
          ))}
        </div>
      </section>

      {/* The back office's walkthroughs live in the Showroom, where each one
          is a guide to read and a live demo on the real screens (7 Oct 2026).
          Shown only to people the Showroom is switched on for. */}
      <BackOfficeGuideCards
        cards={backOffice}
      />

      {sections.map((section) => (
        <section key={section.name} className="fade-up mt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {section.name}
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {section.items.map((g) =>
              g.ready ? (
                <Link
                  key={g.slug}
                  href={`/guides/${g.slug}`}
                  className="block-pop rounded-2xl border border-line/80 bg-panel p-5"
                >
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <DoodleIcon name={g.icon} size={18} className="self-center text-accent-dark" />
                    <span className="hand text-[17px]">{g.title}</span>
                    <span className="text-[10.5px] text-muted">
                      {g.minutes} min read
                    </span>
                    <span className="ml-auto text-muted">→</span>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">
                    {g.blurb}
                  </p>
                </Link>
              ) : (
                /* Listed but not openable. A card that opens onto a stub is
                   how a reader learns the shelf cannot be trusted. */
                <div
                  key={g.slug}
                  className="rounded-2xl border border-dashed border-line/80 p-5 opacity-70"
                >
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <DoodleIcon name={g.icon} size={18} className="self-center text-muted" />
                    <span className="hand text-[17px] text-muted">{g.title}</span>
                    <span className="ml-auto text-[10.5px] text-muted">Being written</span>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">
                    {g.blurb}
                  </p>
                </div>
              )
            )}
          </div>
        </section>
      ))}
    </>
      }
    />
  );
}
