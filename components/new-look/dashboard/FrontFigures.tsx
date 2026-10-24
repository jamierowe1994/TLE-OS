"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { appraisalsSlot, useShared, type Slot } from "@/components/widgets";
import {
  RANGES,
  SOURCE_BUCKETS,
  londonDay,
  lastDays,
  sparkOf,
  sumRange,
  type FrontAnswer,
  type RangeDays,
  type SourceBucket,
} from "@/lib/front-dash";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { CountUp, DayBars, Spark, Steps, type StepRow } from "./Charts";

/**
 * The front dashboard's bottom half (new look, 24 Oct 2026), after the
 * design's front office: the range switch, four figures with their change and
 * a sparkline, leads per day by source, and the tenant pipeline.
 *
 * Every figure is live: the leads, lets, terms, passports and viewings from
 * /api/dashboard/front (read once a visit, 180 London days, so the switch never
 * asks again), the appraisals from /api/appraisals through the shared read the
 * Market Appraisals screen's figure already uses. A range is the last 7, 30 or
 * 90 London days including today, worked out from now(); the change is against
 * the same number of days just before. A part that could not be read shows a
 * dash and why, never a held number.
 */

export const frontSlot: Slot = { p: null };

export function useFront() {
  return useShared<FrontAnswer>(frontSlot, "/api/dashboard/front", (j) =>
    j.ok === true && Array.isArray(j.days) ? (j as unknown as FrontAnswer) : null
  );
}

const KEEP = "nl-dash-range-v1";

export function useRange(): [RangeDays, (r: RangeDays) => void] {
  const [range, setRange] = useState<RangeDays>(30);
  useEffect(() => {
    try {
      const n = Number(window.localStorage.getItem(KEEP));
      if ((RANGES as readonly number[]).includes(n)) setRange(n as RangeDays);
    } catch {
      /* no storage: 30 days */
    }
  }, []);
  const set = (r: RangeDays) => {
    setRange(r);
    try {
      window.localStorage.setItem(KEEP, String(r));
    } catch {
      /* the choice just isn't kept */
    }
  };
  return [range, set];
}

/* ── the change badge ─────────────────────────────────────────────────── */

type Badge = { text: string; tone: "up" | "down" | "flat" | "warn"; title?: string };

function pctBadge(cur: number, prev: number, n: number): Badge {
  const title = `The ${n} days before: ${prev.toLocaleString("en-GB")}`;
  if (cur === prev) return { text: "No change", tone: "flat", title };
  if (prev === 0) return { text: `+${cur.toLocaleString("en-GB")}`, tone: "up", title };
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { text: "No change", tone: "flat", title };
  return { text: `${p > 0 ? "+" : ""}${p}%`, tone: p > 0 ? "up" : "down", title };
}

function diffBadge(cur: number, prev: number, n: number): Badge {
  const d = cur - prev;
  const title = `The ${n} days before: ${prev.toLocaleString("en-GB")}`;
  if (d === 0) return { text: "No change", tone: "flat", title };
  return { text: `${d > 0 ? "+" : ""}${d.toLocaleString("en-GB")}`, tone: d > 0 ? "up" : "down", title };
}

/* ── one figure ───────────────────────────────────────────────────────── */

type Fig = {
  label: string;
  href: string;
  loading: boolean;
  error: string | null;
  value: number | null;
  badge?: Badge | null;
  sub?: ReactNode;
  spark?: number[] | null;
  /** In place of a sparkline, for a figure that has no history (Terms out). */
  strip?: ReactNode;
};

function Figure({ f }: { f: Fig }) {
  return (
    <Link href={f.href} className="nl-dash-stat">
      <span className="nl-dash-stat-top">
        <span>{f.label}</span>
        {!f.loading && !f.error && f.badge && (
          <em className={`nl-dash-badge is-${f.badge.tone}`} title={f.badge.title}>
            {f.badge.text}
          </em>
        )}
      </span>
      {f.loading ? (
        <span className="nl-dash-skel" aria-label="Loading">
          <i />
        </span>
      ) : f.error || f.value == null ? (
        <>
          <b className="nl-dash-stat-n is-off">-</b>
          <span className="nl-dash-stat-sub nl-dash-warn">{f.error ?? "Couldn't be read just now"}</span>
        </>
      ) : (
        <>
          <b className="nl-dash-stat-n">
            <CountUp value={f.value} />
          </b>
          <span className="nl-dash-stat-sub">{f.sub}</span>
          {f.strip ?? (f.spark && <Spark values={f.spark} label={`${f.label}, day by day`} />)}
        </>
      )}
    </Link>
  );
}

/* ── the half ─────────────────────────────────────────────────────────── */

const live = (a: MarketAppraisal) => !a.cancelledAt && !a.archivedAt;
const SAY_FAILED = "Couldn't be read just now";

function dayLabel(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (n <= 7) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  if (n <= 31) return String(d.getUTCDate());
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function FrontFigures({
  range,
  setRange,
  front,
}: {
  range: RangeDays;
  setRange: (r: RangeDays) => void;
  front: ReturnType<typeof useFront>;
}) {
  const appraisals = useShared<{ appraisals: MarketAppraisal[] }>(appraisalsSlot, "/api/appraisals", (j) =>
    Array.isArray(j.appraisals) && !j.error ? { appraisals: j.appraisals as MarketAppraisal[] } : null
  );
  const [src, setSrc] = useState<SourceBucket | "all">("all");
  const n = range;
  const data = front.data;
  /* The page's own days when the route hasn't answered, so the appraisals
     still count on the same London calendar. */
  const days = useMemo(() => data?.days ?? lastDays(180), [data]);
  const today = days[days.length - 1];
  const at = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);

  const frontErr = front.loading ? null : front.data ? null : front.unlinked ? "Your account isn't linked yet - ask James" : SAY_FAILED;
  const partErr = <T,>(p: { ok: true; data: T } | { ok: false; error: string } | undefined): string | null =>
    front.loading ? null : frontErr ?? (p && !p.ok ? p.error.replace(/\.$/, "") : null);

  /* New leads */
  const leads = data?.leads.ok ? data.leads.data : null;
  const leadTotals = useMemo(
    () => (leads ? days.map((_, i) => SOURCE_BUCKETS.reduce((a, b) => a + leads.bySource[b.id][i], 0)) : null),
    [leads, days]
  );

  /* Appraisals booked: created in the range, not cancelled or tidied away. */
  const apList = appraisals.data?.appraisals ?? null;
  const apSeries = useMemo(() => {
    if (!apList) return null;
    const s = days.map(() => 0);
    for (const a of apList) {
      if (!live(a) || !a.createdAt) continue;
      const i = at.get(londonDay(new Date(a.createdAt)));
      if (i != null) s[i]++;
    }
    return s;
  }, [apList, days, at]);
  const apToday = apList ? apList.filter((a) => live(a) && a.appointmentAt && londonDay(new Date(a.appointmentAt)) === today).length : 0;
  const apInstructed = apList
    ? apList.filter((a) => {
        if (!live(a) || !a.createdAt) return false;
        const i = at.get(londonDay(new Date(a.createdAt)));
        return i != null && i >= days.length - n && (a.liveStage ?? a.stage) === "won";
      }).length
    : 0;

  /* Terms out: now, not range-bound. */
  const terms = data?.terms.ok ? data.terms.data : null;
  const late = terms ? terms.rows.filter((r) => r.late).length : 0;

  /* Let agreed */
  const lets = data?.lets.ok ? data.lets.data : null;
  const rentSum = lets ? sumRange(lets.rentSum, n) : 0;
  const rentN = lets ? sumRange(lets.rentN, n) : 0;

  const figs: Fig[] = [
    {
      label: "New leads",
      href: "/leads",
      loading: front.loading,
      error: partErr(data?.leads),
      value: leadTotals ? sumRange(leadTotals, n) : null,
      badge: leadTotals ? pctBadge(sumRange(leadTotals, n), sumRange(leadTotals, n, 1), n) : null,
      sub: leads ? `${sumRange(leads.fresh, n).toLocaleString("en-GB")} not contacted yet` : null,
      spark: leadTotals ? sparkOf(leadTotals, n) : null,
    },
    {
      label: "Appraisals booked",
      href: "/market-appraisals",
      loading: appraisals.loading,
      error: appraisals.loading ? null : appraisals.data ? null : appraisals.unlinked ? "Your account isn't linked yet - ask James" : SAY_FAILED,
      value: apSeries ? sumRange(apSeries, n) : null,
      badge: apSeries ? diffBadge(sumRange(apSeries, n), sumRange(apSeries, n, 1), n) : null,
      sub: `${apToday} today · ${apInstructed} instructed`,
      spark: apSeries ? sparkOf(apSeries, n) : null,
    },
    {
      label: "Terms out",
      href: "/market-appraisals",
      loading: front.loading,
      error: partErr(data?.terms),
      value: terms ? terms.rows.length : null,
      badge: terms && late > 0 ? { text: `${late} late`, tone: "warn", title: `Unsigned more than ${terms.lateAfterDays} days, past the last automatic nudge` } : null,
      sub: "awaiting signature",
      strip: terms ? (
        <span className="nl-dash-strip" title={`${terms.rows.length - late} in time, ${late} late`} aria-hidden>
          <i className="is-ok" style={{ flexGrow: Math.max(0, terms.rows.length - late) }} />
          <i className="is-late" style={{ flexGrow: late }} />
        </span>
      ) : null,
    },
    {
      label: "Let agreed",
      href: "/applications",
      loading: front.loading,
      error: partErr(data?.lets),
      value: lets ? sumRange(lets.agreed, n) : null,
      badge: lets ? diffBadge(sumRange(lets.agreed, n), sumRange(lets.agreed, n, 1), n) : null,
      sub: rentN
        ? `£${Math.round(rentSum / rentN).toLocaleString("en-GB")} average rent`
        : lets && sumRange(lets.agreed, n) > 0
          ? "no rent recorded on them"
          : "none in these days",
      spark: lets ? sparkOf(lets.agreed, n) : null,
    },
  ];

  /* The leads chart: this range, one bar a day, filtered by the chip. */
  const chartDays = days.slice(-n);
  const barTotals = leads
    ? chartDays.map((d) => {
        const i = at.get(d)!;
        return src === "all" ? leadTotals![i] : leads.bySource[src][i];
      })
    : [];
  const avg = barTotals.length ? barTotals.reduce((a, v) => a + v, 0) / barTotals.length : 0;
  const fmtAvg = (v: number) => (v >= 10 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));

  /* The pipeline, over the same days. */
  const stepOf = (p: { ok: true; data: number[] } | { ok: false; error: string } | undefined, read: (s: number[]) => number) =>
    front.loading ? null : p && p.ok ? read(p.data) : null;
  const steps: StepRow[] = [
    { label: "Enquiries", href: "/leads?side=tenant", value: leads ? sumRange(leads.tenant, n) : null, hint: "Tenant leads received" },
    { label: "Passport done", href: "/leads?passports=done", value: stepOf(data?.passports, (s) => sumRange(s, n)), hint: "Tenant passports finished" },
    { label: "Viewed", href: "/viewings", value: stepOf(data?.viewings, (s) => sumRange(s, n)), hint: "Viewings held: in the diary, not cancelled, and the time has come. Whether the tenant turned up is not recorded." },
    { label: "Applied", href: "/applications", value: lets ? sumRange(lets.applied, n) : null, hint: "Applications received, and offers accepted on the listing" },
    { label: "Let agreed", href: "/applications", value: lets ? sumRange(lets.agreed, n) : null, hint: "Applications accepted, less any that fell through" },
  ];
  const whose = data ? (data.everything ? "across the whole business" : "in your own book") : null;

  return (
    <section className="nl-dash-front" aria-labelledby="nl-dash-range-title">
      <div className="nl-dash-bar-h">
        <div>
          <h2 id="nl-dash-range-title" className="nl-dash-h2">
            Last {n} Days
          </h2>
          <p className="nl-dash-bar-sub">
            {data && !data.everything
              ? "Your leads, terms and lets. Appraisals are the whole office's."
              : "Leads, appraisals and terms across the whole business."}
          </p>
        </div>
        <div className="nl-dash-seg" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === n} className={r === n ? "is-on" : undefined} onClick={() => setRange(r)}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="nl-dash-stats">
        {figs.map((f) => (
          <Figure key={f.label} f={f} />
        ))}
      </div>

      <div className="nl-dash-grid">
        <div className="nl-dash-card is-wide">
          <div className="nl-dash-card-h">
            <h3>Leads</h3>
            <span className="nl-dash-chips" role="group" aria-label="Source">
              {([{ id: "all", label: "All" }, ...SOURCE_BUCKETS] as { id: SourceBucket | "all"; label: string }[]).map((c) => (
                <button key={c.id} type="button" aria-pressed={src === c.id} className={src === c.id ? "is-on" : undefined} onClick={() => setSrc(c.id)}>
                  {c.label}
                </button>
              ))}
            </span>
          </div>
          <p className="nl-dash-card-sub">
            Per day. Today in coral, the dotted line is the average{leads ? ` (${fmtAvg(avg)} a day)` : ""}. Hover a day for the split.
          </p>
          {front.loading ? (
            <p className="nl-dash-wait">
              <span className="nl-dash-spin" aria-hidden />
              Counting the leads…
            </p>
          ) : !leads ? (
            <p className="nl-dash-note nl-dash-warn">{partErr(data?.leads) ?? SAY_FAILED}. No chart rather than an old one.</p>
          ) : (
            <DayBars
              key={`${n}-${src}`}
              labels={chartDays.map((d) => dayLabel(d, n))}
              totals={barTotals}
              todayIndex={chartDays.length - 1}
              avgLabel={fmtAvg}
              split={(k) => {
                const i = at.get(chartDays[k])!;
                return src === "all" ? SOURCE_BUCKETS.map((b) => [b.label, leads.bySource[b.id][i]] as [string, number]) : [];
              }}
            />
          )}
        </div>

        <div className="nl-dash-card">
          <div className="nl-dash-card-h">
            <h3>Pipeline</h3>
            <span className="nl-meta">Last {n} days</span>
          </div>
          <p className="nl-dash-card-sub">
            Tenant enquiries to lets{whose ? ` ${whose}` : ""}. Each step is counted over the same {n} days, not one group followed through.
          </p>
          {front.loading ? (
            <p className="nl-dash-wait">
              <span className="nl-dash-spin" aria-hidden />
              Reading the pipeline…
            </p>
          ) : frontErr ? (
            <p className="nl-dash-note nl-dash-warn">{frontErr}.</p>
          ) : (
            <Steps
              key={n}
              steps={steps}
              Link={({ href, className, title, children }) => (
                <Link href={href} className={className} title={title}>
                  {children}
                </Link>
              )}
            />
          )}
        </div>
      </div>
    </section>
  );
}
