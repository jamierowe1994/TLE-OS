"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { openGuide } from "@/lib/guide-sheet";
import { fetchMe } from "@/lib/me";
import { can } from "@/lib/roles";
import { useNewLook } from "@/lib/use-new-look";
import { areaForPage, canSee, type AreaAccess } from "@/lib/area-map";
import { Badge, Ico } from "@/components/new-look/Parts";
import { Loading } from "@/components/new-look/admin/content-bits";
import type { HelpData } from "@/components/new-look/help/HelpLook";

/**
 * Admin > Content > Guides (24 Oct 2026): the agents' Help shelf, checked
 * from inside Admin. The same guides as /guides (components/guides/
 * GuidesShelf): with the Admin new look off it draws that shelf exactly; on,
 * it draws the shelf as Admin's hairline rows with each guide's state.
 *
 * see:reports, as the Guides entry always needed on the Admin rail. /guides
 * itself stays open to every agent: it is their Help.
 */

export default function GuidesAdmin({ data, old }: { data: HelpData; old: ReactNode }) {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const look = useNewLook("admin");
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => !gone && setRole(j?.role ?? null))
      .catch(() => !gone && setRole(null));
    return () => {
      gone = true;
    };
  }, []);

  if (role === undefined || look === null) return <Loading label="Opening Guides…" page />;
  if (!can(role, "see:reports")) {
    return (
      <div data-look={look ? "new" : undefined} className={look ? "nl-page nl-adm nl-adm-screen" : "py-16 text-center"}>
        <p className={look ? "nl-empty" : "text-[13px] text-muted"}>
          Guides are checked here by the people who write them. The shelf every agent reads is at{" "}
          <Link href="/guides" className={look ? "nl-link" : "underline"}>
            Help
          </Link>
          .
        </p>
      </div>
    );
  }
  if (!look) return <>{old}</>;
  return <GuidesNew data={data} />;
}

function GuidesNew({ data }: { data: HelpData }) {
  /* The back office walkthroughs open in the Showroom, so they show only to
     somebody the Showroom is open to, asked the way the sidebar asks. */
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

  const written = data.shelves.flatMap((s) => s.items);
  const ready = written.filter((g) => g.ready).length;

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
      <div className="nl-adm-bar">
        <p className="nl-meta">
          The shelf every agent sees under Help, and in Steve&apos;s Guides tab. {data.howTo.length} step-by-step guides, {ready} of {written.length} written guides ready.
        </p>
        <div className="nl-adm-bar-acts">
          <Link href="/guides" className="nl-btn nl-btn--secondary nl-btn--sm">
            Open Help as Agents See It
          </Link>
          <a href={data.tourUrl} target="_blank" rel="noopener noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
            The Tour
          </a>
        </div>
      </div>

      <div className="nl-adm-stack">
        <section className="nl-adm-card">
          <div className="nl-adm-card-head">
            <h2 className="nl-adm-h">
              How It Works <span className="nl-count">{data.howTo.length}</span>
            </h2>
            <span className="nl-meta">Opens over the page you&apos;re on</span>
          </div>
          <ul className="nl-adm-rows is-ruled">
            {data.howTo.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => openGuide(g.id)} className="nl-adm-open nl-adm-row-main">
                  <span className="nl-strong block">{g.title}</span>
                  <span className="nl-meta block nl-adm-clamp">{g.blurb}</span>
                </button>
                <div className="nl-adm-row-acts">
                  <span className="nl-mono">
                    {g.steps} steps · {g.minutes} min
                  </span>
                  <button type="button" onClick={() => openGuide(g.id)} className="nl-btn nl-btn--quiet nl-btn--sm">
                    Open <Ico name="arrow" size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {showroom === null ? (
          <Loading label="Checking the Showroom…" />
        ) : (
          showroom &&
          data.backOffice.length > 0 && (
            <section className="nl-adm-card">
              <div className="nl-adm-card-head">
                <h2 className="nl-adm-h">
                  The Back Office, Step by Step <span className="nl-count">{data.backOffice.length}</span>
                </h2>
                <span className="nl-meta">A guide and a live demo of each, in the Showroom</span>
              </div>
              <ul className="nl-adm-rows is-ruled">
                {data.backOffice.map((j) => (
                  <li key={j.id}>
                    <Link href={`/showroom?side=backoffice&step=${j.id}`} className="nl-adm-open nl-adm-row-main">
                      <span className="nl-strong block">{j.title}</span>
                      <span className="nl-meta block nl-adm-clamp">{j.lead}</span>
                    </Link>
                    <span className="nl-mono">{j.scenes} scenes</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        {data.shelves.map((s) => (
          <section key={s.name} className="nl-adm-card">
            <div className="nl-adm-card-head">
              <h2 className="nl-adm-h">
                {s.name} <span className="nl-count">{s.items.length}</span>
              </h2>
              <span className="nl-meta">{s.items.filter((g) => g.ready).length} ready</span>
            </div>
            <ul className="nl-adm-rows is-ruled">
              {s.items.map((g) => (
                <li key={g.slug}>
                  {g.ready ? (
                    <Link href={`/guides/${g.slug}`} className="nl-adm-open nl-adm-row-main">
                      <span className="nl-strong block">{g.title}</span>
                      <span className="nl-meta block nl-adm-clamp">{g.blurb}</span>
                    </Link>
                  ) : (
                    <div className="nl-adm-row-main">
                      <span className="nl-strong block nl-adm-muted">{g.title}</span>
                      <span className="nl-meta block nl-adm-clamp">{g.blurb}</span>
                    </div>
                  )}
                  <div className="nl-adm-row-acts">
                    <span className="nl-mono">{g.minutes} min read</span>
                    {g.ready ? <Badge tone="good" bare>Ready</Badge> : <Badge tone="warning" bare>Being written</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
