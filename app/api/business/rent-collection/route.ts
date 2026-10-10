import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getGciHistory, hasEveryAgency, MONEY_FLOOR } from "@/lib/business/gci-history";
import { currentMonth } from "@/lib/business/format";

/**
 * Rent collection, month by month.
 *
 * GET /api/admin/rent-collection?month=YYYY-MM  → the twelve months ending there
 *
 * This is the Arrears tab's month-scoped figure, and it is deliberately NOT
 * arrears. A rebuilt arrears list was measured against PayProp's own balances
 * and rejected: on a closed month it agreed on 2 of 9 real cases, invented 1,
 * and missed 7; mid-month it produced 44 false positives out of 50. Arrears is
 * the one figure on this dashboard whose failure has a cost outside the
 * building, so it stays a current-state read.
 *
 * What IS honest is the flow: how much rent came in, from how many properties,
 * from how many tenants. Every one of those is counted from payment rows that
 * exist. Nothing is inferred and no individual can be wrongly named.
 *
 * Served from the stored monthly figures, so this is arithmetic rather than a
 * walk of PayProp.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthsBack(to: string, count: number): string {
  const [y, m] = to.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - (count - 1), 1));
  return d.toISOString().slice(0, 7);
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const param = req.nextUrl.searchParams.get("month");
  const to = param && MONTH_RE.test(param) ? param : currentMonth();
  const from = monthsBack(to, 12);

  const hist = await getGciHistory(from, to).catch(
    () => ({}) as Awaited<ReturnType<typeof getGciHistory>>
  );
  /* EVERY month of the window, each saying what it is (Rig run 4, P-044):
     only the months held came back, so a gap vanished from the table, and
     this month's few days read like a full month. Now a month is held, not
     held yet (or before PayProp's figures begin), or this month so far. */
  const now = currentMonth();
  const window: string[] = [];
  for (let m = from; m <= to; ) {
    window.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  }
  const months = window.map((m) => {
    const h = hist[m];
    if (!h) {
      return { month: m, held: false, beforeFloor: m < MONEY_FLOOR, rentCollected: null, propertiesPaying: null, tenantsPaying: null, avgPerProperty: null, incomplete: false, partial: m === now };
    }
    return {
      month: m,
      held: true,
      beforeFloor: false,
      rentCollected: Math.round(h.rentCollected),
      propertiesPaying: h.propertiesPaying,
      tenantsPaying: h.tenantsPaying,
      // Mean rent per paying property - a stable shape that makes an odd month
      // obvious without needing a denominator we cannot honestly supply.
      avgPerProperty: h.propertiesPaying > 0 ? Math.round(h.rentCollected / h.propertiesPaying) : null,
      /** Short by a whole agency - the figures below understate. */
      incomplete: h.unreachable.length > 0 || !hasEveryAgency(h),
      /** This month so far, not a whole month. */
      partial: m === now,
    };
  });

  return NextResponse.json({
    from,
    to,
    months,
    /** Months in the window (from PayProp's floor on) with no figures yet. */
    missing: months.filter((m) => !m.held && !m.beforeFloor).map((m) => m.month),
  });
}
