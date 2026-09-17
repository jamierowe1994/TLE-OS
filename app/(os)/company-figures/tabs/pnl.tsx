"use client";

// Admin tab: P&L - the year, month by month.
//
// Rebuilt 17 Sep 2026. It was a typed copy of a November 2025 H2 draft with a
// July column you could overwrite. Now:
//   · commission income for every month that has happened is PayProp, worked
//     out by the OS, with Susan's own figure beneath it to read against;
//   · every cost is her uploaded sheet, because the accounts are the only place
//     those costs exist;
//   · months still to come are her forecast, and say so.
// See lib/business/pnl-build.ts for which line is answered by which source.

import { useCallback, useEffect, useState } from "react";
import StatCard from "@/components/business/StatCard";
import PlanUpload from "@/components/business/PlanUpload";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { PnlYear, PnlRow, PnlColumn } from "@/lib/business/pnl-build";
import { formatGBP, formatDate } from "@/lib/business/format";

const SHORT = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

function money(v: number | null, pct = false): string {
  if (v == null) return "-";
  if (pct) return `${v.toFixed(0)}%`;
  const s = formatGBP(Math.abs(Math.round(v)));
  return v < 0 ? `(${s})` : s;
}

const GROUP_TITLE: Partial<Record<PnlRow["group"], string>> = {
  income: "Income",
  cos: "Cost of sales",
  expenditure: "Expenditure",
};

export default function PnlTab({ month }: { month: string; seed: SeedData }) {
  const year = Number(month.slice(0, 4));
  const [data, setData] = useState<PnlYear | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/business/pnl?year=${year}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as PnlYear);
    } catch {
      setError("The P&L couldn't be put together. Refresh to try again.");
    }
  }, [year]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{error}</p>;
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted" aria-busy="true">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
        Putting the P&amp;L together
      </div>
    );
  }

  const t = data.tiles;
  const closedLabel = t.closedMonths ? `Jan to ${SHORT(data.columns[t.closedMonths - 1].month)} ${year}` : "No closed months yet";
  const diff = (a: number | null, b: number | null) =>
    a == null || b == null ? null : `${a - b >= 0 ? "+" : "-"}${formatGBP(Math.abs(Math.round(a - b)))} against the accounts and sheet`;

  return (
    <div className="space-y-6">
      {!data.plan ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <span className="font-semibold">No year plan uploaded.</span> Income below is live from PayProp. Costs and the
          forecast months come from Susan&rsquo;s sheet, so they stay blank until it is uploaded.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Net profit / (loss) YTD"
          big
          stat={{
            value: t.netYtd,
            display: t.netYtd == null ? undefined : money(t.netYtd),
            source: "derived",
            note: "PayProp commission income less the costs on Susan's sheet, for every closed month.",
          }}
          sub={diff(t.netYtd, t.netYtdSheet) ?? closedLabel}
        />
        <StatCard
          label="Commission income YTD"
          big
          stat={{
            value: t.incomeYtd,
            display: t.incomeYtd == null ? undefined : money(t.incomeYtd),
            source: "live-payprop",
            note: "Every fee charged, both agencies, net of VAT, from PayProp.",
          }}
          sub={diff(t.incomeYtd, t.incomeYtdSheet) ?? closedLabel}
        />
        <StatCard
          label="Gross margin YTD"
          stat={{
            value: t.grossMarginYtd,
            display: t.grossMarginYtd == null ? undefined : `${t.grossMarginYtd.toFixed(1)}%`,
            source: "derived",
            note: "Gross profit over commission income, closed months.",
          }}
          sub={closedLabel}
        />
        <StatCard
          label={`Full year ${year} outlook`}
          stat={{
            value: t.fullYearOutlook,
            display: t.fullYearOutlook == null ? undefined : money(t.fullYearOutlook),
            source: "derived",
            note: "Net profit so far, plus Susan's forecast for this month and every month after it.",
          }}
          sub="Actual so far plus the plan"
        />
      </div>
      {t.missingMonths.length ? (
        <p className="text-[12px] text-red-700">
          PayProp hasn&rsquo;t answered in full for {t.missingMonths.map(SHORT).join(", ")}, so the year-to-date figures
          are held back rather than shown short.
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>{year} Month by Month</h2>
            <p className="mt-1 text-[12px] text-muted">
              <Key tone="payprop" /> PayProp, worked out here &nbsp; <Key tone="accounts" /> the accounts &nbsp; <Key tone="sheet" /> Susan&rsquo;s sheet &nbsp;
              <span className="italic">Italic</span> = a forecast on her sheet
            </p>
          </div>
          <PlanUpload year={year} current={data.plan} onSaved={load} />
        </div>

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1100px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-semibold">&nbsp;</th>
                {data.columns.map((c) => (
                  <th key={c.month} className="px-2.5 py-3 text-right font-semibold">
                    <div>{SHORT(c.month)}</div>
                    <div className={`mt-0.5 text-[9.5px] font-semibold ${c.kind === "mtd" ? "text-accent-dark" : "text-muted/70"}`}>
                      {c.kind === "actual" ? "Actual" : c.kind === "mtd" ? "So far" : "Plan"}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">Year</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => {
                // A heading where a group starts; comparison rows belong to the row above.
                const prev = data.rows.slice(0, i).reverse().find((x) => x.group !== "compare");
                const title = r.group !== "compare" && GROUP_TITLE[r.group] && prev?.group !== r.group ? (GROUP_TITLE[r.group] ?? null) : null;
                return (
                  <Row key={r.key} row={r} columns={data.columns} title={title} />
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted">
          Fees for closed months are PayProp&rsquo;s, net of VAT, never the accounts&rsquo; figure: the accounts sit
          underneath to read against. Every cost comes from the accountant&rsquo;s P&amp;L where it has been uploaded, and
          from Susan&rsquo;s sheet for the months after, because the accounts are the only place costs exist. Agent
          commission included: PayProp only sees partners it pays, and Glasgow&rsquo;s are paid outside it, so what
          PayProp paid out is shown for comparison but not used. This month&rsquo;s profit is left blank until the
          month closes - part of a month&rsquo;s income against a whole month&rsquo;s costs is not a result.
          {data.plan ? ` Last upload ${formatDate(data.plan.importedAt)} by ${data.plan.importedBy}.` : ""}
          {data.plan?.accountsMonths.length ? ` Accounts cover ${data.plan.accountsMonths.map(SHORT).join(", ")}.` : ""}
        </p>
      </section>
    </div>
  );
}

function Key({ tone }: { tone: "payprop" | "sheet" | "accounts" }) {
  return (
    <span
      className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${tone === "payprop" ? "bg-green-500" : tone === "accounts" ? "bg-[#56423e]" : "bg-amber-400"}`}
      aria-hidden
    />
  );
}

function Row({ row, columns, title }: { row: PnlRow; columns: PnlColumn[]; title: string | null }) {
  const compare = row.group === "compare";
  const strong = row.emphasis;
  const netRow = row.group === "net";
  return (
    <>
      {title ? (
        <tr>
          <td colSpan={columns.length + 2} className="sticky left-0 bg-card px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {title}
          </td>
        </tr>
      ) : null}
      <tr className={`${strong ? "border-t border-line" : ""} ${netRow && strong ? "bg-accent-soft/50" : ""}`}>
        <td
          className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2 ${netRow && strong ? "bg-[color-mix(in_srgb,var(--accent-soft)_50%,var(--card))]" : "bg-card"} ${
            compare ? "pl-7 text-[11.5px] text-muted" : strong ? "font-semibold text-ink" : "text-ink"
          }`}
        >
          {row.label}
        </td>
        {columns.map((c) => {
          const cell = row.cells[c.month];
          const forecast = cell?.source === "sheet" && c.sheetBasis === "forecast";
          return (
            <td
              key={c.month}
              className={`px-2.5 py-2 text-right tnum ${compare ? "text-[11.5px] text-muted" : strong ? "font-semibold" : ""} ${
                forecast ? "italic" : ""
              } ${cell?.value != null && cell.value < 0 && !row.pct ? "text-red-700" : ""}`}
              title={
                cell?.source === "payprop"
                  ? "PayProp, worked out here"
                  : cell?.source === "accounts"
                    ? "The accountant's P&L"
                    : cell?.source === "sheet"
                    ? forecast
                      ? "Susan's sheet - forecast"
                      : "Susan's sheet"
                    : undefined
              }
            >
              <span className="inline-flex items-center justify-end gap-1">
                {cell?.source === "payprop" && !compare ? <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden /> : null}
                {money(cell?.value ?? null, row.pct)}
              </span>
            </td>
          );
        })}
        <td className={`px-4 py-2 text-right tnum ${strong ? "font-semibold" : ""} ${compare ? "text-[11.5px] text-muted" : ""}`}>
          {row.pct ? "" : money(row.total)}
        </td>
      </tr>
    </>
  );
}
