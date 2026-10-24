"use client";

import Link from "next/link";
import { use, useState } from "react";
import PageHeader from "@/components/PageHeader";
import type { PageRow, PassportItem, Section } from "@/components/admin/tracking/types";
import {
  DayBars,
  Failed,
  HBars,
  Loading,
  PeriodBar,
  SourceErrors,
  Sources,
  card,
  dayLabel,
  duration,
  eyebrow,
  n,
  pct,
  queryString,
  useTracking,
  useTrackingQuery,
  when,
  type TrackingQuery,
} from "@/components/admin/tracking/kit";
import { SECTION_BY_KEY, type SectionKey } from "@/lib/tracking/sections";
import { useNewLook } from "@/lib/use-new-look";
import TrackingSectionNew from "@/components/new-look/admin/TrackingSectionNew";
import { LookLoading } from "@/components/new-look/admin/ScreenBits";

/**
 * One part of the OS, drilled into (Admin > Tracking, 15 Oct 2026): every
 * person and what they did in it, day by day, each figure with the records
 * behind it, and the screens it is made of with the time spent on them.
 *
 * Two parts have more: the tenant passport carries its funnel and where
 * tenants stop, and "pages" is every page in the OS rather than one part.
 */

const STAGE: Record<PassportItem["stage"], string> = { sent: "Sent", opened: "Opened", started: "Started", finished: "Finished" };

export default function TrackingSection({ params }: { params: Promise<{ section: string }> }) {
  const { section: key } = use(params);
  const { t, set, period } = useTrackingQuery();
  const isPages = key === "pages";
  const def = isPages ? null : SECTION_BY_KEY.get(key as SectionKey);
  const { data, error, loading, reload } = useTracking<Section & { pages: PageRow[]; error?: string | null }>(t, `&section=${encodeURIComponent(key)}`);
  const title = isPages ? "Every Page" : def?.label ?? "Tracking";
  const back = t ? `/admin/tracking?${queryString(t, { person: t.person })}` : "/admin/tracking";
  const personName = t?.person ? data?.people?.find((p) => p.key === t.person)?.name ?? null : null;
  /* The new look (lib/new-look "admin", 24 Oct 2026). Null until known. */
  const look = useNewLook("admin");

  if (look === null) return <LookLoading what="Reading the figures" />;
  if (look && !isPages && !def) {
    return (
      <div data-look="new" className="nl-page nl-adm nl-adm-p-tab">
        <p className="nl-empty">There&apos;s no such part of the OS.</p>
        <Link href="/admin/tracking" className="nl-link">
          Back to Tracking
        </Link>
      </div>
    );
  }
  if (look) {
    return (
      <TrackingSectionNew
        title={title}
        blurb={isPages ? "Who is on which page, how often, the most and least visited, and where people stay longest." : def!.blurb}
        back={back}
        isPages={isPages}
        t={t}
        set={set}
        periodLabel={period?.label ?? null}
        personName={personName}
        data={data}
        loading={loading}
        error={error}
        reload={reload}
      />
    );
  }

  if (!isPages && !def) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-muted">There&apos;s no such part of the OS.</p>
        <Link href="/admin/tracking" className="mt-2 inline-block text-[12px] underline">Back to Tracking</Link>
      </div>
    );
  }

  return (
    <>
      <Link href={back} className="text-[12px] text-muted hover:text-ink">← Tracking</Link>
      <PageHeader
        illustration="/illustrations/people/reading-time.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title={title}
        blurb={isPages ? "Who is on which page, how often, the most and least visited, and where people stay longest." : def!.blurb}
      />
      {t && period && <PeriodBar t={t} set={set} label={period.label} personName={personName} />}

      {loading || !t ? (
        <Loading />
      ) : error || !data ? (
        <Failed error={error ?? "The figures couldn't be read just now."} onRetry={reload} />
      ) : isPages ? (
        <>
          {data.error ? <Failed error={data.error} onRetry={reload} /> : <PagesView pages={data.pages} />}
          <Sources since={data.since} />
        </>
      ) : (
        <SectionView d={data} t={t} set={set} />
      )}
    </>
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
      <SourceErrors sources={d.sources} />

      <div className="fade-up mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["People", n(active.length)],
          ...(d.section.hasPages ? [["Opens", n(opens)], ["Average stay", timed ? duration(seconds / timed) : "-"]] : []),
          ...(d.section.hasPages || actions ? [["Done", n(actions)]] : []),
          ...metrics.map((m) => [m.label, m.error ? "-" : n(m.count)]),
        ].map(([k, v]) => (
          <div key={k} className={`${card} p-4`}>
            <p className={eyebrow}>{k}</p>
            <p className="figures mt-1.5 text-[22px] leading-none">{v}</p>
          </div>
        ))}
      </div>

      {d.passport && <PassportView p={d.passport} set={set} opensSince={d.since?.passportOpens ?? null} from={d.days[0]?.day ?? ""} />}

      <section className={`${card} fade-up mt-4 p-5`}>
        <DayBars days={d.days} title="Day by Day: Opens and Things Done" />
      </section>

      {/* ── by person ── */}
      <section className={`${card} fade-up mt-4 p-5`}>
        <h2 className="hand text-[17px] leading-tight">By Person</h2>
        <p className="mt-1 text-[11.5px] text-muted">Everybody with an account, and anyone a record names. Choose a name to see only theirs.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]" style={{ minWidth: 420 + metrics.length * 92 }}>
            <thead>
              <tr className="border-b border-line/60 align-bottom text-[10.5px] uppercase tracking-[0.1em] text-muted">
                <th className="py-2 pr-3 font-semibold">Person</th>
                <th className="py-2 pr-3 text-right font-semibold">Days</th>
                {d.section.hasPages && <th className="py-2 pr-3 text-right font-semibold">Opens</th>}
                {d.section.hasPages && <th className="py-2 pr-3 text-right font-semibold">Time</th>}
                <th className="py-2 pr-3 text-right font-semibold">Done</th>
                {metrics.map((m) => (
                  <th key={m.key} className="max-w-[92px] py-2 pr-3 text-right font-semibold normal-case tracking-normal">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.people.map((p) => {
                const total = p.opens + p.actions + Object.values(p.counts).reduce((a, v) => a + v, 0);
                return (
                  <tr key={p.key} className={`border-b border-line/40 last:border-0 ${total ? "" : "text-muted"}`}>
                    <td className="py-2 pr-3">
                      {p.key.startsWith("n:") || p.key === "nobody" || p.key.startsWith("id:") ? (
                        <span>{p.name}</span>
                      ) : (
                        <button type="button" onClick={() => set({ person: t.person === p.key ? null : p.key })} className="text-left underline decoration-line hover:decoration-ink">
                          {p.name}
                        </button>
                      )}
                      <span className="block text-[10.5px] text-muted">{p.team}</span>
                    </td>
                    <td className="figures py-2 pr-3 text-right">{n(p.days)}</td>
                    {d.section.hasPages && <td className="figures py-2 pr-3 text-right">{n(p.opens)}</td>}
                    {d.section.hasPages && <td className="figures py-2 pr-3 text-right">{p.seconds ? duration(p.seconds) : "-"}</td>}
                    <td className="figures py-2 pr-3 text-right">{n(p.actions)}</td>
                    {metrics.map((m) => (
                      <td key={m.key} className="figures py-2 pr-3 text-right">{m.error ? "-" : n(p.counts[m.key] ?? 0)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {d.teams.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line/50 pt-3 text-[11.5px]">
            {d.teams.map((tm) => (
              <span key={tm.team} className="rounded-full border border-line/70 px-3 py-1">
                <span className="font-semibold">{tm.team}</span>
                <span className="text-muted"> · {n(tm.people)} {tm.people === 1 ? "person" : "people"} · {n(tm.opens)} opens · {n(tm.actions)} done · {n(tm.outcomes)} results</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── each figure, down to the records ── */}
      {metrics.length > 0 && (
        <section className="fade-up mt-4">
          <h2 className="hand px-1 text-[17px] leading-tight">The Records Behind Each Figure</h2>
          <div className="mt-3 space-y-3">
            {metrics.map((m) => (
              <MetricRecords key={m.key} m={m} />
            ))}
          </div>
        </section>
      )}

      {d.section.hasPages && d.pages.length > 0 && (
        <section className={`${card} fade-up mt-4 p-5`}>
          <h2 className="hand text-[17px] leading-tight">Screens in {d.section.label}</h2>
          <PageTable pages={d.pages} />
        </section>
      )}

      <Sources since={d.since} />
    </>
  );
}

function MetricRecords({ m }: { m: Section["metrics"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${card} p-4`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold">{m.label}</span>
          <span className="mt-0.5 block text-[11px] text-muted">
            {m.source}
            {m.since ? ` · counted since ${dayLabel(m.since)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="figures block text-[20px] leading-none">{m.error ? "-" : n(m.count)}</span>
          <span className="text-[10.5px] text-muted">{m.error ? "" : `${n(m.people)} ${m.people === 1 ? "person" : "people"} · ${open ? "Hide" : "Show"}`}</span>
        </span>
      </button>
      {m.error && <p className="mt-2 text-[12px] text-accent-dark" role="alert">{m.error}</p>}
      {open && !m.error && (
        <div className="mt-3 border-t border-line/50 pt-2">
          {m.records.length === 0 ? (
            <p className="py-1 text-[12px] text-muted">None in this period.</p>
          ) : (
            <ul className="divide-y divide-line/40">
              {m.records.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-[12px]">
                  <span className="min-w-0 flex-1">
                    {r.href ? (
                      <Link href={r.href} className="underline decoration-line hover:decoration-ink">{r.title}</Link>
                    ) : (
                      r.title
                    )}
                  </span>
                  <span className="shrink-0 text-muted">
                    {r.personName} · {when(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {m.count > m.records.length && <p className="pt-2 text-[11px] text-muted">The newest {n(m.records.length)} of {n(m.count)}. Choose a shorter period or one person to see the rest.</p>}
        </div>
      )}
    </div>
  );
}

/* ── the passport ───────────────────────────────────────────────────────── */

const LIST_FIRST = 40;

function PassportView({ p, set, opensSince, from }: { p: NonNullable<Section["passport"]>; set: (c: Partial<TrackingQuery>) => void; opensSince: string | null; from: string }) {
  const [stage, setStage] = useState<"all" | PassportItem["stage"]>("all");
  const [all, setAll] = useState(false);
  if (p.error || !p.funnel) return <p role="alert" className="mt-4 text-[12.5px] text-accent-dark">{p.error ?? "Passports couldn't be read just now."}</p>;
  const f = p.funnel;
  const unfinished = f.sent - f.finished;
  const filtered = stage === "all" ? p.list : p.list.filter((x) => x.stage === stage);
  const list = all ? filtered : filtered.slice(0, LIST_FIRST);
  /* Opens are only known from the day they were first recorded. Before it, a
     tenant who opened the link and typed nothing shows as Not opened. */
  const opensPartial = !opensSince || opensSince.slice(0, 10) > from;
  return (
    <>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={`${card} fade-up p-5`}>
          <h2 className="hand text-[17px] leading-tight">The Funnel</h2>
          <p className="mt-1 text-[11.5px] text-muted">
            Passports sent in this period, and how far their tenants got. Overall, <span className="font-semibold text-ink">{pct(f.finished, f.sent)}</span> finished.
          </p>
          <div className="mt-4">
            <HBars
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
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Opens are counted {opensSince ? `from ${dayLabel(opensSince.slice(0, 10))}` : "from this update on"}. Before that a tenant is only known to have opened it if they filled something in, so Opened is the same as Started for those.
            </p>
          )}
        </section>
        <section className={`${card} fade-up p-5`}>
          <h2 className="hand text-[17px] leading-tight">Where Tenants Stop</h2>
          <p className="mt-1 text-[11.5px] text-muted">
            The {n(unfinished)} not finished, by the first question still unanswered - in the order the passport asks them.
          </p>
          <div className="mt-4">
            {p.drops.length ? <HBars of={Math.max(...p.drops.map((x) => x.count))} rows={p.drops.map((x) => ({ label: x.at, value: x.count }))} /> : <p className="text-[12px] text-muted">Everybody sent one finished it.</p>}
          </div>
        </section>
      </div>

      {p.agents.length > 0 && (
        <section className={`${card} fade-up mt-4 p-5`}>
          <h2 className="hand text-[17px] leading-tight">By Agent</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line/60 text-[10.5px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 pr-3 font-semibold">Agent</th>
                  <th className="py-2 pr-3 text-right font-semibold">Sent</th>
                  <th className="py-2 pr-3 text-right font-semibold">Opened</th>
                  <th className="py-2 pr-3 text-right font-semibold">Started</th>
                  <th className="py-2 pr-3 text-right font-semibold">Finished</th>
                  <th className="py-2 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {p.agents.map((a) => (
                  <tr key={a.key} className="border-b border-line/40 last:border-0">
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => set({ person: a.key })} className="underline decoration-line hover:decoration-ink">{a.name}</button>
                    </td>
                    <td className="figures py-2 pr-3 text-right">{n(a.sent)}</td>
                    <td className="figures py-2 pr-3 text-right">{n(a.opened)}</td>
                    <td className="figures py-2 pr-3 text-right">{n(a.started)}</td>
                    <td className="figures py-2 pr-3 text-right">{n(a.finished)}</td>
                    <td className="figures py-2 text-right">{pct(a.finished, a.sent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={`${card} fade-up mt-4 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="hand text-[17px] leading-tight">Every Passport Sent</h2>
          <div role="radiogroup" aria-label="Stage" className="flex overflow-hidden rounded-lg border border-line/80">
            {(["all", "sent", "opened", "started", "finished"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={stage === s}
                onClick={() => setStage(s)}
                className={`border-l border-line/80 px-2.5 py-1 text-[11.5px] first:border-l-0 ${stage === s ? "bg-ink text-page" : "bg-white text-muted hover:text-ink"}`}
              >
                {s === "all" ? "All" : s === "sent" ? "Not opened" : STAGE[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-line/60 text-[10.5px] uppercase tracking-[0.12em] text-muted">
                <th className="py-2 pr-3 font-semibold">Tenant</th>
                <th className="py-2 pr-3 font-semibold">Agent</th>
                <th className="py-2 pr-3 font-semibold">Sent</th>
                <th className="py-2 pr-3 font-semibold">Opened</th>
                <th className="py-2 pr-3 font-semibold">Where they are</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.token} className="border-b border-line/40 last:border-0">
                  <td className="py-2 pr-3">
                    {x.name}
                    <span className="block text-[10.5px] text-muted">{x.email}</span>
                  </td>
                  <td className="py-2 pr-3">{x.agent}</td>
                  <td className="py-2 pr-3 text-muted">{when(x.sentAt)}</td>
                  <td className="py-2 pr-3 text-muted">{x.openedAt ? `${when(x.openedAt)}${x.opens > 1 ? ` · ${x.opens} times` : ""}` : x.stage === "sent" ? "-" : "Before opens were counted"}</td>
                  <td className="py-2 pr-3">
                    {x.stage === "finished" ? (
                      <span>Finished {when(x.finishedAt!)}</span>
                    ) : (
                      <span className={x.stage === "sent" ? "text-muted" : ""}>
                        {x.stoppedAt}
                        {x.stage === "started" && <span className="block text-[10.5px] text-muted">last saved {when(x.lastActivity)}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted">None.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > LIST_FIRST && (
          <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] hover:border-ink/40">
            {all ? "Show fewer" : `Show all ${n(filtered.length)}`}
          </button>
        )}
      </section>
    </>
  );
}

/* ── pages ──────────────────────────────────────────────────────────────── */

function PageTable({ pages }: { pages: PageRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-line/60 text-[10.5px] uppercase tracking-[0.12em] text-muted">
            <th className="py-2 pr-3 font-semibold">Page</th>
            <th className="py-2 pr-3 text-right font-semibold">Views</th>
            <th className="py-2 pr-3 text-right font-semibold">People</th>
            <th className="py-2 pr-3 text-right font-semibold">Average stay</th>
            <th className="py-2 text-right font-semibold">Total time</th>
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
      <tr className="border-b border-line/40">
        <td className="py-2 pr-3">
          <button type="button" onClick={onToggle} aria-expanded={open} className="text-left underline decoration-line hover:decoration-ink">
            {p.label}
          </button>
          <span className="block font-mono text-[10px] text-muted">{p.page}</span>
        </td>
        <td className="figures py-2 pr-3 text-right">{n(p.views)}</td>
        <td className="figures py-2 pr-3 text-right">{n(p.people)}</td>
        <td className="figures py-2 pr-3 text-right">{p.timed ? duration(p.seconds / p.timed) : "-"}</td>
        <td className="figures py-2 text-right">{p.seconds ? duration(p.seconds) : "-"}</td>
      </tr>
      {open && (
        <tr className="border-b border-line/40 bg-accent-soft/20">
          <td colSpan={5} className="px-3 py-2">
            <ul className="space-y-0.5 text-[11.5px]">
              {p.byPerson.map((w) => (
                <li key={w.key} className="flex justify-between gap-3">
                  <span>{w.name}</span>
                  <span className="text-muted">
                    <span className="figures text-ink">{n(w.views)}</span> views{w.timed ? ` · ${duration(w.seconds / w.timed)} average` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
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
      <div className="fade-up mt-6 grid gap-3 md:grid-cols-3">
        <div className={`${card} p-4`}>
          <p className={eyebrow}>Most Visited</p>
          <ul className="mt-2 space-y-1 text-[12px]">
            {visited.slice(0, 5).map((p) => (
              <li key={p.page} className="flex justify-between gap-2"><span className="truncate">{p.label}</span><span className="figures shrink-0">{n(p.views)}</span></li>
            ))}
            {!visited.length && <li className="text-muted">Nothing opened this period.</li>}
          </ul>
        </div>
        <div className={`${card} p-4`}>
          <p className={eyebrow}>Least Visited</p>
          <ul className="mt-2 space-y-1 text-[12px]">
            {least.map((p) => (
              <li key={p.page} className="flex justify-between gap-2"><span className="truncate">{p.label}</span><span className="figures shrink-0">{n(p.views)}</span></li>
            ))}
            {!least.length && <li className="text-muted">Nothing opened this period.</li>}
          </ul>
        </div>
        <div className={`${card} p-4`}>
          <p className={eyebrow}>Longest Average Stay</p>
          <ul className="mt-2 space-y-1 text-[12px]">
            {timed.slice(0, 5).map((p) => (
              <li key={p.page} className="flex justify-between gap-2"><span className="truncate">{p.label}</span><span className="figures shrink-0">{duration(p.seconds / p.timed)}</span></li>
            ))}
            {!timed.length && <li className="text-muted">Not enough visits timed yet. Time on a page is counted from this update on.</li>}
          </ul>
        </div>
      </div>
      <section className={`${card} fade-up mt-4 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="hand text-[17px] leading-tight">Every Page</h2>
          <div role="radiogroup" aria-label="Sort" className="flex overflow-hidden rounded-lg border border-line/80">
            {(
              [
                ["views", "Most viewed"],
                ["avg", "Longest stay"],
                ["time", "Most time"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={sort === k}
                onClick={() => setSort(k)}
                className={`border-l border-line/80 px-2.5 py-1 text-[11.5px] first:border-l-0 ${sort === k ? "bg-ink text-page" : "bg-white text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">A page opened on different records counts as one page. Choose a page for who opened it.</p>
        <PageTable pages={sorted} />
      </section>
    </>
  );
}
