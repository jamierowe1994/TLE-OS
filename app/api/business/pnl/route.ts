import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { currentMonth } from "@/lib/business/format";
import { getGciHistory, hasEveryAgency, MONEY_FLOOR } from "@/lib/business/gci-history";
import { getPlan } from "@/lib/business/plan-store";
import { buildPnl, type MonthMoney } from "@/lib/business/pnl-build";

/**
 * GET /api/business/pnl?year=2026 → the year's P&L: PayProp for the money the
 * OS can see, Susan's uploaded sheet for the costs it cannot, her forecast for
 * months still to come. See lib/business/pnl-build.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const now = currentMonth();
  const year = Number(req.nextUrl.searchParams.get("year")) || Number(now.slice(0, 4));
  const last = `${year}-12` < now ? `${year}-12` : now;
  const [history, plan] = await Promise.all([
    /* From the money floor, not January (Rig run 4, P-068): a 2025 year asked
       for months PayProp's figures never reach, and waited on them for ever. */
    `${year}-01` <= now ? getGciHistory(`${year}-01` < MONEY_FLOOR ? MONEY_FLOOR : `${year}-01`, last).catch(() => ({})) : Promise.resolve({}),
    getPlan(year),
  ]);
  const money: Record<string, MonthMoney> = {};
  for (const [m, h] of Object.entries(history)) {
    // A month missing an agency is a wrong figure, not a small one.
    if (!h || h.unreachable?.length || !hasEveryAgency(h)) continue;
    money[m] = { combinedNet: h.combinedGciNet, agencyNet: h.agencyIncomeNet };
  }
  return NextResponse.json(buildPnl(year, now, money, plan, MONEY_FLOOR));
}
