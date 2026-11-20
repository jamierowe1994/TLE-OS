import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { payPropConfigured } from "@/lib/business/payprop";
import { payPropProblem, payPropRefreshing, type AgentSlice } from "@/lib/business/payprop-income";
import { getGciHistory, hasEveryAgency, MONEY_FLOOR } from "@/lib/business/gci-history";
import { periodByKey } from "@/lib/business/periods";

/**
 * Each agent's GCI and rent for a quarter or the year to date, for the Agents
 * tab (Susan Liles, 20 Nov 2026, ticket 8ea5a7b8).
 *
 * GET /api/business/agent-period?period=2026-q3
 *   → { period, label, months, perMonth: [{ month, gciNet, byAgent }], missing, complete }
 *
 * THE SAME MONTHS THE OVERVIEW ADDS UP. Each month is the per-agent split of
 * that month's PayProp commission (AgencyIncome.byAgentProperty), read through
 * getGciHistory - the store behind the Overview's year-to-date GCI. A finished
 * month comes out of gci_months (walked once, kept: it cannot change) and the
 * month we are in, or one still settling, is the hourly read the month view
 * already uses. So the period's TOTAL row is the month view's TOTAL rows added
 * together, not a second reading of PayProp that could drift from them.
 *
 * The months are summed on the page, per agent, by the same name join the
 * month view uses. Here they are only handed over, whole or not at all: a month
 * with no answer, or missing an agency, is listed in `missing` and the period
 * is not `complete`. The page then shows nothing rather than a total short by
 * a month, which reads exactly like a quiet quarter.
 *
 * The period is worked out from the server's own clock (lib/business/periods),
 * so a key for a quarter that hasn't started yet is refused rather than walked.
 */
export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const key = req.nextUrl.searchParams.get("period") ?? "";
  const period = periodByKey(key);
  if (!period) {
    return NextResponse.json({ error: "That period isn't one on offer." }, { status: 400 });
  }
  if (!payPropConfigured()) {
    return NextResponse.json({ connected: false, period: period.key, label: period.label, months: period.months, perMonth: [], missing: period.months, complete: false });
  }
  const months = period.months.filter((m) => m >= MONEY_FLOOR);
  const hist = await getGciHistory(months[0], months[months.length - 1]).catch(() => ({}) as Awaited<ReturnType<typeof getGciHistory>>);

  const perMonth: Array<{ month: string; gciNet: number; byAgent: AgentSlice[] }> = [];
  const missing: string[] = period.months.filter((m) => m < MONEY_FLOOR);
  for (const m of months) {
    const row = hist[m];
    if (!row || !hasEveryAgency(row) || row.unreachable.length) {
      missing.push(m);
      continue;
    }
    perMonth.push({ month: m, gciNet: row.combinedGciNet, byAgent: row.byAgent });
  }

  return NextResponse.json({
    connected: true,
    period: period.key,
    label: period.label,
    months: period.months,
    perMonth,
    missing,
    complete: missing.length === 0,
    refreshing: payPropRefreshing(),
    problem: payPropProblem(),
  });
}
