"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Ico } from "@/components/new-look/Parts";
import { NlFailed, NlFig, NlLoading } from "@/components/new-look/admin/ScreenBits";
import { DayBarsNew, HBarsNew, PeriodBarNew, SourceErrorsNew, SourcesNew } from "@/components/new-look/admin/TrackingKitNew";
import { dayLabel, duration, n, pct, when, type TrackingQuery } from "@/components/admin/tracking/kit";
import type { PageRow, PassportItem, Section } from "@/components/admin/tracking/types";

/**
 * One part of the OS, drilled into, in the new look (lib/new-look "admin",
 * 24 Oct 2026): every person and what they did in it, day by day, each
 * figure with the records behind it, and the screens it is made of. The
 * passport carries its funnel; "pages" is every page in the OS.
 *
 * The reading is the page's own (app/(os)/admin/tracking/[section]).
 */

const STAGE: Record<PassportItem["stage"], string> = { sent: "Sent", opened: "Opened", started: "Started", finished: "Finished" };

export default function TrackingSectionNew({
  title,
  blurb,
  back,
  isPages,
  t,
  set,
  periodLabel,
  personName,
  data,
  loading,
  error,
  reload,
}: {
  title: string;
  blurb: string;
  back: string;
  isPages: boolean;
  t: TrackingQuery | null;
  set: (c: Partial<TrackingQuery>) => void;
  periodLabel: string | null;
  personName: string | null;
  data: (Section & { error?: string | null }) | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-tab">
      <div className="nl-adm-block-head">
        <div>
          <h2 className="nl-section-title">{title}</h2>
          <p className="nl-meta nl-adm-measure">{blurb}</p>
        </div>
        <Link href={back} className="nl-link">
          All parts, same period <Ico name="arrow" size={14} />
        </Link>
      </div>
      <div className="nl-adm-after">{t && periodLabel && <PeriodBarNew t={t} set={set} label={periodLabel} personName={personName} />}</div>

      {loading || !t ? (
        <NlLoading what="Reading the figures" />
      ) : error || !data ? (
        <NlFailed error={error ?? "The figures couldn't be read just now."} onRetry={reload} first />
      ) : isPages ? (
        <>
          {data.error ? <NlFailed error={data.error} onRetry={reload} first /> : <PagesView pages={data.pages} />}
          <SourcesNew since={data.since} />
        </>
      ) : (
        <SectionView d={data} t={t} set={set} />
      )}
    </div>
  );
}

/* ── one part ───────────────────────────────────────────────────────────── */

function SectionView({ d, t, set }: { d: Section; t: TrackingQuery; set: (c: Partial<TrackingQuery>) => void }) {
  const opens = d.people.reduce((a, p) => a + p.opens, 0);
  const actions = d.people.reduce((a, p) => a + p.actions, 0);
  const active = d.people.filter((p) => p.opens + p.actions + Object.values(p.counts).reduce((a, v) => a + v, 0) > 0);
  const seconds = d.people.reduce((a, p) => a + p.seconds, 0);
  const timed = d.people.reduce((a, p) => a + p.timed, 0);
  const metrics = d.metrics;

  return (
    <>
      <SourceErrorsNew sources={d.sources} />

      <ul className="nl-adm-figs">
        <NlFig label="People" value={n(active.length)} />
        {d.section.hasPages && <NlFig label="Opens" value={n(opens)} />}
        {d.section.hasPages && <NlFig label="Average stay" value={timed ? duration(seconds / timed) : "-"} />}
        {(d.section.hasPages || actions > 0) && <NlFig label="Done" value={n(actions)} />}
        {metrics.map((m) => (
          <NlFig key={m.key} label={m.label} value={m.error ? "-" : n(m.count)} sub={m.error ?? undefined} />
        ))}
      </ul>

      {d.passport && <PassportView p={d.passport} set={set} opensSince={d.since?.passportOpens ?? null} from={d.days[0]?.day ?? ""} />}

      <section className="nl-adm-block">
        <DayBarsNew days={d.days} title="Day by Day: Opens and Things Done" />
      </section>

      {/* ── by person ── */}
      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <div>
            <h2 className="nl-section-title">By Person</h2>
            <p className="nl-meta">Everybody with an account, and anyone a record names. Choose a name to see only theirs.</p>
          </div>
        </div>
        <div className="nl-adm-tablewrap">
          <table className="nl-adm-table" style={{ minWidth: 420 + metrics.length * 96 }}>
            <thead>
              <tr>
                <th>Person</th>
                <th className="is-num">Days</th>
                {d.section.hasPages && <th className="is-num">Opens</th>}
                {d.section.hasPages && <th className="is-num">Time</th>}
                <th className="is-num">Done</th>
                {metrics.map((m) => (
                  <th key={m.key} className="is-num is-wrap">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.people.map((p) => {
                const total = p.opens + p.actions + Object.values(p.counts).reduce((a, v) => a + v, 0);
                return (
                  <tr key={p.key} className={total ? undefined : "is-quiet"}>
                    <td>
                      {p.key.startsWith("n:") || p.key === "nobody" || p.key.startsWith("id:") ? (
                        <span>{p.name}</span>
                      ) : (
                        <button type="button" onClick={() => set({ person: t.person === p.key ? null : p.key })} className="nl-link">
                          {p.name}
                        </button>
                      )}
                      <span className="nl-meta">{p.team}</span>
                    </td>
                    <td className="is-num">{n(p.days)}</td>
                    {d.section.hasPages && <td className="is-num">{n(p.opens)}</td>}
                    {d.section.hasPages && <td className="is-num">{p.seconds ? duration(p.seconds) : "-"}</td>}
                    <td className="is-num">{n(p.actions)}</td>
                    {metrics.map((m) => (
                      <td key={m.key} className="is-num">
                        {m.error ? "-" : n(p.counts[m.key] ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {d.teams.length > 1 && (
          <ul className="nl-adm-log nl-adm-after">
            {d.teams.map((tm) => (
              <li key={tm.team}>
                <span className="nl-strong">{tm.team}</span>
                <span className="nl-meta">
                  {n(tm.people)} {tm.people === 1 ? "person" : "people"} · {n(tm.opens)} opens · {n(tm.actions)} done · {n(tm.outcomes)} results
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── each figure, down to the records ── */}
      {metrics.length > 0 && (
        <section className="nl-adm-block">
          <div className="nl-adm-block-head">
            <h2 className="nl-section-title">The Records Behind Each Figure</h2>
          </div>
          <ul className="nl-adm-openlist">
            {metrics.map((m) => (
              <MetricRecords key={m.key} m={m} />
            ))}
          </ul>
        </section>
      )}

      {d.section.hasPages && d.pages.length > 0 && (
        <section className="nl-adm-block">
          <div className="nl-adm-block-head">
            <h2 className="nl-section-title">Screens in {d.section.label}</h2>
          </div>
          <PageTable pages={d.pages} />
        </section>
      )}

      <SourcesNew since={d.since} />
    </>
  );
}

function MetricRecords({ m }: { m: Section["metrics"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="nl-adm-opener">
        <span>
          <span className="nl-strong">{m.label}</span>
          <span className="nl-meta nl-adm-blockline">
            {m.source}
            {m.since ? ` · counted since ${dayLabel(m.since)}` : ""}
          </span>
        </span>
        <span>
          <b>{m.error ? "-" : n(m.count)}</b>
          <span className="nl-meta">{m.error ? "" : `${n(m.people)} ${m.people === 1 ? "person" : "people"} · ${open ? "Hide" : "Show"}`}</span>
        </span>
      </button>
      {m.error && (
        <p className="nl-adm-bad nl-meta nl-adm-inset" role="alert">
          {m.error}
        </p>
      )}
      {open && !m.error && (
        <>
          {m.records.length === 0 ? (
            <p className="nl-meta nl-adm-inset">
              None in this period.
            </p>
          ) : (
            <ul className="nl-adm-log">
              {m.records.map((r, i) => (
                <li key={`${r.at}-${i}`}>
                  <span className="min-w-0 flex-1">
                    {r.href ? (
                      <Link href={r.href} className="nl-link">
                        {r.title}
                      </Link>
                    ) : (
                      r.title
                    )}
                  </span>
                  <span className="nl-meta">
                    {r.personName} · {when(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {m.count > m.records.length && (
            <p className="nl-meta nl-adm-inset">
              The newest {n(m.records.length)} of {n(m.count)}. Choose a shorter period or one person to see the rest.
            </p>
          )}
        </>
      )}
    </li>
  );
}

/* ── the passport ───────────────────────────────────────────────────────── */

const LIST_FIRST = 40;

function PassportView({ p, set, opensSince, from }: { p: NonNullable<Section["passport"]>; set: (c: Partial<TrackingQuery>) => void; opensSince: string | null; from: string }) {
  const [stage, setStage] = useState<"all" | PassportItem["stage"]>("all");
  const [all, setAll] = useState(false);
  if (p.error || !p.funnel)
    return (
      <p role="alert" className="nl-adm-flash is-bad">
        {p.error ?? "Passports couldn't be read just now."}
      </p>
    );
  const f = p.funnel;
  const unfinished = f.sent - f.finished;
  const filtered = stage === "all" ? p.list : p.list.filter((x) => x.stage === stage);
  const list = all ? filtered : filtered.slice(0, LIST_FIRST);
  /* Opens are only known from the day they were first recorded. */
  const opensPartial = !opensSince || opensSince.slice(0, 10) > from;
  return (
    <>
      <div className="nl-adm-pcards nl-adm-block">
        <section className="nl-adm-card">
          <h2 className="nl-adm-card-title">The Funnel</h2>
          <p className="nl-meta">
            Passports sent in this period, and how far their tenants got. Overall, <span className="nl-strong">{pct(f.finished, f.sent)}</span> finished.
          </p>
          <div className="nl-adm-after">
            <HBarsNew
              of={f.sent}
              rows={[
                { label: "Sent", value: f.sent },
                { label: "Opened", value: f.opened, note: `${pct(f.opened, f.sent)} of sent` },
                { label: "Started", value: f.started, note: `${pct(f.started, f.opened)} of opened` },
                { label: "Finished", value: f.finished, note: `${pct(f.finished, f.started)} of started` },
              ]}
            />
          </div>
          {opensPartial && (
            <p className="nl-adm-note">
              Opens are counted {opensSince ? `from ${dayLabel(opensSince.slice(0, 10))}` : "from this update on"}. Before that a tenant is only known to have opened it if they filled something in, so Opened is the same as Started for those.
            </p>
          )}
        </section>
        <section className="nl-adm-card">
          <h2 className="nl-adm-card-title">Where Tenants Stop</h2>
          <p className="nl-meta">The {n(unfinished)} not finished, by the first question still unanswered - in the order the passport asks them.</p>
          <div className="nl-adm-after">
            {p.drops.length ? <HBarsNew of={Math.max(...p.drops.map((x) => x.count))} rows={p.drops.map((x) => ({ label: x.at, value: x.count }))} /> : <p className="nl-empty">Everybody sent one finished it.</p>}
          </div>
        </section>
      </div>

      {p.agents.length > 0 && (
        <section className="nl-adm-block">
          <div className="nl-adm-block-head">
            <h2 className="nl-section-title">By Agent</h2>
          </div>
          <div className="nl-adm-tablewrap">
            <table className="nl-adm-table min-w-[520px]">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="is-num">Sent</th>
                  <th className="is-num">Opened</th>
                  <th className="is-num">Started</th>
                  <th className="is-num">Finished</th>
                  <th className="is-num">Rate</th>
                </tr>
              </thead>
              <tbody>
                {p.agents.map((a) => (
                  <tr key={a.key}>
                    <td>
                      <button type="button" onClick={() => set({ person: a.key })} className="nl-link">
                        {a.name}
                      </button>
                    </td>
                    <td className="is-num">{n(a.sent)}</td>
                    <td className="is-num">{n(a.opened)}</td>
                    <td className="is-num">{n(a.started)}</td>
                    <td className="is-num">{n(a.finished)}</td>
                    <td className="is-num">{pct(a.finished, a.sent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <h2 className="nl-section-title">
            Every Passport Sent <span className="nl-count">{filtered.length}</span>
          </h2>
          <div className="nl-toggle" role="radiogroup" aria-label="Stage">
            {(["all", "sent", "opened", "started", "finished"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={stage === s} onClick={() => setStage(s)} className={stage === s ? "is-on" : ""}>
                {s === "all" ? "All" : s === "sent" ? "Not opened" : STAGE[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="nl-adm-tablewrap">
          <table className="nl-adm-table min-w-[720px]">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Agent</th>
                <th>Sent</th>
                <th>Opened</th>
                <th>Where they are</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.token}>
                  <td>
                    {x.name}
                    <span className="nl-meta">{x.email}</span>
                  </td>
                  <td>{x.agent}</td>
                  <td className="nl-adm-muted">{when(x.sentAt)}</td>
                  <td className="nl-adm-muted">{x.openedAt ? `${when(x.openedAt)}${x.opens > 1 ? ` · ${x.opens} times` : ""}` : x.stage === "sent" ? "-" : "Before opens were counted"}</td>
                  <td>
                    {x.stage === "finished" ? (
                      <Badge tone="good" bare>
                        Finished {when(x.finishedAt!)}
                      </Badge>
                    ) : (
                      <span className={x.stage === "sent" ? "nl-adm-muted" : undefined}>
                        {x.stoppedAt}
                        {x.stage === "started" && <span className="nl-meta">last saved {when(x.lastActivity)}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr className="is-quiet">
                  <td colSpan={5}>None.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > LIST_FIRST && (
          <p className="nl-adm-after">
            <button type="button" onClick={() => setAll((v) => !v)} className="nl-btn nl-btn--secondary nl-btn--sm">
              {all ? "Show Fewer" : `Show All ${n(filtered.length)}`}
            </button>
          </p>
        )}
      </section>
    </>
  );
}

/* ── pages ──────────────────────────────────────────────────────────────── */

function PageTable({ pages }: { pages: PageRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="nl-adm-tablewrap">
      <table className="nl-adm-table min-w-[560px]">
        <thead>
          <tr>
            <th>Page</th>
            <th className="is-num">Views</th>
            <th className="is-num">People</th>
            <th className="is-num">Average stay</th>
            <th className="is-num">Total time</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <PageLine key={p.page} p={p} open={open === p.page} onToggle={() => setOpen(open === p.page ? null : p.page)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageLine({ p, open, onToggle }: { p: PageRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr>
        <td>
          <button type="button" onClick={onToggle} aria-expanded={open} className="nl-link">
            {p.label}
          </button>
          <span className="nl-mono nl-adm-path">
            {p.page}
          </span>
        </td>
        <td className="is-num">{n(p.views)}</td>
        <td className="is-num">{n(p.people)}</td>
        <td className="is-num">{p.timed ? duration(p.seconds / p.timed) : "-"}</td>
        <td className="is-num">{p.seconds ? duration(p.seconds) : "-"}</td>
      </tr>
      {open &&
        p.byPerson.map((w) => (
          <tr key={w.key} className="is-sub">
            <td>{w.name}</td>
            <td className="is-num">{n(w.views)}</td>
            <td />
            <td className="is-num">{w.timed ? duration(w.seconds / w.timed) : "-"}</td>
            <td />
          </tr>
        ))}
    </>
  );
}

function TopList({ title, rows, empty }: { title: string; rows: Array<{ key: string; label: string; value: string }>; empty: string }) {
  return (
    <section className="nl-adm-card">
      <h3 className="nl-block-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="nl-meta nl-adm-after">{empty}</p>
      ) : (
        <ul className="nl-adm-part-top">
          {rows.map((r) => (
            <li key={r.key}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PagesView({ pages }: { pages: PageRow[] }) {
  const [sort, setSort] = useState<"views" | "avg" | "time">("views");
  const visited = pages.filter((p) => p.views > 0);
  const least = [...visited].sort((a, b) => a.views - b.views).slice(0, 5);
  const timed = pages.filter((p) => p.timed >= 3).sort((a, b) => b.seconds / b.timed - a.seconds / a.timed);
  const sorted = [...pages].sort((a, b) =>
    sort === "views" ? b.views - a.views : sort === "time" ? b.seconds - a.seconds : (b.timed ? b.seconds / b.timed : 0) - (a.timed ? a.seconds / a.timed : 0)
  );
  return (
    <>
      <div className="nl-adm-parts">
        <TopList title="Most Visited" rows={visited.slice(0, 5).map((p) => ({ key: p.page, label: p.label, value: n(p.views) }))} empty="Nothing opened this period." />
        <TopList title="Least Visited" rows={least.map((p) => ({ key: p.page, label: p.label, value: n(p.views) }))} empty="Nothing opened this period." />
        <TopList
          title="Longest Average Stay"
          rows={timed.slice(0, 5).map((p) => ({ key: p.page, label: p.label, value: duration(p.seconds / p.timed) }))}
          empty="Not enough visits timed yet. Time on a page is counted from this update on."
        />
      </div>
      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <div>
            <h2 className="nl-section-title">Every Page</h2>
            <p className="nl-meta">A page opened on different records counts as one page. Choose a page for who opened it.</p>
          </div>
          <div className="nl-toggle" role="radiogroup" aria-label="Sort">
            {(
              [
                ["views", "Most viewed"],
                ["avg", "Longest stay"],
                ["time", "Most time"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)} className={sort === k ? "is-on" : ""}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <PageTable pages={sorted} />
      </section>
    </>
  );
}
