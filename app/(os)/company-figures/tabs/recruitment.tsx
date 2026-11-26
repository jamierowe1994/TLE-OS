"use client";

// Company Figures > Recruitment (James, 26 Nov 2026): the hiring figures,
// counted from Teamtailor.
//
// Month-scoped through /api/business/recruitment, so it rolls over on its own.
// Applications, offers, hires and rejections count in the month they happened;
// the pipeline and the open vacancies are as of the last read. Counts only: no
// candidate's name or details ever reach this screen (lib/business/recruitment-figures).
//
// Behind its own switch (lib/new-look "recruitment"). A read that fails shows
// the error, never an old figure.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { RecruitmentFigures, RecruitmentResult, StageKind } from "@/lib/business/recruitment-figures"; // type-only
import { isLiveMonth, monthLabel, previousMonth } from "@/lib/business/format";
import { useNewLook } from "@/lib/use-new-look";

const n = (v: number) => v.toLocaleString("en-GB");
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" });
/** "+17 on October", "3 fewer than October", "the same as October". */
const against = (now: number, before: number, m: string) =>
  now === before ? `the same as ${monthName(m)}` : now > before ? `${n(now - before)} more than ${monthName(m)}` : `${n(before - now)} fewer than ${monthName(m)}`;
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

const STAGE_WORDS: Record<StageKind, string> = {
  inbox: "New, Not Yet Reviewed",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  process: "In Process",
};

const STATUS_WORDS: Record<string, string> = {
  published: "Live",
  unlisted: "Live, Link Only",
  completed: "Filled",
  archived: "Archived",
  expired: "Advert ended",
  draft: "Draft",
  scheduled: "Scheduled",
};

type Api = { ok: boolean; error?: string; month?: string } & Partial<RecruitmentResult> & { figures?: RecruitmentFigures; refreshing?: boolean; lastGoodAt?: string | null };

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="stat-value stat-value--big mt-2">{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

/** A labelled bar: the name, the count, and a line as long as its share of the largest. */
function Bar({ label, value, max, tag }: { label: string; value: number; max: number; tag?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5">
      <div className="min-w-0 truncate text-[12.5px] text-ink">
        {label}
        {tag ? <span className="ml-2 text-[11px] text-muted">{tag}</span> : null}
      </div>
      <div className="tnum text-[12.5px] font-semibold text-ink">{n(value)}</div>
      <div className="col-span-2 h-1.5 bg-line/60">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${max ? Math.max(value ? 2 : 0, Math.round((value / max) * 100)) : 0}%` }} />
      </div>
    </div>
  );
}

function Busy({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-3 p-5 text-[13px] text-muted" aria-busy="true">
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

const scopeValue = (s: RecruitmentFigures["scope"]) => (s.kind === "all" ? "all" : `${s.kind}:${s.name}`);

export default function RecruitmentTab({ month }: { month: string; seed?: SeedData | null }) {
  const on = useNewLook("recruitment");
  const [res, setRes] = useState<Api | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (quiet: boolean) => {
      if (!quiet) {
        setRes(null);
        setFailed(null);
      }
      return fetch(`/api/business/recruitment?month=${encodeURIComponent(month)}`, { cache: "no-store" })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as Api | null;
          if (r.ok && j?.ok) {
            setRes(j);
            setFailed(null);
          } else setFailed(j?.error ?? `The figures didn't load (${r.status}).`);
        })
        .catch(() => setFailed("The figures didn't load."));
    },
    [month]
  );

  useEffect(() => {
    if (on !== true) return;
    void load(false);
  }, [on, load]);

  /* While Teamtailor is being read, ask again every few seconds. */
  const waiting = res?.state === "loading" || (res?.state === "ready" && res.refreshing === true);
  useEffect(() => {
    if (on !== true || !waiting) return;
    timer.current = setTimeout(() => void load(true), 5000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [on, waiting, res, load]);

  const post = async (body: unknown) => {
    setSaving(true);
    try {
      const r = await fetch("/api/business/recruitment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) setFailed(j?.error ?? "That did not save.");
      else await load(true);
    } catch {
      setFailed("That did not save.");
    } finally {
      setSaving(false);
    }
  };

  if (on === null) return <Busy>Opening Recruitment.</Busy>;
  if (on === false) {
    return <div className="card p-5 text-[13px] text-muted">Recruitment figures are not switched on for you yet.</div>;
  }

  if (failed && !res) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
        <span className="font-semibold">The recruitment figures couldn&rsquo;t be read.</span> {failed}
      </div>
    );
  }
  if (!res) return <Busy>Reading {monthLabel(month)}&rsquo;s recruitment figures.</Busy>;

  if (res.state === "not-connected") {
    return (
      <div className="card p-5 text-[13px] text-ink">
        <h2 className="text-[15px] text-ink">Teamtailor Is Not Connected Yet</h2>
        <p className="mt-2 max-w-[62ch] text-muted">
          These figures are counted from Teamtailor, and the OS has not been given a key to read it. Once a read-only key is in place this tab fills in on its own - there is nothing to switch on here.
        </p>
      </div>
    );
  }

  if (res.state === "loading") {
    return <Busy>Reading Teamtailor. The first read walks every application from the last thirteen months, so it can take a few minutes. This page fills in when it is done.</Busy>;
  }

  if (res.state === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          <span className="font-semibold">Teamtailor couldn&rsquo;t be read, so no figures are shown.</span> {res.error}
          {res.lastGoodAt ? <span> The last good read was {stamp(res.lastGoodAt)}.</span> : null}
        </div>
        <button type="button" className="btn-press rounded-lg border border-line bg-card px-3 text-[13px] font-medium text-ink transition hover:border-ink disabled:opacity-40 h-9" disabled={saving} onClick={() => void post({ refresh: true })}>
          Try Again
        </button>
      </div>
    );
  }

  const f = res.figures;
  if (!f) return <Busy>Reading {monthLabel(month)}&rsquo;s recruitment figures.</Busy>;
  const t = f.tiles;
  const tooOld = month < f.from;
  const pipeMax = Math.max(1, ...f.pipeline.map((p) => p.n));
  const srcMax = Math.max(1, ...f.sources.map((s) => s.n));
  const whyMax = Math.max(1, ...f.reasons.map((r) => r.n));
  const trendMax = Math.max(1, ...f.trend.map((m) => m.applied));
  const manyParts = f.groups.divisions.length + f.groups.departments.length + f.groups.locations.length > 1;
  const scopeWords = f.scope.kind === "all" ? "the whole Teamtailor account" : f.scope.name;
  const live = isLiveMonth(month);
  const prev = previousMonth(month);
  const period = live ? `${monthName(month)} so far` : `In ${monthName(month)}`;
  const inPipeline = f.pipeline.reduce((a, p) => a + p.n, 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------ what is counted ------------------------------ */}
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-[15px] text-ink">{monthLabel(month)} in Recruitment</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Counted from Teamtailor{f.company ? ` (${f.company})` : ""} · read {stamp(f.asOf)} ·{" "}
            {res.refreshing ? (
              "reading again now"
            ) : (
              <button type="button" className="underline underline-offset-2 hover:text-ink disabled:opacity-40" disabled={saving} onClick={() => void post({ refresh: true })}>
                Read again
              </button>
            )}
          </p>
        </div>
        <label className="block text-[11px] text-muted">
          Show figures for
          <select
            className="mt-1 block h-9 w-full max-w-[300px] rounded-none border border-line bg-white px-2 text-[13px] text-ink"
            value={scopeValue(f.scope)}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value;
              const i = v.indexOf(":");
              void post({ scope: v === "all" ? { kind: "all" } : { kind: v.slice(0, i), name: v.slice(i + 1) } });
            }}
          >
            <option value="all">The whole Teamtailor account</option>
            {(
              [
                ["division", "Divisions", f.groups.divisions],
                ["department", "Departments", f.groups.departments],
                ["location", "Locations", f.groups.locations],
              ] as const
            ).map(([kind, label, list]) =>
              list.length ? (
                <optgroup key={kind} label={label}>
                  {list.map((g) => (
                    <option key={`${kind}:${g.name}`} value={`${kind}:${g.name}`}>
                      {g.name} ({n(g.live)} live)
                    </option>
                  ))}
                </optgroup>
              ) : null
            )}
          </select>
        </label>
      </section>

      {failed ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{failed}</div>
      ) : null}

      {f.scope.kind === "all" && manyParts ? (
        <div className="card px-4 py-3 text-[12.5px] text-muted">
          These figures count every vacancy in the Teamtailor account. If the account holds more than The Letting Experts, pick its division, department or location under Show figures for and every figure follows.
        </div>
      ) : null}

      {tooOld ? (
        <div className="card px-4 py-3 text-[12.5px] text-muted">
          Recruitment figures are held from {monthLabel(f.from)}. {monthLabel(month)} is before that, so its month figures are not counted.
        </div>
      ) : null}

      {/* ------------------------------ headline ------------------------------ */}
      {tooOld ? null : (
        <p className="max-w-[78ch] text-[15px] leading-relaxed text-ink">
          {plural(t.hired, "hire", "hires")} {live ? "so far in" : "in"} {monthLabel(month)} from {plural(t.applied, "application", "applications")}, {against(t.hired, t.hiredPrev, prev)}
          {live ? " with the month still running" : ""}. {plural(inPipeline, "person is", "people are")} still being considered across {plural(t.openVacancies, "live vacancy", "live vacancies")}.
        </p>
      )}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Tile
          label="Open vacancies"
          value={n(t.openVacancies)}
          sub={t.openings != null ? `Live now · ${plural(t.openings, "person", "people")} needed` : "Live in Teamtailor now"}
        />
        <Tile
          label="Applications"
          value={tooOld ? "-" : n(t.applied)}
          sub={tooOld ? undefined : `${period} · ${against(t.applied, t.appliedPrev, prev)}${t.sourced ? ` · ${n(t.sourced)} added by a recruiter` : ""}`}
        />
        <Tile
          label="Offers sent"
          value={tooOld ? "-" : n(t.offersSent)}
          sub={tooOld ? undefined : `${period} · answers in the month: ${n(t.offersAccepted)} accepted, ${n(t.offersDeclined)} declined`}
        />
        <Tile label="Hires" value={tooOld ? "-" : n(t.hired)} sub={tooOld ? undefined : `${period} · ${against(t.hired, t.hiredPrev, prev)}`} />
        <Tile
          label="Time to hire"
          value={t.hireDays == null ? "-" : `${n(Math.round(t.hireDays))} ${Math.round(t.hireDays) === 1 ? "day" : "days"}`}
          sub={
            t.hireDays == null
              ? `No hires in ${monthLabel(month)} to time`
              : `Application to hired, ${monthName(month)}'s ${plural(t.hired, "hire", "hires")}${t.hireDaysPrev == null ? "" : ` · ${n(Math.round(t.hireDaysPrev))} days in ${monthName(prev)}`}`
          }
        />
        <Tile
          label="Not taken forward"
          value={tooOld ? "-" : n(t.rejected)}
          sub={tooOld ? undefined : `${period} · ${n(t.byUs)} our decision · ${n(t.byThem)} withdrew`}
        />
      </section>

      {/* ------------------------------ pipeline + sources ------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[15px] text-ink">In the Pipeline Now</h3>
            <span className="text-[11px] text-muted">People still being considered · live vacancies · as of the last read</span>
          </div>
          <div className="mt-3">
            {f.pipeline.map((p) => (
              <Bar key={p.kind} label={STAGE_WORDS[p.kind]} value={p.n} max={pipeMax} />
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[15px] text-ink">Where Applications Came From</h3>
            <span className="text-[11px] text-muted">{monthLabel(month)}</span>
          </div>
          <div className="mt-3">
            {f.sources.length ? (
              f.sources.slice(0, 8).map((s) => <Bar key={s.name} label={s.name} value={s.n} max={srcMax} />)
            ) : (
              <p className="py-2 text-[12.5px] text-muted">No applications in {monthLabel(month)}.</p>
            )}
            {f.sources.length > 8 ? (
              <p className="pt-2 text-[11px] text-muted">
                And {n(f.sources.slice(8).reduce((a, s) => a + s.n, 0))} more from {plural(f.sources.length - 8, "other place", "other places")}.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ------------------------------ month by month + why ------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[15px] text-ink">Month by Month</h3>
            <span className="text-[11px] text-muted">Applications as bars · hires in bold beneath{live ? ` · ${shortMonth(month)} is part-way through` : ""}</span>
          </div>
          <div className="mt-4 flex items-end gap-1.5" role="img" aria-label="Applications and hires for each of the last thirteen months">
            {f.trend.map((m, i) => (
              <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month)}: ${plural(m.applied, "application", "applications")}, ${plural(m.hired, "hire", "hires")}`}>
                <span className="tnum text-[10.5px] text-muted">{n(m.applied)}</span>
                <div className="flex h-44 w-full items-end bg-line/40">
                  <div
                    className={`w-full ${m.month === month ? "bg-[var(--accent)]" : "bg-[var(--accent)]/45"}`}
                    style={{ height: `${Math.max(m.applied ? 3 : 0, Math.round((m.applied / trendMax) * 100))}%` }}
                  />
                </div>
                <span className="tnum text-[11px] font-semibold text-ink">{n(m.hired)}</span>
                <span className="whitespace-nowrap text-[10.5px] text-muted">
                  {shortMonth(m.month)}
                  {i === 0 || m.month.endsWith("-01") ? ` ${m.month.slice(2, 4)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[15px] text-ink">Why Applications Ended</h3>
            <span className="text-[11px] text-muted">{monthLabel(month)}</span>
          </div>
          <div className="mt-3">
            {f.reasons.length ? (
              f.reasons.slice(0, 8).map((r) => (
                <Bar key={r.reason} label={r.reason} value={r.n} max={whyMax} tag={r.by === "them" ? "They withdrew" : r.by === "us" ? "Our decision" : undefined} />
              ))
            ) : (
              <p className="py-2 text-[12.5px] text-muted">No application ended without a hire in {monthLabel(month)}.</p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------ vacancies ------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
          <h2 className="text-[15px] text-ink">Vacancies</h2>
          <span className="text-[11px] text-muted">Live vacancies, and any with applications or a hire in {monthLabel(month)}</span>
        </div>
        <div className="card overflow-x-auto">
          {f.vacancies.length ? (
            <table className="w-full text-[12.5px] sm:min-w-[600px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Vacancy</th>
                  <th className="hidden px-3 py-3 font-semibold sm:table-cell">Status</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">People needed</th>
                  <th className="px-3 py-3 text-right font-semibold">Applied</th>
                  <th className="hidden px-3 py-3 text-right font-semibold sm:table-cell">In the pipeline</th>
                  <th className="px-4 py-3 text-right font-semibold">Hired</th>
                </tr>
              </thead>
              <tbody>
                {f.vacancies.map((v) => (
                  <tr key={v.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className="text-ink">{v.title}</div>
                      <div className="text-[11px] text-muted">
                        {v.where ?? "No department set"}
                        <span className="sm:hidden">
                          {" "}
                          · {STATUS_WORDS[v.status] ?? v.status}
                          {v.openings == null ? "" : ` · ${n(v.openings)} needed`} · {n(v.inProcess)} in the pipeline
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted sm:table-cell">{STATUS_WORDS[v.status] ?? v.status}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right sm:table-cell">{v.openings == null ? "-" : n(v.openings)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{n(v.applied)}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right sm:table-cell">{n(v.inProcess)}</td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold text-ink">{n(v.hired)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-4 text-[12.5px] text-muted">No vacancies in {scopeWords}.</p>
          )}
        </div>
        {f.unplacedApplied ? (
          <p className="text-[11px] text-muted">
            {plural(f.unplacedApplied, "application", "applications")} this month belong to a vacancy Teamtailor no longer lists. They are in the totals above and not in this table.
          </p>
        ) : null}
        <p className="text-[11px] text-muted">
          Counts only: no candidate&rsquo;s name or details are read into the OS. A hire is an application in a Hired stage that was not turned down, counted in the month it got there.
        </p>
      </section>
    </div>
  );
}
