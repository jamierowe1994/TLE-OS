"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import LineIcon from "@/components/LineIcon";
import type { Since } from "@/components/admin/tracking/kit";
import { Failed, Loading, PeriodBar, SourceErrors, Sources, card, duration, eyebrow, n, pct, queryString, useTracking, useTrackingQuery } from "@/components/admin/tracking/kit";

/**
 * Admin > Tracking (James, 15 Oct 2026, the day after launch): which parts of
 * the OS are used, by whom, and how much - so conclusions can be drawn.
 *
 * The headlines first, then every part of the OS as a card that opens onto
 * its own page (by person, by day, down to the records), then everybody, a
 * zero included: somebody who has not opened the OS this month is a finding.
 * Every figure is read live for the period chosen (lib/tracking/report).
 */

type Overview = {
  sources: Record<string, string | null>;
  highlights: {
    active: number;
    accounts: number;
    mostUsed: { key: string; label: string; opens: number; people: number } | null;
    leastUsed: { key: string; label: string; opens: number; people: number } | null;
    neverOpened: string[];
    busiest: { key: string; name: string; opens: number; actions: number } | null;
    passport: { sent: number; finished: number } | null;
    longestStay: { page: string; label: string; avgSeconds: number } | null;
    timedAny: boolean;
    outcomes: Array<{ key: string; label: string; section: string; count: number; people: number; error: string | null }>;
  };
  sections: Array<{
    key: string;
    label: string;
    icon: string;
    blurb: string;
    people: number;
    opens: number;
    actions: number;
    seconds: number;
    timed: number;
    hasPages: boolean;
    metrics: Array<{ key: string; label: string; count: number; error: string | null }>;
  }>;
  people: Array<{ key: string; name: string; team: string; opens: number; actions: number; outcomes: number; days: number; seconds: number; topSection: string | null }>;
  since: Since;
};

function Tile({ label, value, sub, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className={eyebrow}>{label}</p>
      <p className="figures mt-1.5 text-[24px] leading-none">{value}</p>
      {sub ? <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{sub}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className={`${card} block p-4 transition-colors hover:border-ink/40`}>
      {body}
    </Link>
  ) : (
    <div className={`${card} p-4`}>{body}</div>
  );
}

export default function Tracking() {
  const { t, set, period } = useTrackingQuery();
  const { data: d, error, loading, reload } = useTracking<Overview>(t, "");
  const qs = t ? queryString(t) : "";
  const personName = t?.person ? d?.people.find((p) => p.key === t.person)?.name ?? null : null;

  return (
    <>
      <PageHeader
        illustration="/illustrations/people/reading-time.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="Tracking"
        blurb="Which parts of the OS are used, by whom, and how much. Open any part to see it by person, by day and record by record."
      />

      {t && period && <PeriodBar t={t} set={set} label={period.label} personName={personName} />}

      {loading || !t ? (
        <Loading />
      ) : error || !d ? (
        <Failed error={error ?? "The figures couldn't be read just now."} onRetry={reload} />
      ) : (
        <>
          <SourceErrors sources={d.sources} />

          {/* ── the headlines ── */}
          <div className="fade-up mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="People Using It"
              value={`${n(d.highlights.active)} of ${n(d.highlights.accounts)}`}
              sub={d.highlights.busiest ? <>Busiest: {d.highlights.busiest.name}</> : "Nobody yet this period"}
              href="#people"
            />
            <Tile
              label="Most Used"
              value={d.highlights.mostUsed?.label ?? "-"}
              sub={d.highlights.mostUsed ? `${n(d.highlights.mostUsed.opens)} opens by ${n(d.highlights.mostUsed.people)}` : "Nothing opened yet"}
              href={d.highlights.mostUsed ? `/admin/tracking/${d.highlights.mostUsed.key}?${qs}` : undefined}
            />
            <Tile
              label="Least Used"
              value={d.highlights.leastUsed?.label ?? "-"}
              sub={
                d.highlights.neverOpened.length
                  ? `Never opened: ${d.highlights.neverOpened.join(", ")}`
                  : d.highlights.leastUsed
                    ? `${n(d.highlights.leastUsed.opens)} opens by ${n(d.highlights.leastUsed.people)}`
                    : undefined
              }
              href={d.highlights.leastUsed ? `/admin/tracking/${d.highlights.leastUsed.key}?${qs}` : undefined}
            />
            <Tile
              label="Passports Finished"
              value={d.highlights.passport ? pct(d.highlights.passport.finished, d.highlights.passport.sent) : "-"}
              sub={d.highlights.passport ? `${n(d.highlights.passport.finished)} of ${n(d.highlights.passport.sent)} sent this period` : "Couldn't be read"}
              href={`/admin/tracking/passport?${qs}`}
            />
            {d.highlights.outcomes.map((o) => (
              <Tile
                key={o.key}
                label={o.label}
                value={o.error ? "-" : n(o.count)}
                sub={o.error ?? (o.count ? `by ${n(o.people)} ${o.people === 1 ? "person" : "people"}` : "None this period")}
                href={`/admin/tracking/${o.section}?${qs}`}
              />
            ))}
            <Tile
              label="Longest Stay"
              value={d.highlights.longestStay ? duration(d.highlights.longestStay.avgSeconds) : "-"}
              sub={
                d.highlights.longestStay
                  ? `on average, on ${d.highlights.longestStay.label}`
                  : d.highlights.timedAny
                    ? "Not enough visits timed yet"
                    : "Time on a page is counted from this update on"
              }
              href={`/admin/tracking/pages?${qs}`}
            />
          </div>

          {/* ── every part of the OS ── */}
          <h2 className="hand mt-9 text-[17px] leading-tight">Every Part of the OS</h2>
          <p className="mt-1 text-[11.5px] text-muted">
            Opens are screens opened. Done is anything saved, sent or changed. Open a part for who, when and the records.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.sections.map((s) => {
              const top = [...s.metrics].sort((a, b) => b.count - a.count).slice(0, 3);
              const quiet = s.opens === 0 && s.actions === 0 && s.metrics.every((m) => !m.count);
              return (
                <Link key={s.key} href={`/admin/tracking/${s.key}?${qs}`} className={`${card} fade-up group flex flex-col p-4 transition-colors hover:border-ink/40`}>
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                      <LineIcon name={s.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold">{s.label}</span>
                    <span className="text-[11px] text-muted group-hover:text-ink">Open →</span>
                  </span>
                  <span className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["People", s.people],
                      ["Opens", s.hasPages ? s.opens : null],
                      ["Done", s.actions],
                    ].map(([k, v]) => (
                      <span key={k as string}>
                        <span className={`${eyebrow} block`}>{k}</span>
                        <span className={`figures mt-0.5 block text-[19px] leading-tight ${v === 0 ? "text-muted" : ""}`}>{v === null ? "-" : n(v as number)}</span>
                      </span>
                    ))}
                  </span>
                  {top.length > 0 && (
                    <span className="mt-3 block space-y-0.5 border-t border-line/50 pt-2.5 text-[11.5px]">
                      {top.map((m) => (
                        <span key={m.key} className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-muted">{m.label}</span>
                          <span className="figures shrink-0">{m.error ? "-" : n(m.count)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                  {quiet && <span className="mt-2 text-[11px] text-accent-dark">Not used this period</span>}
                </Link>
              );
            })}
            <Link href={`/admin/tracking/pages?${qs}`} className={`${card} fade-up flex flex-col justify-between p-4 transition-colors hover:border-ink/40`}>
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                  <LineIcon name="grid" size={15} />
                </span>
                <span className="flex-1 text-[13.5px] font-semibold">Every Page</span>
                <span className="text-[11px] text-muted">Open →</span>
              </span>
              <span className="mt-3 text-[11.5px] text-muted">Who is on which page, how often, the most and least visited, and where people stay longest.</span>
            </Link>
          </div>

          {/* ── everybody ── */}
          <section id="people" className={`${card} fade-up mt-9 scroll-mt-6 p-5`}>
            <h2 className="hand text-[17px] leading-tight">Who&apos;s Using It</h2>
            <p className="mt-1 text-[11.5px] text-muted">
              Everybody with an account, the quiet ones included. Choose a name to see only their figures everywhere.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-line/60 text-[10.5px] uppercase tracking-[0.12em] text-muted">
                    <th className="py-2 pr-3 font-semibold">Person</th>
                    <th className="py-2 pr-3 font-semibold">Team</th>
                    <th className="py-2 pr-3 text-right font-semibold">Days in</th>
                    <th className="py-2 pr-3 text-right font-semibold">Opens</th>
                    <th className="py-2 pr-3 text-right font-semibold">Done</th>
                    <th className="py-2 pr-3 text-right font-semibold">Results</th>
                    <th className="py-2 pr-3 text-right font-semibold">Time</th>
                    <th className="py-2 font-semibold">Uses most</th>
                  </tr>
                </thead>
                <tbody>
                  {d.people.map((p) => {
                    const none = p.opens + p.actions + p.outcomes === 0;
                    return (
                      <tr key={p.key} className={`border-b border-line/40 last:border-0 ${none ? "text-muted" : ""}`}>
                        <td className="py-2 pr-3">
                          <button type="button" onClick={() => set({ person: p.key })} className="text-left underline decoration-line hover:decoration-ink">
                            {p.name}
                          </button>
                        </td>
                        <td className="py-2 pr-3 text-muted">{p.team}</td>
                        <td className="figures py-2 pr-3 text-right">{n(p.days)}</td>
                        <td className="figures py-2 pr-3 text-right">{n(p.opens)}</td>
                        <td className="figures py-2 pr-3 text-right">{n(p.actions)}</td>
                        <td className="figures py-2 pr-3 text-right">{n(p.outcomes)}</td>
                        <td className="figures py-2 pr-3 text-right">{p.seconds ? duration(p.seconds) : "-"}</td>
                        <td className="py-2">{none ? <span className="text-accent-dark">Not in this period</span> : (p.topSection ?? "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <Sources since={d.since} />
        </>
      )}
    </>
  );
}
