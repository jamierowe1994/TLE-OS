import { NextResponse } from "next/server";
import { getGciHistory } from "@/lib/business/gci-history";
import { monthsThisYearToDate } from "@/lib/business/format";

/**
 * The TLE Business Income table, month by month, live.
 *
 * WHY THIS EXISTS
 *
 * The table on the Income tab was a snapshot typed out of Susan's reports, and
 * its COLUMNS were typed too — jan…jun, q1, q2, ytd. So in August it still
 * ended at June, while the chart above it (which derives its window from the
 * calendar) already ran to July. One screen, two different ideas of how far
 * the year had got.
 *
 * The columns are now derived, and the months the snapshot never covered are
 * filled from PayProp instead of being left blank or hand-typed again.
 *
 * WHAT CAN AND CANNOT BE FILLED THIS WAY
 *
 * PayProp gives the GCI rows honestly — combined, per country, the agency's own
 * share, and what therefore went to associates. Those reconcile with Susan to
 * under 1%.
 *
 * It gives NOTHING for the licence fee rows: monthly licence, pro licence and
 * joining fees do not run through PayProp at all — joining fees go through a
 * separate bank account visible only in Barclays and QuickBooks. Those rows
 * stay null for any month the snapshot doesn't cover, and null renders as a
 * dash rather than a zero. A zero would say "we earned nothing", which is a
 * different and false statement.
 *
 * Nor does it give the fee BREAKDOWN (management / set-up / other) per country
 * — that split comes from Susan's own Summary of Fees. Also null.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The metric labels, verbatim from the snapshot, so the two merge row for row. */
const GCI_ROWS = {
  eAndW: "E&W GCI (exc VAT)",
  glasgow: "Glasgow GCI (exc VAT)",
  combined: "Combined GCI (exc VAT)",
  associates: "Paid to Associates (E&W)",
  tleNet: "Combined Net Income to TLE",
} as const;

export async function GET() {
  const months = monthsThisYearToDate();
  if (!months.length) {
    // January. There is no complete month this year yet.
    return NextResponse.json({ months: [], rows: {}, filled: [] });
  }

  // Keyed by month, not a list — see lib/gci-history.
  const by = await getGciHistory(months[0], months[months.length - 1]).catch(
    () => ({}) as Awaited<ReturnType<typeof getGciHistory>>
  );

  const rows: Record<string, Record<string, number | null>> = {
    [GCI_ROWS.eAndW]: {},
    [GCI_ROWS.glasgow]: {},
    [GCI_ROWS.combined]: {},
    [GCI_ROWS.associates]: {},
    [GCI_ROWS.tleNet]: {},
  };

  const filled: string[] = [];
  for (const month of months) {
    const m = by[month];
    if (!m) continue;
    // A month PayProp couldn't fully answer is NOT reported as a figure. A
    // short month looks like a bad month, and nobody would know to doubt it.
    if (m.unreachable?.length) continue;

    const account = (match: RegExp) =>
      m.byAccount
        .filter((a) => match.test(a.label))
        .reduce((t, a) => t + a.combinedGci, 0) || null;

    const combined = Math.round(m.combinedGciNet);
    const tleNet = Math.round(m.agencyIncomeNet);

    rows[GCI_ROWS.eAndW][month] = account(/e&w|england|wales|edinburgh/i);
    rows[GCI_ROWS.glasgow][month] = account(/glasgow|scot/i);
    rows[GCI_ROWS.combined][month] = combined;
    rows[GCI_ROWS.tleNet][month] = tleNet;
    // What was left for the partners. Derived from the same two figures as the
    // headline, so it cannot drift from them.
    rows[GCI_ROWS.associates][month] = combined - tleNet;
    filled.push(month);
  }

  return NextResponse.json({
    months,
    rows,
    filled,
    source: "PayProp, net of VAT",
  });
}
