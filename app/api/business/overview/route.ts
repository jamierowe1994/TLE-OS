import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { SEED, PERIOD_KPIS } from "@/lib/business/seed-data";
import { getGciSeries } from "@/lib/business/gci-history";
import { getPlan } from "@/lib/business/plan-store";
import { getOverrides } from "@/lib/business/actuals-store";
import { resolveStat } from "@/lib/business/stats";
import { liveMonth } from "@/lib/business/roster";
import type { StatValue } from "@/lib/business/types";

// Assembled business-overview payload for the admin Overview tab. Snapshot
// figures are merged with admin manual overrides (actuals-store) through the
// live → manual → snapshot resolveStat chain, so a figure keyed in on another
// tab (e.g. funnel.moveIns on Move-ins) shows here with its MANUAL badge too.
// The ?month= param picks which month's overrides apply; the snapshot itself
// is the 11 Jul 2026 capture.

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json(
      { error: "This area is locked to the business owner." },
      { status: 403 }
    );
  }

  /* Defaulted to a typed "2026-07" until 10 Oct 2026 (Rig P-003), so a call
     without ?month= read July's manual overrides. Now the month we are in,
     the same clock the page's own pills use. */
  const asked = req.nextUrl.searchParams.get("month");
  const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : liveMonth();

  // Merge admin manual overrides into the sales funnel (manual beats snapshot).
  /* Manual figures are an extra, not the page (Rig run 2, P-013): a failed
     read of them took the whole overview down with "Couldn't load the
     business overview". Without them, the figures they would have filled
     show their dash and the source they need, like any other gap. The
     Move-ins entry screen still fails loudly - there, an empty answer would
     look like nothing had been keyed in. */
  const overrides = await getOverrides(month).catch(() => []);
  const manualFor = (metric: string) => {
    const o = overrides.find(
      (row) => row.scope === "business" && row.metric === metric
    );
    return o ? { value: o.value, note: o.note } : null;
  };
  const mergeFunnel = (
    stat: StatValue | undefined,
    metric: string
  ): StatValue => resolveStat(null, manualFor(metric), stat ?? null);

  const seedFunnel = SEED.businessFunnel;
  const funnel = {
    ...seedFunnel,
    marketAppraisals: mergeFunnel(seedFunnel.marketAppraisals, "funnel.marketAppraisals"),
    listings: mergeFunnel(seedFunnel.listings, "funnel.listings"),
    viewings: mergeFunnel(seedFunnel.viewings, "funnel.viewings"),
    applications: mergeFunnel(seedFunnel.applications, "funnel.applications"),
    moveIns: mergeFunnel(seedFunnel.moveIns, "funnel.moveIns"),
    pipeline: mergeFunnel(seedFunnel.pipeline, "funnel.pipeline"),
    liveListings: mergeFunnel(seedFunnel.liveListings, "funnel.liveListings"),
    gci: mergeFunnel(seedFunnel.gci, "funnel.gci"),
  };

  /*
   * Monthly GCI, live from the per-month store - the chart GROWS as months
   * close rather than being a fixed Jan–Jun literal reading one seed row.
   *
   * There is NO seed fallback. It used to chart the six hand-typed Jan–Jun
   * figures whenever the store was cold, captioned "showing the captured 2026
   * actuals meanwhile" - but a chart with bars on it reads as data, and nobody
   * reads the caption under a chart that looks finished. An empty chart that
   * says it is still gathering is slower to look at and impossible to
   * misread.
   */
  const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const series = await getGciSeries(month).catch(() => null);
  const live = series?.months ?? [];
  /* Susan Liles, 3 Nov 2026: "the monthly GCI vs budget breakdown ... doesn't
     match the report from Paula". PayProp read by the OS runs £120-£410 a
     month under Paula's Summary of Fees, which the accounts are built from.
     A month whose accounts are uploaded shows the accounts' fee income - the
     same rule as the P&L (lib/business/pnl-build), so the two tabs agree -
     and PayProp's own reading stays in the breakdown beneath it. */
  const plan = await getPlan(Number(month.slice(0, 4))).catch(() => null);
  const fromAccounts = (m: string): number | null => {
    if (!plan?.accountsMonths?.includes(m)) return null;
    const total = plan.lines.totalIncome?.[m];
    if (total == null) return null;
    const outside = (plan.lines.commissionReceived?.[m] ?? 0) + (plan.lines.referralIncome?.[m] ?? 0);
    return total - outside;
  };
  const gciByMonth = live.length
    ? {
        labels: live.map((m) => SHORT[Number(m.month.slice(5, 7)) - 1]),
        // NET of VAT - PayProp's amounts are VAT-inclusive and the accounts
        // sheet is not. Charting the gross figure would overstate every bar
        // by 20%.
        actual: live.map((m) => Math.round(fromAccounts(m.month) ?? m.combinedGciNet)),
        // What each bar is MADE OF. A total invites "made up of what?", and
        // until now the only way to find out was to ask someone.
        detail: live.map((m) => {
          const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
          /* Susan Liles, 3 Nov 2026: the agency lines were PayProp's figures
             WITH VAT under a combined figure without it, so October read
             Glasgow £3,566 + E&W £44,393 under £39,966. Paula's Summary of
             Fees splits the two net of VAT, so this does too: VAT is one rate
             across the month, so each agency takes the month's own net share. */
          const exVat = m.combinedGciGross > 0 ? m.combinedGciNet / m.combinedGciGross : 0;
          const accounts = fromAccounts(m.month);
          return [
            ...(accounts != null
              ? [["Combined GCI (the accounts)", gbp(accounts)] as [string, string], ["PayProp read", gbp(m.combinedGciNet)] as [string, string]]
              : [["Combined GCI", gbp(m.combinedGciNet)] as [string, string]]),
            ...m.byAccount.map(
              (a) => [a.label, gbp(a.combinedGci * exVat)] as [string, string]
            ),
            ["TLE kept", gbp(m.agencyIncomeNet)] as [string, string],
            ["Partners", gbp(m.combinedGciNet - m.agencyIncomeNet)] as [string, string],
            ["VAT taken off", gbp(m.vat)] as [string, string],
            ["Partners earning", String(m.agentsEarning)] as [string, string],
            ["Payments", String(m.paymentCount)] as [string, string],
          ];
        }),
        budget: null,
        budgetNote:
          series && !series.complete
            ? `Live from PayProp, net of VAT - ${
                series.missing.length ? `${series.missing.length} month(s) still computing. ` : ""
              }${
                series.unreachable.length
                  ? `${series.unreachable.join(", ")} unreachable, so these bars are SHORT by a whole agency.`
                  : ""
              }`.trim()
            : `Net of VAT. ${
                live.some((m) => fromAccounts(m.month) != null)
                  ? "A month with its accounts uploaded shows the accounts' figure; the rest are live from PayProp."
                  : "Live from PayProp."
              } No budget figures have been given to the system yet - actual GCI only.`,
        live: true,
        ytdNet: series?.ytdNet ?? null,
        ytdGross: series?.ytdGross ?? null,
        complete: series?.complete ?? false,
        unreachable: series?.unreachable ?? [],
      }
    : {
        labels: [],
        actual: [],
        budget: null,
        budgetNote:
          "Still walking the monthly commission out of PayProp. Nothing charted until it lands - a bar drawn from an old figure looks exactly like a real one.",
        live: false,
        ytdNet: null,
        ytdGross: null,
        complete: false,
        unreachable: [],
      };

  return NextResponse.json({
    month,
    headline: SEED.headline,
    headcount: SEED.headcount,
    partnerRamp: SEED.partnerRamp,
    funnel,
    conversions: SEED.conversions,
    masByPartnerType: SEED.masByPartnerType,
    yoyGrowth: SEED.yoyGrowth,
    gciByMonth,
    sources: SEED.sources,
    // Every period Susan's dashboard can show, captured 21 Jul 2026 - powers
    // the working period pills on the mirrored Overview.
    periods: PERIOD_KPIS,
  });
}
