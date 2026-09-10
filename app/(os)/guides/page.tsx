import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { GUIDES, GUIDE_SECTIONS } from "@/lib/guides";

/**
 * The shelf.
 *
 * Filed under Admin > System because that is where James asked for it to sit
 * while the guides are being written. It is a staging area and not the final
 * home: these are written for agents, and agents cannot open Admin at all
 * (`admin:open` is owner-only). The destination is Steve's Guides tab, which
 * currently holds an honest empty shelf and one link to re-run the tour.
 */

export const dynamic = "force-dynamic";

export default function GuidesPage() {
  const sections = GUIDE_SECTIONS.map((s) => ({
    name: s,
    items: GUIDES.filter((g) => g.section === s),
  })).filter((s) => s.items.length > 0);

  return (
    <>
      <PageHeader
        title="Guides"
        blurb="Written walkthroughs for somebody on their first morning. Read them the way an agent would, then tell me what is missing."
        /* Nothing on this page is searchable, and a bar offering to find
           properties and tenants on a shelf of documents is a promise the page
           cannot keep. */
        search={false}
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
                  href={`/admin/guides/${g.slug}`}
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

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Where these are going</h2>
        <ul className="mt-2.5 flex max-w-2xl list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>
            They live here while they are being written and checked. Agents cannot
            reach the admin area, so nobody sees one by accident.
          </li>
          <li>
            The home for them is Steve&apos;s <span className="text-ink">Guides</span> tab,
            which still says &quot;Guides are on their way&quot; and lists nothing. It is not
            wired to this list yet. When it is, the guide pages also have to move out
            from under <span className="text-ink">/admin</span>, because an agent
            following a link into the admin area gets bounced back to their own screen.
          </li>
          <li>
            Screenshots are taken from the real screen rather than drawn, so they go
            stale when the screen changes. Anything that has moved is worth re-shooting
            before it goes in front of an agent.
          </li>
        </ul>
      </section>
    </>
  );
}
