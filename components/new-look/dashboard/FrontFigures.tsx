"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  RANGES,
  SOURCE_BUCKETS,
  lastDays,
  sparkOf,
  sumRange,
  type RangeDays,
  type SourceBucket,
} from "@/lib/front-dash";
import { CountUp, DayBars, Spark, Steps, type StepRow } from "./Charts";
import RecordsDrawer, { type RecordAsk } from "./RecordsDrawer";
import type { FrontView } from "./useFront";

/**
 * The front dashboard's bottom half (new look, 24 Oct 2026), after the
 * design's front office: the range switch, five figures with their change and
 * a sparkline, leads per day by source, and the tenant pipeline.
 *
 * Passports done is a figure of its own in the top row (29 Oct 2026, Lianna on
 * the team call: "they are on the dashboard, but they're down below"), so an
 * agent sees them without scrolling - second, so a phone has it in the first
 * row. It is the same count and list as the pipeline's step, scoped the same
 * way: their own tenants, or the business's.
 *
 * Every figure is live, from /api/dashboard/front (read once a visit, 180
 * London days, so the switch never asks again), in three reads that each land
 * on their own (./useFront). A range is the last 7, 30 or 90 London days
 * including today, worked out from now(); the change is against the same
 * number of days just before. A part that could not be read shows a dash and
 * why, never a held number.
 *
 * Every figure, every pipeline step and every bar on the leads chart opens
 * the records behind it in a drawer (./RecordsDrawer, 25 Oct 2026), and each
 * record opens its own page. The drawer reads the same rows the figure was
 * counted from, so the two always agree.
 */

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
  loading: boolean;
  error: string | null;
  value: number | null;
  badge?: Badge | null;
  sub?: ReactNode;
  spark?: number[] | null;
  /** In place of a sparkline, for a figure that has no history (Terms out). */
  strip?: ReactNode;
  /** What opens when it is clicked: the records behind it. */
  ask: Omit<RecordAsk, "figure"> | null;
};

/** A day key as a short label for a tooltip: "Mon 20 Oct". */
const tipDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function Figure({ f, labels, onOpen }: { f: Fig; labels: string[]; onOpen: (a: RecordAsk) => void }) {
  const ready = !f.loading && !f.error && f.value != null;
  const body = (
    <>
      <span className="nl-dash-stat-top">
        <span>{f.label}</span>
        {ready && f.badge && (
          <em className={`nl-dash-badge is-${f.badge.tone}`} title={f.badge.title}>
            {f.badge.text}
          </em>
        )}
      </span>
      {f.loading ? (
        <span className="nl-dash-skel" aria-label="Loading">
          <i />
        </span>
      ) : !ready ? (
        <>
          <b className="nl-dash-stat-n is-off">-</b>
          <span className="nl-dash-stat-sub nl-dash-warn">{f.error ?? "Couldn't be read just now"}</span>
        </>
      ) : (
        <>
          <b className="nl-dash-stat-n">
            <CountUp value={f.value!} />
          </b>
          <span className="nl-dash-stat-sub">{f.sub}</span>
          {f.strip ?? (f.spark && <Spark values={f.spark} labels={labels} label={`${f.label}, day by day`} />)}
        </>
      )}
    </>
  );
  /* Only a figure that has been read opens a list: a dash has nothing behind it. */
  if (!ready || !f.ask) return <div className="nl-dash-stat is-still">{body}</div>;
  return (
    <button type="button" className="nl-dash-stat" onClick={() => onOpen({ ...f.ask!, figure: f.value! })} aria-label={`${f.label}: ${f.value!.toLocaleString("en-GB")}. Show them.`}>
      {body}
    </button>
  );
}

/* ── the half ─────────────────────────────────────────────────────────── */

function dayLabel(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (n <= 7) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  if (n <= 31) return String(d.getUTCDate());
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function FrontFigures({ range, setRange, front }: { range: RangeDays; setRange: (r: RangeDays) => void; front: FrontView }) {
  const [src, setSrc] = useState<SourceBucket | "all">("all");
  const [ask, setAsk] = useState<RecordAsk | null>(null);
  const n = range;
  /* The page's own days until an answer lands, so the labels are ready. */
  const days = useMemo(() => front.days ?? lastDays(180), [front.days]);
  const at = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const chartDays = days.slice(-n);
  const sparkLabels = useMemo(() => chartDays.map(tipDay), [chartDays.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const span = `${tipDay(chartDays[0])} to ${tipDay(chartDays[chartDays.length - 1])}`;
  const rangeWords = `Last ${n} days · ${span}`;

  /* New leads */
  const leads = front.leads.data;
  const leadTotals = useMemo(
    () => (leads ? days.map((_, i) => SOURCE_BUCKETS.reduce((a, b) => a + leads.bySource[b.id][i], 0)) : null),
    [leads, days]
  );

  /* Appraisals booked: made in the range, not cancelled or tidied away (the whole office's). */
  const ap = front.appraisals.data;

  /* Terms out: now, not range-bound. */
  const terms = front.terms.data;
  const late = terms ? terms.rows.filter((r) => r.late).length : 0;

  /* Passports done: tenants who finished their passport in the range. */
  const pp = front.passports.data;

  /* Let agreed */
  const lets = front.lets.data;
  const rentSum = lets ? sumRange(lets.rentSum, n) : 0;
  const rentN = lets ? sumRange(lets.rentN, n) : 0;

  const figs: Fig[] = [
    {
      label: "New leads",
      loading: front.leads.loading,
      error: front.leads.error,
      value: leadTotals ? sumRange(leadTotals, n) : null,
      badge: leadTotals ? pctBadge(sumRange(leadTotals, n), sumRange(leadTotals, n, 1), n) : null,
      sub: leads ? `${sumRange(leads.fresh, n).toLocaleString("en-GB")} not contacted yet` : null,
      spark: leadTotals ? sparkOf(leadTotals, n) : null,
      ask: { kind: "leads", days: n, title: "New Leads", range: rangeWords, note: "Every lettings lead received, newest first. A coral dot is one nobody has contacted yet.", board: { href: "/leads", label: "Open the Leads board" } },
    },
    {
      label: "Passports done",
      loading: front.passports.loading,
      error: front.passports.error,
      value: pp ? sumRange(pp, n) : null,
      badge: pp ? diffBadge(sumRange(pp, n), sumRange(pp, n, 1), n) : null,
      sub: pp ? `${pp[pp.length - 1]} today` : null,
      spark: pp ? sparkOf(pp, n) : null,
      ask: { kind: "passports", days: n, title: "Passports Done", range: rangeWords, note: "Tenant passports finished, newest first.", board: { href: "/leads?passports=done", label: "Open finished passports" } },
    },
    {
      label: "Appraisals booked",
      loading: front.appraisals.loading,
      error: front.appraisals.error,
      value: ap ? sumRange(ap.created, n) : null,
      badge: ap ? diffBadge(sumRange(ap.created, n), sumRange(ap.created, n, 1), n) : null,
      sub: ap ? `${ap.today} today · ${sumRange(ap.won, n)} instructed` : null,
      spark: ap ? sparkOf(ap.created, n) : null,
      ask: { kind: "appraisals", days: n, title: "Appraisals Booked", range: rangeWords, note: "Booked in these days, the whole office's, newest first.", board: { href: "/market-appraisals", label: "Open Market Appraisals" } },
    },
    {
      label: "Terms out",
      loading: front.terms.loading,
      error: front.terms.error,
      value: terms ? terms.rows.length : null,
      badge: terms && late > 0 ? { text: `${late} late`, tone: "warn", title: `Unsigned more than ${terms.lateAfterDays} days, past the last automatic nudge` } : null,
      sub: "awaiting signature",
      strip: terms ? (
        <span className="nl-dash-strip" title={`${terms.rows.length - late} in time, ${late} late`} aria-hidden>
          <i className="is-ok" style={{ flexGrow: Math.max(0, terms.rows.length - late) }} />
          <i className="is-late" style={{ flexGrow: late }} />
        </span>
      ) : null,
      ask: { kind: "terms", title: "Terms Out", range: "Out for signature now", note: "Every set still waiting on a signature. Each opens the place to chase it from.", board: { href: "/market-appraisals", label: "Open Market Appraisals" } },
    },
    {
      label: "Let agreed",
      loading: front.lets.loading,
      error: front.lets.error,
      value: lets ? sumRange(lets.agreed, n) : null,
      badge: lets ? diffBadge(sumRange(lets.agreed, n), sumRange(lets.agreed, n, 1), n) : null,
      sub: rentN
        ? `£${Math.round(rentSum / rentN).toLocaleString("en-GB")} average rent`
        : lets && sumRange(lets.agreed, n) > 0
          ? "no rent recorded on them"
          : "none in these days",
      spark: lets ? sparkOf(lets.agreed, n) : null,
      ask: { kind: "lets", days: n, title: "Let Agreed", range: rangeWords, note: "Applications accepted in these days, less any that fell through, newest first.", board: { href: "/applications", label: "Open Applications" } },
    },
  ];

  /* The leads chart: this range, one bar a day, filtered by the chip. */
  const barTotals = leads
    ? chartDays.map((d) => {
        const i = at.get(d)!;
        return src === "all" ? leadTotals![i] : leads.bySource[src][i];
      })
    : [];
  const avg = barTotals.length ? barTotals.reduce((a, v) => a + v, 0) / barTotals.length : 0;
  const fmtAvg = (v: number) => (v >= 10 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));
  const srcLabel = src === "all" ? null : (SOURCE_BUCKETS.find((b) => b.id === src)?.label ?? null);
  const pickDay = (k: number) => {
    const day = chartDays[k];
    if (!day) return;
    setAsk({
      kind: "leads",
      day,
      source: src === "all" ? null : src,
      figure: barTotals[k] ?? 0,
      title: srcLabel ? `${srcLabel} Leads` : "Leads That Day",
      range: new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
      note: srcLabel ? `Only leads from ${srcLabel}, as the chip over the chart.` : "Every lettings lead received that day.",
      board: { href: "/leads", label: "Open the Leads board" },
    });
  };

  /* The pipeline, over the same days. */
  const stepOf = <T,>(p: { loading: boolean; data: T | null }, read: (d: T) => number) => (p.loading || !p.data ? null : read(p.data));
  type Step = StepRow & { ask: Omit<RecordAsk, "figure"> };
  const steps: Step[] = [
    {
      label: "Enquiries",
      value: stepOf(front.leads, (d) => sumRange(d.tenant, n)),
      note: front.leads.loading ? "Reading…" : front.leads.error,
      hint: "Tenant leads received",
      ask: { kind: "tenant", days: n, title: "Enquiries", range: rangeWords, note: "Tenant leads received, newest first.", board: { href: "/leads?side=tenant", label: "Open Tenant leads" } },
    },
    {
      label: "Passport done",
      value: stepOf(front.passports, (d) => sumRange(d, n)),
      note: front.passports.loading ? "Reading…" : front.passports.error,
      hint: "Tenant passports finished",
      ask: { kind: "passports", days: n, title: "Passport Done", range: rangeWords, note: "Tenant passports finished, newest first.", board: { href: "/leads?passports=done", label: "Open finished passports" } },
    },
    {
      label: "Viewed",
      value: stepOf(front.viewings, (d) => sumRange(d, n)),
      note: front.viewings.loading ? "Reading…" : front.viewings.error,
      hint: "Viewings held: in the diary, not cancelled, and the time has come. Whether the tenant turned up is not recorded.",
      ask: { kind: "viewings", days: n, title: "Viewed", range: rangeWords, note: "Viewings held: in the diary, not cancelled, and the time has come. Whether the tenant turned up is not recorded.", board: { href: "/viewings", label: "Open the Diary" } },
    },
    {
      label: "Applied",
      value: stepOf(front.lets, (d) => sumRange(d.applied, n)),
      note: front.lets.loading ? "Reading…" : front.lets.error,
      hint: "Applications received, and offers accepted on the listing",
      ask: { kind: "applied", days: n, title: "Applied", range: rangeWords, note: "Applications received, and offers accepted on the listing, newest first.", board: { href: "/applications", label: "Open Applications" } },
    },
    {
      label: "Let agreed",
      value: stepOf(front.lets, (d) => sumRange(d.agreed, n)),
      note: front.lets.loading ? "Reading…" : front.lets.error,
      hint: "Applications accepted, less any that fell through",
      ask: { kind: "lets", days: n, title: "Let Agreed", range: rangeWords, note: "Applications accepted in these days, less any that fell through, newest first.", board: { href: "/applications", label: "Open Applications" } },
    },
  ];
  const stepsLoading = front.leads.loading && front.lets.loading && front.passports.loading;
  const whose = front.everything == null ? null : front.everything ? "across the whole business" : "in your own book";

  return (
    <section className="nl-dash-front" aria-labelledby="nl-dash-range-title">
      <div className="nl-dash-bar-h">
        <div>
          <h2 id="nl-dash-range-title" className="nl-dash-h2">
            Last {n} Days
          </h2>
          <p className="nl-dash-bar-sub">
            {front.everything === false
              ? "Your leads, passports, terms and lets. Appraisals are the whole office's."
              : "Leads, passports, appraisals and terms across the whole business."}{" "}
            Click a figure to see what&rsquo;s behind it.
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

      <div className="nl-dash-stats is-five">
        {figs.map((f) => (
          <Figure key={f.label} f={f} labels={sparkLabels} onOpen={setAsk} />
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
            Per day. Today in coral, the dotted line is the average{leads ? ` (${fmtAvg(avg)} a day)` : ""}. Hover a day for the split, click it for the leads.
          </p>
          {front.leads.loading ? (
            <p className="nl-dash-wait">
              <span className="nl-dash-spin" aria-hidden />
              Counting the leads…
            </p>
          ) : !leads ? (
            <p className="nl-dash-note nl-dash-warn">{front.leads.error ?? "Couldn't be read just now"}. No chart rather than an old one.</p>
          ) : (
            <DayBars
              key={`${n}-${src}`}
              labels={chartDays.map((d) => dayLabel(d, n))}
              totals={barTotals}
              todayIndex={chartDays.length - 1}
              avgLabel={fmtAvg}
              onPick={pickDay}
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
            Tenant enquiries to lets{whose ? ` ${whose}` : ""}. Each step is counted over the same {n} days, not one group followed through. Click a step for its list.
          </p>
          {stepsLoading ? (
            <p className="nl-dash-wait">
              <span className="nl-dash-spin" aria-hidden />
              Reading the pipeline…
            </p>
          ) : (
            <Steps key={n} steps={steps} onPick={(s) => {
              const step = steps.find((x) => x.label === s.label);
              if (step && step.value != null) setAsk({ ...step.ask, figure: step.value });
            }} />
          )}
        </div>
      </div>

      <RecordsDrawer ask={ask} onClose={() => setAsk(null)} />
    </section>
  );
}
