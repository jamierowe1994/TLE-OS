"use client";

import Link from "next/link";
import LineIcon from "@/components/LineIcon";
import { Ico } from "@/components/new-look/Parts";
import { NlFailed, NlFig, NlLoading } from "@/components/new-look/admin/ScreenBits";
import { PeriodBarNew, SourceErrorsNew, SourcesNew } from "@/components/new-look/admin/TrackingKitNew";
import { duration, n, pct, queryString, type TrackingQuery } from "@/components/admin/tracking/kit";
import type { Overview } from "@/components/admin/tracking/types";

/**
 * Usage > Tracking in the new look (lib/new-look "admin", 24 Oct 2026): which
 * parts of the OS are used, by whom, and how much. The headlines, every part
 * as a card that opens, then everybody - a zero included.
 *
 * This is where usage lives. Activity is the audit trail (who did what, and
 * who's been reading the book) and links here rather than repeating a figure.
 */

export default function TrackingNew({
  t,
  set,
  periodLabel,
  d,
  loading,
  error,
  reload,
  personName,
}: {
  t: TrackingQuery | null;
  set: (c: Partial<TrackingQuery>) => void;
  periodLabel: string | null;
  d: Overview | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  personName: string | null;
}) {
  const qs = t ? queryString(t) : "";
  const link = (key: string) => `/admin/tracking/${key}?${qs}`;

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-tab">
      <p className="nl-adm-lead">Which parts of the OS are used, by whom, and how much. Open any part to see it by person, by day and record by record.</p>

      {t && periodLabel && <PeriodBarNew t={t} set={set} label={periodLabel} personName={personName} />}

      {loading || !t ? (
        <NlLoading what="Reading the figures" />
      ) : error || !d ? (
        <NlFailed error={error ?? "The figures couldn't be read just now."} onRetry={reload} first />
      ) : (
        <>
          <SourceErrorsNew sources={d.sources} />

          {/* ── the headlines ── */}
          <ul className="nl-adm-figs">
            <NlFig
              label="People using it"
              value={`${n(d.highlights.active)} of ${n(d.highlights.accounts)}`}
              sub={d.highlights.busiest ? <>Busiest: {d.highlights.busiest.name}</> : "Nobody yet this period"}
              href="#people"
            />
            <NlFig
              word
              label="Most used"
              value={d.highlights.mostUsed?.label ?? "-"}
              sub={d.highlights.mostUsed ? `${n(d.highlights.mostUsed.opens)} opens by ${n(d.highlights.mostUsed.people)}` : "Nothing opened yet"}
              href={d.highlights.mostUsed ? link(d.highlights.mostUsed.key) : undefined}
            />
            <NlFig
              word
              label="Least used"
              value={d.highlights.leastUsed?.label ?? "-"}
              sub={
                d.highlights.neverOpened.length
                  ? `Never opened: ${d.highlights.neverOpened.join(", ")}`
                  : d.highlights.leastUsed
                    ? `${n(d.highlights.leastUsed.opens)} opens by ${n(d.highlights.leastUsed.people)}`
                    : undefined
              }
              href={d.highlights.leastUsed ? link(d.highlights.leastUsed.key) : undefined}
            />
            <NlFig
              label="Passports finished"
              value={d.highlights.passport ? pct(d.highlights.passport.finished, d.highlights.passport.sent) : "-"}
              sub={d.highlights.passport ? `${n(d.highlights.passport.finished)} of ${n(d.highlights.passport.sent)} sent this period` : "Couldn't be read"}
              href={link("passport")}
            />
            {d.highlights.outcomes.map((o) => (
              <NlFig
                key={o.key}
                label={o.label}
                value={o.error ? "-" : n(o.count)}
                sub={o.error ?? (o.count ? `by ${n(o.people)} ${o.people === 1 ? "person" : "people"}` : "None this period")}
                href={link(o.section)}
              />
            ))}
            <NlFig
              label="Longest stay"
              value={d.highlights.longestStay ? duration(d.highlights.longestStay.avgSeconds) : "-"}
              sub={
                d.highlights.longestStay
                  ? `on average, on ${d.highlights.longestStay.label}`
                  : d.highlights.timedAny
                    ? "Not enough visits timed yet"
                    : "Time on a page is counted from this update on"
              }
              href={link("pages")}
            />
          </ul>

          {/* ── every part of the OS ── */}
          <section className="nl-adm-block">
            <div className="nl-adm-block-head">
              <div>
                <h2 className="nl-section-title">Every Part of the OS</h2>
                <p className="nl-meta">Opens are screens opened. Done is anything saved, sent or changed. Open a part for who, when and the records.</p>
              </div>
            </div>
            <div className="nl-adm-parts">
              {d.sections.map((s) => {
                const top = [...s.metrics].sort((a, b) => b.count - a.count).slice(0, 3);
                const quiet = s.opens === 0 && s.actions === 0 && s.metrics.every((m) => !m.count);
                return (
                  <Link key={s.key} href={link(s.key)} className="nl-adm-part">
                    <span className="nl-adm-part-head">
                      <LineIcon name={s.icon} size={15} />
                      <span className="nl-strong">{s.label}</span>
                      {quiet && <span className="nl-meta">Not used this period</span>}
                      <Ico name="arrow" size={14} />
                    </span>
                    <span className="nl-mini-stats">
                      {(
                        [
                          ["People", s.people],
                          ["Opens", s.hasPages ? s.opens : null],
                          ["Done", s.actions],
                        ] as const
                      ).map(([k, v]) => (
                        <span key={k}>
                          <b>{v === null ? "-" : n(v)}</b>
                          <span>{k}</span>
                        </span>
                      ))}
                    </span>
                    {top.length > 0 && (
                      <ul className="nl-adm-part-top">
                        {top.map((m) => (
                          <li key={m.key}>
                            <span>{m.label}</span>
                            <b>{m.error ? "-" : n(m.count)}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Link>
                );
              })}
              <Link href={link("pages")} className="nl-adm-part">
                <span className="nl-adm-part-head">
                  <LineIcon name="grid" size={15} />
                  <span className="nl-strong">Every Page</span>
                  <Ico name="arrow" size={14} />
                </span>
                <span className="nl-meta">Who is on which page, how often, the most and least visited, and where people stay longest.</span>
              </Link>
            </div>
          </section>

          {/* ── everybody ── */}
          <section id="people" className="nl-adm-block nl-adm-anchor">
            <div className="nl-adm-block-head">
              <div>
                <h2 className="nl-section-title">Who&apos;s Using It</h2>
                <p className="nl-meta">Everybody with an account, the quiet ones included. Choose a name to see only their figures everywhere.</p>
              </div>
            </div>
            <div className="nl-adm-tablewrap">
              <table className="nl-adm-table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Team</th>
                    <th className="is-num">Days in</th>
                    <th className="is-num">Opens</th>
                    <th className="is-num">Done</th>
                    <th className="is-num">Results</th>
                    <th className="is-num">Time</th>
                    <th>Uses most</th>
                  </tr>
                </thead>
                <tbody>
                  {d.people.map((p) => {
                    const none = p.opens + p.actions + p.outcomes === 0;
                    return (
                      <tr key={p.key} className={none ? "is-quiet" : undefined}>
                        <td>
                          <button type="button" onClick={() => set({ person: p.key })} className="nl-link">
                            {p.name}
                          </button>
                        </td>
                        <td className="nl-adm-muted">{p.team}</td>
                        <td className="is-num">{n(p.days)}</td>
                        <td className="is-num">{n(p.opens)}</td>
                        <td className="is-num">{n(p.actions)}</td>
                        <td className="is-num">{n(p.outcomes)}</td>
                        <td className="is-num">{p.seconds ? duration(p.seconds) : "-"}</td>
                        <td>{none ? <span className="nl-adm-bad">Not in this period</span> : (p.topSection ?? "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <SourcesNew since={d.since} />
        </>
      )}
    </div>
  );
}
