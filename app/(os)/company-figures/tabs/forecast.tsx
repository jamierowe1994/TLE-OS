"use client";

// Admin · Forecast tab - THE ROLL-UP. Live sum of every agent's self-set
// forecast for the month via /api/admin/forecasts, which returns
// { month, rows, rollup, actualMtd, predictedMonthEnd, varianceVsForecast }
// with one row per ACTIVE roster agent: { agentKey, displayName, userLinked,
// forecast: AgentForecast | null }. The roll-up, actual MTD, predicted
// month-end and variance are computed server-side and rendered as-is here;
// plus the Business Value cards, baseline costs and H2 reforecast P&L from
// the (admin-gated) seed.

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import StatCard from "@/components/business/StatCard";
import SusanForecast from "@/components/business/SusanForecast";
import SourceNote from "@/components/business/SourceNote";
import { Bars } from "@/components/business/charts/Bars";
import DataTable from "@/components/business/DataTable";
import Link from "next/link";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { YearPlan } from "@/lib/business/plan-import";
import type { AgentForecast, StatValue } from "@/lib/business/types";
import {
  formatDate,
  formatGBP,
  formatNum,
  formatPct,
  monthLabel,
  previousMonth,
} from "@/lib/business/format";

/** Just the slice of /api/admin/payprop-live the business-value block needs. */
interface ForecastSeries {
  months: string[];
  rows: Array<{
    month: string;
    susan: number | null;
    partners: number | null;
    actual: number | null;
    agentsForecasted: number;
  }>;
}

interface LivePayProp {
  income?: {
    byCategory?: Array<{ category: string; amount: number }>;
    /** Commission TLE kept - the TLE side of the split. Net of VAT. */
    agencyIncome?: number;
    /** Every fee charged, whoever received it. Net of VAT. */
    combinedGci?: number;
    /** Paid out to partners - the partner side of the split. Net of VAT. */
    paidToBeneficiaries?: number;
    /** Partners who actually earned a fee this month: the honest denominator
     *  for "per trading partner", rather than everyone on the roster. */
    agentsEarning?: number;
  } | null;
  portfolio?: {
    totalRentRoll?: number;
    totalProperties?: number;
    byServiceLevel?: Array<{ level: string; properties: number }>;
  } | null;
}

/* ------------------------------ helpers ------------------------------ */

function money(value: number | null | undefined, pence = false): ReactNode {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 0) {
    return (
      <span className="text-red-600">({formatGBP(Math.abs(value), pence)})</span>
    );
  }
  return formatGBP(value, pence);
}

function SectionTitle({
  children,
  source,
}: {
  children: ReactNode;
  source?: string;
}) {
  return (
    <div className="mb-3 mt-8 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide">{children}</h2>
      {source ? (
        <p className="mt-0.5 text-[11px] text-muted">Source: {source}</p>
      ) : null}
    </div>
  );
}

/* ----------------------- /api/admin/forecasts payload ----------------------- */

interface AdminForecastRow {
  agentKey: string;
  displayName: string;
  userLinked: boolean;
  forecast: AgentForecast | null;
}

interface ForecastRollup {
  totalGciTarget: number;
  totalMoveInsTarget: number;
  totalMaTarget: number;
  agentsForecasted: number;
  agentsTotal: number;
}

interface ForecastsPayload {
  month: string;
  rows: AdminForecastRow[];
  rollup: ForecastRollup;
  actualMtd: StatValue;
  predictedMonthEnd: StatValue;
  varianceVsForecast: StatValue;
}

function isForecastsPayload(payload: unknown): payload is ForecastsPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return Array.isArray(obj.rows) && !!obj.rollup && typeof obj.rollup === "object";
}

/* --------------------------------- tab --------------------------------- */

export default function Forecast({ month, seed }: { month: string; seed: SeedData }) {
  const [data, setData] = useState<ForecastsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/business/forecasts?month=${encodeURIComponent(month)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Forecasts fetch failed (${res.status})`);
      const payload: unknown = await res.json();
      if (!isForecastsPayload(payload)) throw new Error("Unexpected payload");
      setData(payload);
    } catch {
      setError("Couldn't load agent forecasts.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.rows ?? [];
  const rollup: ForecastRollup = data?.rollup ?? {
    totalGciTarget: 0,
    totalMoveInsTarget: 0,
    totalMaTarget: 0,
    agentsForecasted: 0,
    agentsTotal: 0,
  };

  const forecastTableRows = rows.map((r) => ({
    agent: r.displayName,
    linked: r.userLinked ? "Linked" : "No portal account",
    isLinked: r.userLinked,
    gciTarget: r.forecast?.gciTarget ?? null,
    moveInsTarget: r.forecast?.moveInsTarget ?? null,
    maTarget: r.forecast?.maTarget ?? null,
    notes: r.forecast?.notes ?? "",
    updatedAt: r.forecast?.updatedAt ?? null,
  }));

  /* ------------------------- business value, live -------------------------
     Rent roll and management fees were the June snapshot. Both are reachable,
     but they are DIFFERENT KINDS of figure and the section had been treating
     them as one:

       Management fees are a FLOW - they belong to a month, and July is the
       last month that finished, so July is what we ask for.

       Rent roll is a STOCK - what the book is worth right now. PayProp keeps
       no history of it, so "the rent roll at the end of July" does not exist
       anywhere and cannot be recovered. Today's is the honest answer, and it
       says so rather than being labelled July.

     Licence income and partner joining fees are in NEITHER: joining fees run
     through a separate bank account (Barclays/QuickBooks only) and licence
     income is in no connected system. MRI is therefore management fees only
     until the P&L upload lands, and is marked short rather than quietly
     understated. */
  /* The three forecasts side by side. Susan sets one for the business, the
     partners each set their own, and the month produces a third. They lived in
     three places and nobody could say whether the first two agreed - which was
     the entire question being asked. */
  const [series, setSeries] = useState<ForecastSeries | null>(null);
  const loadSeries = useCallback(async () => {
    try {
      const r = await fetch("/api/business/forecast-series?months=12", { cache: "no-store" });
      if (r.ok) setSeries((await r.json()) as ForecastSeries);
    } catch {
      /* leave it empty - an absent chart beats an invented one */
    }
  }, []);
  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  const [live, setLive] = useState<LivePayProp | null>(null);
  const fees = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/business/payprop-live?month=${encodeURIComponent(previousMonth())}`,
        { cache: "no-store" }
      );
      if (!r.ok) return;
      const d: unknown = await r.json();
      if (d && typeof d === "object") setLive(d as LivePayProp);
    } catch {
      /* leave the snapshot showing - a missing live read is not a zero */
    }
  }, []);
  useEffect(() => {
    void fees();
  }, [fees]);

  /* Susan's uploaded year sheet - the only place the costs live. */
  const [plan, setPlan] = useState<YearPlan | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    fetch(`/api/business/plan?year=${previousMonth().slice(0, 4)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { plan: null }))
      .then((d: { plan: YearPlan | null }) => !off && setPlan(d.plan))
      .catch(() => !off && setPlan(null));
    return () => {
      off = true;
    };
  }, []);

  const susanThisMonth =
    series?.rows.find((r) => r.month === month)?.susan ?? null;

  const feeMonth = previousMonth();
  const cats = live?.income?.byCategory ?? [];
  const sumCats = (names: string[]) =>
    cats.filter((c) => names.includes(c.category)).reduce((t, c) => t + c.amount, 0);
  const liveMgmtFees = cats.length
    ? sumCats([
        "Management Fee",
        "Monthly Management Fee",
        "First Month Management Fee",
        "Management Fee - Investor Services",
      ])
    : null;
  const liveSetUp = cats.length ? sumCats(["Set Up Fee"]) : null;
  const rentRoll = live?.portfolio?.totalRentRoll ?? null;
  /* MANAGED homes, not the whole book: this divided management fees by all 586
     properties, let-only included, which halved the per-property figure. */
  const levels = live?.portfolio?.byServiceLevel;
  const managed = levels ? levels.filter((l) => /managed/i.test(l.level)).reduce((t, l) => t + l.properties, 0) : null;
  /* Licence income is on Susan's sheet (as a negative cost), not in PayProp. */
  const licenceRaw = plan?.lines.licenceFeeIncome?.[previousMonth()] ?? null;
  const licence = licenceRaw == null ? null : Math.abs(licenceRaw);
  const inc = live?.income ?? null;
  // Recurring is the management fee; everything else charged in the month is
  // one-off by definition - set-up, let-only, transfers. Derived by subtraction
  // rather than by naming categories, so a fee type PayProp adds tomorrow lands
  // in one-off instead of vanishing from the total.
  const liveOneOff =
    inc?.combinedGci != null && liveMgmtFees != null
      ? Math.max(0, inc.combinedGci - liveMgmtFees)
      : null;
  const liveTotalIncome = inc?.combinedGci ?? null;
  const perProperty =
    liveMgmtFees != null && managed ? liveMgmtFees / managed : null;
  const pctOfRentRoll =
    liveMgmtFees != null && rentRoll ? (liveMgmtFees / rentRoll) * 100 : null;
  const perPartner =
    liveMgmtFees != null && inc?.agentsEarning
      ? liveMgmtFees / inc.agentsEarning
      : null;
  const SHORT =
    " Short by licence income, which is in no connected system until the P&L is uploaded.";

  const liveStat = (
    value: number | null,
    display: string,
    note: string
  ): StatValue | null =>
    value == null ? null : { value, display, source: "live-payprop", note, asOf: feeMonth };

  /* No typed fallbacks. These used to fall back to May's figures from the
     capture while PayProp loaded, and to "362 managed properties" underneath. */
  const waiting: StatValue = { value: null, source: "unavailable", note: "PayProp didn't return this for the month." };
  const loadingLive = live == null;

  return (
    <div>
      {/* ------------------------- roll-up hero ------------------------- */}
      <SectionTitle source="Agent-set forecasts, live from the portal · actuals from PayProp, with manual override">
        Partner Forecast Roll-up - {monthLabel(month)}
      </SectionTitle>

      {error ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          big
          label={`Partners forecast for ${monthLabel(month)}`}
          stat={{
            value: rollup.totalGciTarget,
            display: formatGBP(rollup.totalGciTarget),
            source: "manual",
            note: "Live sum of agent-set GCI targets from the portal forecast store",
          }}
          sub={`${rollup.agentsForecasted} forecast${rollup.agentsForecasted === 1 ? "" : "s"} · ${formatNum(rollup.totalMoveInsTarget)} move-ins · ${formatNum(rollup.totalMaTarget)} MAs targeted`}
        />
        <StatCard
          big
          label={`Susan's forecast for ${monthLabel(month)}`}
          stat={{
            value: susanThisMonth,
            display: susanThisMonth == null ? "—" : formatGBP(susanThisMonth),
            source: "manual",
            note: "Set by hand on this tab and stored with the other manual figures. Not derived from anything - it is the number Susan expects.",
          }}
          sub={
            susanThisMonth == null
              ? "Not set for this month"
              : rollup.totalGciTarget
                ? `${susanThisMonth >= rollup.totalGciTarget ? "Above" : "Below"} the partners' roll-up by ${formatGBP(Math.abs(susanThisMonth - rollup.totalGciTarget))}`
                : "No partner forecasts to compare with yet"
          }
        />
        <StatCard
          big
          label="Actual MTD (combined GCI)"
          stat={data?.actualMtd ?? { value: null, source: "unavailable", note: "Month-to-date actuals haven't loaded." }}
        />
        <StatCard
          big
          label="Predicted month-end"
          stat={data?.predictedMonthEnd ?? { value: null, source: "derived" }}
          sub="Actual MTD ÷ fraction of the month elapsed - straight run rate"
        />
        <StatCard
          big
          label="Variance vs forecast"
          stat={data?.varianceVsForecast ?? { value: null, source: "derived" }}
          sub={
            data?.varianceVsForecast?.value == null
              ? "Needs both a forecast total and an actual run rate"
              : data.varianceVsForecast.value < 0
                ? "Tracking behind partners' forecast at current run rate"
                : "Tracking ahead of partners' forecast at current run rate"
          }
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SusanForecast month={month} current={susanThisMonth} onSaved={loadSeries} />
      </div>

      {series && series.rows.some((r) => r.susan != null || r.partners != null) ? (
        <>
          <SectionTitle>
            Forecast vs forecast vs actual
          </SectionTitle>
          <div className="card p-5">
            <div className="mb-2 text-xs text-muted">
              Do the two forecasts agree, and does either one land?
              <SourceNote tone="derived">
                Susan&rsquo;s figure and the partners&rsquo; roll-up are both typed by
                people; the actual is live from PayProp, net of VAT. A month nobody
                forecast is left blank rather than drawn as zero - &ldquo;nobody has
                said yet&rdquo; and &ldquo;they forecast nothing&rdquo; are different
                claims.
              </SourceNote>
            </div>
            <Bars
              labels={series.rows.map((r) => monthLabel(r.month).slice(0, 3))}
              series={[
                { name: "Susan", color: "#56423e", values: series.rows.map((r) => r.susan) },
                { name: "Partners", color: "#cfa096", values: series.rows.map((r) => r.partners) },
                { name: "Actual", color: "#8d9b78", values: series.rows.map((r) => r.actual) },
              ]}
              format={(n) => `£${Math.round(n / 1000)}k`}
              height={240}
              details={series.rows.map((r) => [
                ["Susan", r.susan == null ? "not set" : formatGBP(r.susan)],
                ["Partners", r.partners == null ? "none set" : formatGBP(r.partners)],
                ["Actual", r.actual == null ? "—" : formatGBP(r.actual)],
                ["Partners forecasting", String(r.agentsForecasted)],
              ])}
            />
          </div>
        </>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        {loading
          ? "Loading forecasts…"
          : `${rollup.agentsForecasted} of ${rollup.agentsTotal} active agents have set a forecast for ${monthLabel(month)}.`}
      </p>

      <SectionTitle>Agent forecasts - {monthLabel(month)}</SectionTitle>
      <DataTable
        columns={[
          { key: "agent", label: "Agent" },
          {
            key: "linked",
            label: "Portal account",
            render: (row) => (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  row.isLinked
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-gray-200 bg-gray-100 text-gray-500"
                }`}
              >
                {String(row.linked)}
              </span>
            ),
          },
          {
            key: "gciTarget",
            label: "GCI target",
            align: "right",
            render: (row) => money(row.gciTarget as number | null),
          },
          {
            key: "moveInsTarget",
            label: "Move-ins target",
            align: "right",
            render: (row) => formatNum(row.moveInsTarget as number | null),
          },
          {
            key: "maTarget",
            label: "MA target",
            align: "right",
            render: (row) => formatNum(row.maTarget as number | null),
          },
          { key: "notes", label: "Notes" },
          {
            key: "updatedAt",
            label: "Updated",
            align: "right",
            render: (row) =>
              row.updatedAt ? formatDate(row.updatedAt as string) : "—",
          },
        ]}
        rows={forecastTableRows as unknown as Record<string, unknown>[]}
        compact
      />
      {!loading && rollup.agentsForecasted === 0 && !error ? (
        <p className="mt-2 text-xs text-muted">
          No agent has set a forecast for {monthLabel(month)} yet - agents set
          theirs under Dashboard → Forecast.
        </p>
      ) : null}

      {/* ------------------------- business value ------------------------- */}
      <SectionTitle source={seed.sources.businessValue}>
        Business Value - Monthly Rent Roll &amp; Recurring Income (
        {monthLabel(feeMonth)})
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Monthly Rent Roll"
          loading={loadingLive}
          stat={
            liveStat(
              rentRoll,
              rentRoll == null ? "—" : formatGBP(rentRoll),
              "Live from the PayProp portfolio walk, both agencies. This is a STOCK - what the book is worth today. PayProp keeps no history of it, so the rent roll as at the end of a past month cannot be recovered."
            ) ?? waiting
          }
          sub={managed != null ? `${managed} managed properties · as at today` : undefined}
        />
        <StatCard
          label="Monthly Management Fees"
          loading={loadingLive}
          stat={
            liveStat(
              liveMgmtFees,
              liveMgmtFees == null ? "—" : formatGBP(liveMgmtFees),
              `Live from PayProp for ${monthLabel(feeMonth)}, net of VAT - Management Fee, Monthly Management Fee, First Month Management Fee and Investor Services summed across both agencies.`
            ) ?? waiting
          }
          sub={monthLabel(feeMonth)}
        />
        <StatCard
          label="MRI - Monthly Recurring Income"
          loading={loadingLive}
          stat={
            liveStat(
              liveMgmtFees == null ? null : liveMgmtFees + (licence ?? 0),
              liveMgmtFees == null ? "-" : formatGBP(liveMgmtFees + (licence ?? 0)),
              licence != null
                ? `Management fees from PayProp (${formatGBP(liveMgmtFees ?? 0)}) plus licence fee income from Susan's sheet (${formatGBP(licence)}), ${monthLabel(feeMonth)}.`
                : "Management fees only: licence income comes from Susan's sheet, and none is uploaded for this month."
            ) ?? waiting
          }
          sub={licence != null ? "management fees + licence income" : "management fees only - licence income not uploaded"}
        />
        <StatCard
          label="One-off Fees"
          loading={loadingLive}
          stat={
            liveStat(
              liveOneOff,
              liveOneOff == null ? "—" : formatGBP(liveOneOff),
              `Live for ${monthLabel(feeMonth)}: every fee charged, less the management fee - set-up, let-only and transfers. Partner JOINING fees are not in here and cannot be: they run through a separate bank account, reachable only via Barclays/QuickBooks.`
            ) ?? waiting
          }
          sub={monthLabel(feeMonth)}
        />
        <StatCard
          label="Total Monthly Income"
          loading={loadingLive}
          stat={
            liveStat(
              liveTotalIncome,
              liveTotalIncome == null ? "—" : formatGBP(liveTotalIncome),
              `Live combined GCI for ${monthLabel(feeMonth)}, net of VAT, both agencies - recurring plus one-off.${SHORT} Joining fees are absent for the same reason as above.`
            ) ?? waiting
          }
          sub={monthLabel(feeMonth)}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="MRI per Property"
          loading={loadingLive}
          stat={
            liveStat(
              perProperty,
              perProperty == null ? "—" : formatGBP(perProperty),
              `Management fees for ${monthLabel(feeMonth)} divided by the managed book as it stands today.${SHORT}`
            ) ?? waiting
          }
          sub={managed != null ? `÷ ${managed} managed` : undefined}
        />
        <StatCard
          label="MRI % per Property"
          loading={loadingLive}
          stat={
            liveStat(
              pctOfRentRoll,
              pctOfRentRoll == null ? "—" : `${pctOfRentRoll.toFixed(1)}%`,
              `Management fees as a share of the rent roll. The fee is ${monthLabel(feeMonth)}; the rent roll is today's, because PayProp keeps no history of it.${SHORT}`
            ) ?? waiting
          }
        />
        <StatCard
          label="MRI per Trading Partner"
          loading={loadingLive}
          stat={
            liveStat(
              perPartner,
              perPartner == null ? "—" : formatGBP(perPartner),
              `Divided by partners who actually EARNED a fee this month, not everyone on the roster - a quiet month would otherwise flatter this figure.${SHORT}`
            ) ?? waiting
          }
          sub={inc?.agentsEarning ? `÷ ${inc.agentsEarning} earning` : undefined}
        />
        <StatCard
          label="MRI Split - TLE Retained"
          loading={loadingLive}
          stat={
            liveStat(
              inc?.agencyIncome ?? null,
              inc?.agencyIncome == null ? "—" : formatGBP(inc.agencyIncome),
              `Commission the agency kept in ${monthLabel(feeMonth)}, net of VAT. This one is COMPLETE - it is measured from the payments themselves, not derived from MRI, so no licence gap applies.`
            ) ?? waiting
          }
          sub={monthLabel(feeMonth)}
        />
        <StatCard
          label="MRI Split - Partner"
          loading={loadingLive}
          stat={
            liveStat(
              inc?.paidToBeneficiaries ?? null,
              inc?.paidToBeneficiaries == null ? "—" : formatGBP(inc.paidToBeneficiaries),
              `Fees paid out to partners in ${monthLabel(feeMonth)}, net of VAT. Also complete, and measured the same way.`
            ) ?? waiting
          }
          sub={monthLabel(feeMonth)}
        />
      </div>

      {/* ----------------------- costs against income -----------------------
          The month just closed: what TLE kept (PayProp) against what it cost
          to run (Susan's sheet). The cost lines were a typed May 2026 list. */}
      <SectionTitle source={plan ? `Costs from Susan's sheet · income from PayProp` : undefined}>
        Costs Against Income - {monthLabel(feeMonth)}
      </SectionTitle>
      {plan === undefined ? (
        <div className="flex items-center gap-2 text-[13px] text-muted" aria-busy="true">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
          Loading the sheet
        </div>
      ) : !plan ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Costs come from Susan&rsquo;s year sheet, and none is uploaded yet. Upload it on the{" "}
          <Link href="/company-figures/pnl" className="font-semibold underline underline-offset-2">P&amp;L</Link> tab.
        </p>
      ) : (
        (() => {
          const at = (k: string) => plan.lines[k]?.[feeMonth] ?? null;
          const forecastCosts = plan.basis[feeMonth] === "forecast";
          const fromAccounts = plan.accountsMonths?.includes(feeMonth) ?? false;
          /* The same sum as the P&L tab, so the two can never disagree about a
             month: all commission income from PayProp, less every cost on the
             sheet - agent commission included, because PayProp cannot see
             Glasgow's partners being paid. */
          const commission = ["commissionLetOnly", "commissionSetUp", "commissionManagement"].every((k) => at(k) == null)
            ? null
            : ["commissionLetOnly", "commissionSetUp", "commissionManagement"].reduce((t, k) => t + (at(k) ?? 0), 0);
          const plc = at("plcReferencing");
          const rlp = at("rlpPremium");
          const exp = at("totalExpenditure");
          const costs = commission != null && plc != null && rlp != null && exp != null ? commission + plc + rlp + exp : null;
          const kept = inc?.combinedGci ?? null;
          const gap = kept != null && costs != null ? kept - costs : null;
          const cover = kept != null && costs ? (kept / costs) * 100 : null;
          const costLines = [
            { label: "Agent commission", value: commission },
            { label: "PLC checks & referencing", value: plc },
            { label: "RLP insurance premium", value: rlp },
            ...["accountancy", "groupAdmin", "advertising", "bankCharges", "computer", "insurance", "operatingSoftware", "propertySoftware", "recruitment", "training", "subscriptions", "telephone", "travel", "joiningFeeIncome", "licenceFeeIncome"]
              .filter((k) => plan.lines[k])
              .map((k) => ({
                label: ({ accountancy: "Accountancy", groupAdmin: "Group admin & support", advertising: "Advertising & promotion", bankCharges: "Bank charges", computer: "Computer expenses", insurance: "Insurance", operatingSoftware: "Operating software", propertySoftware: "Property software", recruitment: "Recruitment fees", training: "Staff training", subscriptions: "Subscriptions", telephone: "Telephone", travel: "Travel", joiningFeeIncome: "Joining fee income", licenceFeeIncome: "Licence fee income" } as Record<string, string>)[k],
                value: at(k),
              })),
            { label: "TOTAL COSTS", value: costs },
          ];
          return (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard
                  label="Commission income"
                  loading={loadingLive}
                  stat={liveStat(kept, kept == null ? "-" : formatGBP(kept), `Every fee charged in ${monthLabel(feeMonth)}, both agencies, net of VAT, from PayProp.`) ?? waiting}
                />
                <StatCard
                  label="Costs"
                  stat={{ value: costs, display: costs == null ? undefined : formatGBP(costs), source: "manual", note: `Agent commission, PLC checks, the RLP premium and total expenditure for ${monthLabel(feeMonth)}, from Susan's sheet${forecastCosts ? " - still her forecast for that month" : ""}. Joining and licence fee income are netted off, as on her sheet.` }}
                  sub={fromAccounts ? "From the accounts" : forecastCosts ? "Her forecast for the month" : "From her sheet"}
                />
                <StatCard
                  label="Monthly gap"
                  loading={loadingLive}
                  stat={{ value: gap, display: gap == null ? undefined : `${gap < 0 ? "-" : "+"}${formatGBP(Math.abs(gap))}`, source: "derived", note: "Commission income less every cost - the same net profit the P&L tab shows for the month." }}
                />
                <StatCard
                  label="Cost coverage"
                  loading={loadingLive}
                  stat={{ value: cover, display: cover == null ? undefined : `${cover.toFixed(0)}%`, source: "derived", note: "Commission income as a share of the month's costs." }}
                  sub="of costs covered by income"
                />
              </div>
              <div className="mt-3">
                <DataTable
                  columns={[
                    { key: "label", label: `Cost line, ${monthLabel(feeMonth)}` },
                    { key: "value", label: "£", align: "right", render: (row) => money(row.value as number | null) },
                  ]}
                  rows={costLines as unknown as Record<string, unknown>[]}
                  compact
                />
              </div>
            </>
          );
        })()
      )}

      {/* The H2 table that stood here was a typed November 2025 draft. The year,
          month by month, is the P&L tab now - one place, not two. */}
      <p className="mt-6 text-[12.5px] text-muted">
        The year month by month, PayProp income against Susan&rsquo;s plan, is on the{" "}
        <Link href="/company-figures/pnl" className="font-semibold text-ink underline underline-offset-2">P&amp;L</Link> tab.
      </p>
    </div>
  );
}
