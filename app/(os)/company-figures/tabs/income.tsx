"use client";

// Admin tab: Income — July MTD estimates, June finals, Jan–Jun monthly income
// table, licence fee table, YoY growth chips, GCI vs total income bars.
// GCI actuals come from PayProp reports (no API access yet) — snapshot badges.

import { useEffect, useMemo, useState } from "react";
import StatCard from "@/components/business/StatCard";
import DataTable, { type DataTableColumn } from "@/components/business/DataTable";
import Donut from "@/components/business/charts/Donut";
import Bars from "@/components/business/charts/Bars";
import type { SeedData } from "@/lib/business/seed-data"; // type-only — erased at build
import type { IncomeMonthlyRow, LicenceFeeRow } from "@/lib/business/seed-types";
import { exVat, formatGBP, formatNum, monthLabel, monthsThisYearToDate } from "@/lib/business/format";
const SNAPSHOT_MONTH = "2026-07"; // the one month the seed answers for


/* ------------------------------ table columns ------------------------------ */

function money(v: number | null): string {
  return v == null ? "—" : formatGBP(v);
}

/** A row of the monthly table: the metric name, plus one key per month short
 *  ("jan", "feb", …) and per quarter. Which keys exist depends entirely on
 *  which months PayProp could answer for, so this cannot be a fixed shape. */
type MonthlyRow = { metric: string } & Record<string, unknown>;

/** Narrow a cell back to a figure. Anything that isn't a number is unknown,
 *  which renders as a dash — never as zero. */
/** A declared gap: no live source reached this, and here is what it needs. */
const gap = (note: string) => ({ value: null, source: "unavailable" as const, note });

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

const HIGHLIGHT_METRICS = new Set(["Combined GCI (exc VAT)"]);

const MONTHLY_COLUMNS: DataTableColumn<MonthlyRow>[] = [
  {
    key: "metric",
    label: "Metric",
    render: (r) => (
      <span className={HIGHLIGHT_METRICS.has(r.metric) ? "font-semibold" : undefined}>
        {r.metric}
      </span>
    ),
  },
];

/**
 * The month columns, derived from the calendar rather than typed.
 *
 * These were hardcoded jan…jun plus Q1 and Q2, so in August the table still
 * stopped at June while the chart directly beneath it already ran to July —
 * one screen holding two different opinions about how far the year had got.
 *
 * A quarter column only appears once that quarter is COMPLETE. A "Q3" holding
 * July alone, sitting beside a real Q1 and Q2, reads as a quarter that
 * collapsed rather than one that hasn't finished.
 */
const QUARTERS = [
  { key: "q1", label: "Q1", months: ["01", "02", "03"] },
  { key: "q2", label: "Q2", months: ["04", "05", "06"] },
  { key: "q3", label: "Q3", months: ["07", "08", "09"] },
  { key: "q4", label: "Q4", months: ["10", "11", "12"] },
];

function monthlyColumns(
  months: string[]
): DataTableColumn<MonthlyRow>[] {
  const have = new Set(months.map((m) => m.slice(5)));
  const cols: DataTableColumn<MonthlyRow>[] = [MONTHLY_COLUMNS[0]];

  for (const q of QUARTERS) {
    for (const mm of q.months) {
      if (!have.has(mm)) continue;
      const key = new Date(`2000-${mm}-01T00:00:00Z`)
        .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
        .toLowerCase();
      cols.push({
        key,
        label: key[0].toUpperCase() + key.slice(1),
        align: "right",
        render: (r) => money((r as Record<string, number | null>)[key]),
      });
    }
    if (q.months.every((mm) => have.has(mm))) {
      cols.push({
        key: q.key,
        label: q.label,
        align: "right",
        render: (r) => (
          <span className="font-semibold">{money((r as Record<string, number | null>)[q.key])}</span>
        ),
      });
    }
  }

  cols.push({
    key: "ytd",
    label: "YTD",
    align: "right",
    render: (r) => <span className="font-semibold">{money(num(r.ytd))}</span>,
  });
  return cols;
}

const LICENCE_COLUMNS: DataTableColumn<LicenceFeeRow & Record<string, unknown>>[] = [
  {
    key: "month",
    label: "Month",
    render: (r) => (
      <span className={r.month === "YTD Total" ? "font-semibold" : undefined}>{r.month}</span>
    ),
  },
  { key: "monthlyLicence", label: "Monthly licence", align: "right", render: (r) => money(r.monthlyLicence) },
  { key: "proLicence", label: "Pro licence", align: "right", render: (r) => money(r.proLicence) },
  { key: "joiningFees", label: "Joining fees", align: "right", render: (r) => money(r.joiningFees) },
  {
    key: "total",
    label: "Total",
    align: "right",
    render: (r) => <span className="font-semibold">{money(r.total)}</span>,
  },
];

/* ------------------------------- YoY chip row ------------------------------- */

function YoyChips({ label, data }: { label: string; data: Record<string, number> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {Object.entries(data).map(([m, v]) => (
        <span
          key={m}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tnum ${
            v >= 0
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {m} {v >= 0 ? "+" : ""}
          {formatNum(v)}%
        </span>
      ))}
    </div>
  );
}

/* --------------------------------- the tab --------------------------------- */

// £1,200 average GCI per move-in — Susan's own July-estimate formula
// (her £12,000 est = 10 move-ins × £1,200). PayProp will replace this
// with actuals when connected.
const AVG_GCI_PER_MOVE_IN = 1200;

interface LiveIncome {
  agencyIncome: number;
  combinedGci: number;
  paidToBeneficiaries: number;
  ownerPayments: number;
  byCategory: Array<{ category: string; amount: number }>;
  byAccount: Array<{ account: string; label: string; agencyIncome: number; combinedGci: number }>;
  paymentCount: number;
  agentsEarning: number;
}
interface LiveMoveIns {
  count: number;
  rentAdded: number;
}

/* The rows this table can show, in Susan's reading order. They must match the
   labels /api/business/income-months answers with, verbatim — the route keys
   its payload by these strings.

   TOTAL INCOME is deliberately absent: it is GCI plus licence and joining
   fees, and neither of those runs through PayProp. A "total" that quietly
   omitted them would be a smaller number wearing a bigger name. */
const METRIC_ROWS = [
  "E&W GCI (exc VAT)",
  "Glasgow GCI (exc VAT)",
  "Combined GCI (exc VAT)",
  "Paid to Associates (E&W)",
  "Combined Net Income to TLE",
] as const;

export default function IncomeTab({ month, seed }: { month: string; seed: SeedData }) {
  const inc = seed.income;

  // Live money from PayProp — gathered in the background, so poll for it.
  const [live, setLive] = useState<LiveIncome | null>(null);
  const [prev, setPrev] = useState<LiveIncome | null>(null);
  const [moveIns, setMoveIns] = useState<LiveMoveIns | null>(null);
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setLive(null);
    setPrev(null);
    setMoveIns(null);
    const ask = () => {
      fetch(`/api/business/payprop-live?month=${month}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: {
          income?: LiveIncome | null;
          prevIncome?: LiveIncome | null;
          moveIns?: LiveMoveIns | null;
          refreshing?: boolean;
        }) => {
          if (cancelled) return;
          if (d.income) setLive(d.income);
          if (d.prevIncome) setPrev(d.prevIncome);
          if (d.moveIns) setMoveIns(d.moveIns);
          // The previous month is a second walk and lands later than this
          // month's, so keep asking until both are in.
          if ((!d.income || !d.prevIncome) && tries++ < 40) setTimeout(ask, 5000);
        })
        .catch(() => {});
    };
    ask();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const gbp = (n: number) =>
    `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  /**
   * Live PayProp amounts arrive INCLUSIVE of VAT; every historical row on this
   * tab is seeded from the accounts spreadsheet, whose fee columns are all
   * "exc VAT". The live cards must be netted or the tab disagrees with itself
   * — which is exactly how July read ~£61.3k here against £51,068 on Susan's
   * summary: same fees, hers net, ours gross, the gap the VAT to the penny.
   */
  const netGbp = (n: number) => gbp(exVat(n));

  /** One agency's GCI, or null when it isn't there yet. */
  const accountGci = (l: LiveIncome | null, label: string) => {
    const a = l?.byAccount?.find((x) => x.label === label);
    if (!a) return null;
    return {
      value: Math.round(exVat(a.combinedGci)),
      display: netGbp(a.combinedGci),
      source: "live-payprop" as const,
      note: `${netGbp(a.agencyIncome)} exc VAT kept by the agency; the rest paid to partners.`,
    };
  };

  /**
   * The month just gone, from PayProp. Everything here is a fee figure or a
   * ratio of two of them, so it's as final as the snapshot was — but current.
   * Returns null until the walk lands, so the card falls back rather than
   * flashing a zero.
   */
  const prevMonthKey = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  })();
  const prevLabel = monthLabel(prevMonthKey);

  const pv = (which: "totalGci" | "tleNet" | "gciPerAgent" | "netPerAgent" | "splitPct") => {
    if (!prev) return null;
    const agents = prev.agentsEarning || 0;
    const note = `Live from PayProp — ${prevLabel} final, ${prev.paymentCount} payments.`;
    const src = "live-payprop" as const;
    switch (which) {
      case "totalGci":
        return { value: Math.round(exVat(prev.combinedGci)), display: netGbp(prev.combinedGci), source: src, note };
      case "tleNet":
        return { value: Math.round(exVat(prev.agencyIncome)), display: netGbp(prev.agencyIncome), source: src, note };
      case "gciPerAgent":
        if (!agents) return null;
        return {
          value: Math.round(exVat(prev.combinedGci) / agents),
          display: gbp(exVat(prev.combinedGci) / agents),
          source: src,
          note: `${netGbp(prev.combinedGci)} exc VAT across ${agents} earning partners.`,
        };
      case "netPerAgent":
        if (!agents) return null;
        return {
          value: Math.round(exVat(prev.agencyIncome) / agents),
          display: gbp(exVat(prev.agencyIncome) / agents),
          source: src,
          note: `${netGbp(prev.agencyIncome)} exc VAT across ${agents} earning partners.`,
        };
      case "splitPct": {
        if (!prev.combinedGci) return null;
        const pct = Math.round((prev.agencyIncome / prev.combinedGci) * 100);
        return { value: pct, display: `${pct}%`, source: src, note };
      }
    }
  };

  // Resolved once so the card and its sub-line quote the SAME split — computed
  // twice, the sub kept reading the snapshot while the stat had gone live.
  const liveSplit = pv("splitPct");
  const splitStat = liveSplit ?? gap("Needs this month's PayProp split.");
  // The partners' cash sits next to that percentage, so it has to come off the
  // same month: prev's own beneficiary total, not June's snapshot.
  /* No June fallback. Quoting June's partner cash under a live percentage put
     two different months on one line, and the empty string is the honest
     answer when this month's beneficiary total hasn't landed. */
  const splitPartnerNet = liveSplit && prev ? gbp(prev.paidToBeneficiaries) : "";


  // Live estimate input: this month's completed move-ins from Propoly.
  const [liveMoveIns, setLiveMoveIns] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/business/live-business?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const mi = (j as { propoly?: { moveInsThisMonth?: number } | null }).propoly
          ?.moveInsThisMonth;
        if (!cancelled && typeof mi === "number") setLiveMoveIns(mi);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month]);

  const liveGciEst =
    liveMoveIns != null
      ? {
          value: liveMoveIns * AVG_GCI_PER_MOVE_IN,
          display: formatGBP(liveMoveIns * AVG_GCI_PER_MOVE_IN),
          source: "live-propoly" as const,
          note: `Estimate from live data — ${liveMoveIns} completed move-ins this month (live from Propoly) × £1,200 avg GCI, Susan's own estimating formula. PayProp actuals replace this when connected.`,
          asOf: new Date().toISOString().slice(0, 10),
        }
      : null;

  // GCI vs total income bars — January to the last COMPLETE month.
  //
  // These ran Jan–Jun because the six keys were typed out here, so in August
  // the chart still stopped at June and looked like the year had ended. The
  // window now derives from the calendar and rolls on the 1st.
  //
  // A month the snapshot has no column for plots as a GAP rather than being
  // dropped off the end: "July, and we don't have it yet" is the truth, where
  // a chart that quietly stops at June says the year is six months long.
  const windowMonths = monthsThisYearToDate();

  /**
   * The months the hand-typed snapshot never covered, filled from PayProp.
   *
   * The snapshot runs Jan–Jun. Everything after it is live or it is nothing —
   * and "nothing" has to render as a dash, never a zero. Licence and joining
   * fees genuinely cannot be filled this way: they don't run through PayProp,
   * and joining fees don't even run through an account we can see.
   */
  const [liveMonths, setLiveMonths] = useState<{
    rows: Record<string, Record<string, number | null>>;
    filled: string[];
    pending?: string[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/business/income-months", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && d?.rows && setLiveMonths({ rows: d.rows, filled: d.filled ?? [], pending: d.pending ?? [] }))
      .catch(() => {
        /* The snapshot alone is still a table. */
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The table, built from PayProp alone.
   *
   * This used to start from a hand-typed Jan–Jun table and let live figures
   * fill only the BLANKS — "the snapshot wins where it exists". Which meant
   * Jan–Jun could never update: PayProp would walk the month, come back with a
   * number, and be discarded because a person had typed one in July. Six
   * months of this table were permanently frozen to the capture, and looked
   * exactly like the live months beside them.
   *
   * A month PayProp cannot fully answer stays null and renders as a dash. That
   * is the honest state and it is visibly different from a figure.
   */
  const monthlyRows = useMemo(() => {
    const short = (m: string) =>
      new Date(`${m}-01T00:00:00Z`)
        .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
        .toLowerCase();

    /* Which months PayProp actually ANSWERED, by MM. `filled` is the
       authority here, not whether a given cell happens to be non-null: the
       route nulls a genuine zero (`... || null`), so an account that billed
       nothing in March is indistinguishable from March never having loaded.
       Asking "did this month land?" once, at the month level, avoids reading
       that ambiguity as a gap. */
    const filled = liveMonths?.filled ?? [];
    const filledMM = new Set(filled.map((m) => m.slice(5)));
    const nothingOutstanding = Boolean(liveMonths) && (liveMonths?.pending?.length ?? 1) === 0;

    /**
     * A total, or null — never a partial sum.
     *
     * Two separate reasons to decline, and both matter:
     *
     *  · a month in the span hasn't landed. Adding up what HAS landed gives a
     *    quarter that is simply too small, with nothing on its face to say so.
     *    That is the same failure as the part-month August column, and it is
     *    the shape of every discrepancy this dashboard has been caught by.
     *  · the metric has no source at all. Licence, pro and joining fees never
     *    come from PayProp, so every cell is null and the sum is 0 — which
     *    would state that TLE earned nothing in licence fees, a confident and
     *    false claim where a dash says the true thing.
     *
     * Past those two, a null cell inside a month that DID land is a real zero,
     * so it adds as zero.
     */
    const total = (
      row: Record<string, unknown>,
      keys: string[],
      complete: boolean
    ): number | null => {
      if (!complete) return null;
      const values = keys.map((k) => row[k]);
      if (!values.some((v) => typeof v === "number")) return null;
      return values.reduce<number>(
        (t, v) => t + (typeof v === "number" ? v : 0),
        0
      );
    };

    return METRIC_ROWS.map((metric) => {
      const row: Record<string, unknown> = { metric };
      const live = liveMonths?.rows[metric];
      if (live) {
        for (const [month, value] of Object.entries(live)) row[short(month)] = value;
      }

      /* The quarter and YTD columns have been rendered since the port and
         assigned by nobody, so they have shown a dash in every row on every
         load. The columns were derived from the calendar; the figures behind
         them were never derived from anything. */
      for (const q of QUARTERS) {
        row[q.key] = total(
          row,
          q.months.map((mm) => short(`2000-${mm}`)),
          q.months.every((mm) => filledMM.has(mm))
        );
      }
      row.ytd = total(row, filled.map(short), nothingOutstanding);

      return row as MonthlyRow;
    });
  }, [liveMonths]);

  /* Which months this table could actually answer for. It used to say
     "months after June", off a hardcoded `> 6` — so in 2027 it would have
     called January a snapshot month forever. Now it just reports what landed
     against what was asked, which needs no calendar knowledge at all. */
  const filledMonths = liveMonths?.filled ?? [];
  const pendingMonths = liveMonths?.pending ?? [];
  const liveMonthsNote = liveMonths
    ? `${filledMonths.length} of ${filledMonths.length + pendingMonths.length} months walked from PayProp, net of VAT.${
        pendingMonths.length
          ? ` Still fetching ${pendingMonths.map((m) => monthLabel(m)).join(", ")}.`
          : ""
      } Licence, pro and joining fees are blank throughout — they don't run through PayProp, and joining fees go through a separate account we can't read.${
        /* Without this sentence a dashed quarter reads as a fault rather than
           a refusal to guess, and the natural next move is to go looking for
           the figure somewhere less careful. */
        pendingMonths.length
          ? " A quarter or YTD total only appears once every month inside it has landed, so some are dashed until the rest arrive."
          : ""
      }`
    : null;

  const gciRow = monthlyRows.find((r) => r.metric === "Combined GCI (exc VAT)");
  /* NOT "TOTAL INCOME". That row existed only in the hand-keyed capture — it
     is GCI plus licence, pro and joining fees, and PayProp cannot see the last
     three (they run through a separate bank account). The live row set has no
     equivalent, so this plots what we can actually measure: TLE's retained
     share. The heading below says so. */
  const totalRow = monthlyRows.find((r) => r.metric === "Combined Net Income to TLE");
  const monthKeys = windowMonths.map((m) =>
    new Date(`${m}-01T00:00:00Z`)
      .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
      .toLowerCase()
  );
  const barLabels = monthKeys.map((k) => k[0].toUpperCase() + k.slice(1));
  const rangeLabel = barLabels.length
    ? `Jan–${barLabels[barLabels.length - 1]} ${windowMonths[0].slice(0, 4)}`
    : "this year";
  const cell = (row: unknown, k: string) =>
    ((row as Record<string, number | null> | undefined)?.[k] ?? null);
  const barSeries = [
    {
      name: "Combined GCI (exc VAT)",
      color: "#E31F36",
      values: monthKeys.map((k) => cell(gciRow, k)),
    },
    {
      name: "Net income to TLE",
      color: "#101014",
      values: monthKeys.map((k) => cell(totalRow, k)),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Source banner */}
      {live ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <span className="font-semibold">Live from PayProp</span> — {monthLabel(month)}{" "}
          agency income across {live.paymentCount.toLocaleString("en-GB")} payments.
          Derived from the all-payments report (the agency&rsquo;s own share), since
          the dedicated agency-income report needs a scope we weren&rsquo;t granted.
        </div>
      ) : (
        /* NO SNAPSHOT. It used to fill this gap with 11 Jul 2026 figures and
           say "until they land" — so a screen that had loaded NOTHING looked
           identical to one that had loaded everything, and the numbers were
           built for a month that has since passed. James: "get rid of the
           snapshot completely and stop falling back on it."
           
           What replaces it is the truth, with a denominator: how many months
           are ready, which are still coming, and roughly how long that takes.
           PayProp pages at 25 rows, so one cold month is ~1,400 rows and
           genuinely takes minutes. Saying so is the difference between waiting
           and wondering whether it is broken. */
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <p>
            <span className="font-semibold">
              Still fetching {monthLabel(month)} from PayProp.
            </span>{" "}
            Nothing is shown in its place — an old figure here would be worse than a gap.
          </p>
          {liveMonths && (
            <>
              <p className="mt-1.5 text-[12px]">
                {liveMonths.filled.length} of {liveMonths.filled.length + (liveMonths.pending?.length ?? 0)}{" "}
                months ready
                {liveMonths.pending?.length
                  ? ` · still coming: ${liveMonths.pending.map(monthLabel).join(", ")}`
                  : ""}
                .
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                <div
                  className="h-full rounded-full bg-amber-500 transition-[width] duration-500"
                  style={{
                    width: `${Math.round(
                      (liveMonths.filled.length /
                        Math.max(1, liveMonths.filled.length + (liveMonths.pending?.length ?? 0))) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11.5px]">
                A month PayProp has not been asked for before takes a few minutes — it pages at
                25 rows and a month is around 1,400 of them. Once fetched it is kept, so this is
                slow once rather than slow always.
              </p>
            </>
          )}
        </div>
      )}

      {live ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{monthLabel(month)} — live from PayProp</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Agency income (GCI)"
              stat={{ value: Math.round(live.agencyIncome), display: gbp(live.agencyIncome), source: "live-payprop", note: `TLE's own share of the fees, across ${live.paymentCount} payments.` }}
              big
            />
            <StatCard
              label="Paid to partners"
              stat={{ value: Math.round(live.paidToBeneficiaries), display: gbp(live.paidToBeneficiaries), source: "live-payprop", note: "The partners' share of the same fees." }}
              big
            />
            <StatCard
              label="Rent to landlords"
              stat={{ value: Math.round(live.ownerPayments), display: gbp(live.ownerPayments), source: "live-payprop", note: "Rent passed through to owners — volume, not income." }}
              big
              sub="Passed through, not income"
            />
            <StatCard
              label="Move-ins"
              stat={
                moveIns
                  ? { value: moveIns.count, source: "live-payprop", note: "Rent schedules starting this month." }
                  : { value: null, source: "live-payprop" }
              }
              big
              sub={moveIns ? `${gbp(moveIns.rentAdded)} rent added` : "Tenancies starting"}
            />
          </div>

          <div className="card p-5">
            <h3 className="text-[13px] font-semibold">Agency income by fee type</h3>
            <div className="mt-3 space-y-1.5">
              {live.byCategory.map((c) => (
                <div key={c.category} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {c.category}
                  </span>
                  <span className="h-1.5 rounded-full bg-accent/70"
                    style={{ width: `${Math.max(4, (c.amount / live.agencyIncome) * 160)}px` }} />
                  <span className="shrink-0 text-[12.5px] font-semibold text-ink tnum">
                    {gbp(c.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* A FLOW tab: the month selector genuinely re-queries the source, so
          most figures below really are {monthLabel(month)}. The warning is
          only about the ones still on the seed, which stay badged and dated
          — the old wording condemned the whole tab as stale, including the
          live figures it had just fetched for the selected month. */}
      {/* A banner stood here telling the reader that anything badged
          "snapshot" was really 11 Jul 2026. There is no such badge any more —
          the capture is gone and the source is retired — so it was pointing at
          something that does not exist, while implying the remaining dashes
          were July figures rather than nothing at all. Each figure carries its
          own source; a page-wide disclaimer only competed with them. */}

      {/* Estimates for the selected month */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{monthLabel(month)} — estimates</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label={live ? "Combined GCI" : "Combined GCI (est)"}
            stat={
              live
                ? {
                    value: Math.round(exVat(live.combinedGci)),
                    display: netGbp(live.combinedGci),
                    source: "live-payprop",
                    note: `Every fee charged this month across both agencies, exc VAT, ${live.paymentCount} payments. TLE's share plus the partners'.`,
                  }
                : liveGciEst ?? gap("Waiting on this month's PayProp walk.")
            }
            sub={
              live
                ? `${netGbp(live.agencyIncome)} TLE · ${netGbp(live.paidToBeneficiaries)} partners, exc VAT`
                : liveGciEst && liveMoveIns != null
                  ? `${liveMoveIns} live move-ins × £1,200 avg`
                  : undefined
            }
            big
          />
          <StatCard label="E&W GCI" stat={accountGci(live, "E&W") ?? gap("Waiting on this month's PayProp walk.")} />
          <StatCard label="Glasgow GCI" stat={accountGci(live, "Glasgow") ?? gap("Waiting on this month's PayProp walk.")} />
          <StatCard
            label="TLE net income"
            stat={
              live
                ? { value: Math.round(live.agencyIncome), display: gbp(live.agencyIncome), source: "live-payprop", note: "Fees kept by the agency this month." }
                : gap("Waiting on this month's PayProp walk.")
            }
          />
          <StatCard
            label="Paid to associates"
            stat={
              live
                ? { value: Math.round(live.paidToBeneficiaries), display: gbp(live.paidToBeneficiaries), source: "live-payprop", note: "Fees paid out to partners this month." }
                : gap("Waiting on this month's PayProp walk.")
            }
          />
          {/* A tile labelled "June final GCI" sat here, inside a section headed
              with the SELECTED month — a fixed month masquerading as a moving
              one. The previous month's finals have their own section below. */}
        </div>
      </section>

      {/* Split donut + June finals */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">TLE / partner split — {monthLabel(month)} est</h2>
          <div className="mt-4">
            {/* A donut of two nulls draws itself as an empty ring and reads as
                "nothing earned". Say there is no figure instead. */}
            {live ? (
              <Donut
                segments={[
                  { label: "TLE net", value: Math.round(live.agencyIncome), color: "#E31F36" },
                  { label: "Associates", value: Math.round(live.paidToBeneficiaries), color: "#101014" },
                ]}
                centerLabel={gbp(live.combinedGci)}
              />
            ) : (
              <p className="text-[12.5px] text-muted">
                No live split yet — this needs the month&rsquo;s PayProp figures, which are
                fetching above.
              </p>
            )}
          </div>
          {/* A hand-typed sentence ("TLE £4,800 (47%) · Associates £5,400…")
              sat here, under a donut drawn from live figures. It described
              July and never moved, so the caption and the chart above it
              disagreed. The donut labels its own segments. */}
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">{prevLabel} — final</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* These fell back to inc.june.* — literally June's figures, under a
                heading that renders the PREVIOUS month's name. On 28 August that
                put June's £44,309 under "July 2026 — final". The fallback is
                gone; the live figure or a dash. */}
            <StatCard label="Total GCI" stat={pv("totalGci") ?? gap(`${prevLabel} hasn't been walked from PayProp yet.`)} />
            <StatCard
              label="Total income"
              stat={gap("GCI plus licence and joining fees. Licence fees need the P&L upload and joining fees run through a separate bank account, so this can't be totalled live yet.")}
            />
            <StatCard label="TLE net income" stat={pv("tleNet") ?? gap(`${prevLabel} hasn't been walked from PayProp yet.`)} />
            <StatCard label="GCI per agent" stat={pv("gciPerAgent") ?? gap(`${prevLabel} hasn't been walked from PayProp yet.`)} />
            <StatCard
              label="Net income per agent"
              stat={pv("netPerAgent") ?? gap(`${prevLabel} hasn't been walked from PayProp yet.`)}
            />
            <StatCard
              label="TLE split of E&W GCI"
              stat={splitStat}
              sub={
                splitStat.value != null
                  ? `Partners ${100 - splitStat.value}%${splitPartnerNet ? ` — ${splitPartnerNet}` : ""}`
                  : undefined
              }
            />
            <StatCard label="Monthly licence" stat={gap("Licence fees don't run through PayProp. Needs the P&L upload.")} />
            <StatCard label="Pro licence" stat={gap("Licence fees don't run through PayProp. Needs the P&L upload.")} />
            <StatCard label="Joining fees" stat={gap("Joining fees run through a separate bank account we can't read — Barclays/QuickBooks only.")} />
          </div>
        </section>
      </div>

      {/* Monthly income table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          TLE business income — {rangeLabel} (all fees exc VAT)
        </h2>
        <DataTable columns={monthlyColumns(windowMonths)} rows={monthlyRows} compact />
        {liveMonthsNote && <p className="text-xs text-muted">{liveMonthsNote}</p>}
      </section>

      {/* The heading has to name what is actually plotted. It said "total
          income" over a series that is TLE's net share — roughly 60% lower —
          which is precisely the shape of a reconciliation discrepancy: the
          layout looks right and the number is a different measure. */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">
          Combined GCI vs net income to TLE — {rangeLabel}
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          Net income to TLE, not total income. Licence, pro and joining fees run through a
          separate bank account, so PayProp cannot see them and no live total exists yet.
        </p>
        <div className="mt-4">
          <Bars labels={barLabels} series={barSeries} format={(n) => `£${formatNum(n / 1000)}k`} />
        </div>
      </section>

      {/* The licence-fee table and the year-on-year growth chips stood here.
          Both were hand-typed in July with no live path of any kind: licence
          fees never touch PayProp, and the YoY percentages were worked out
          once, by a person, against figures we can no longer reproduce.

          They are not coming back as literals. Licence fees arrive with the
          P&L upload; year-on-year needs two comparable years of measured GCI,
          and we have measured from Aug 2026 only. */}
      <section className="card space-y-2 p-5">
        <h2 className="text-sm font-semibold">Licence fees and year-on-year growth</h2>
        <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Not shown yet. Licence and joining fees don&rsquo;t run through PayProp — they need
          the P&amp;L upload before they can be reported. Year-on-year growth needs two full
          years measured the same way, and the portal has measured its own figures since
          August 2026.
        </p>
      </section>
    </div>
  );
}
