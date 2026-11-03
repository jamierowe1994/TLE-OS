import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { payPropConfigured } from "@/lib/business/payprop";
import { getPortfolioGrowth } from "@/lib/business/book-record";
import { portfolioError } from "@/lib/business/payprop-portfolio";
import { currentMonth } from "@/lib/business/format";

// Growth and loss in the PayProp book by region, for the Portfolio tab of
// Company Figures (Susan Liles, 3 Nov 2026). See lib/business/book-record.
//
// GET /api/business/portfolio-growth?month=YYYY-MM -> { growth } or
// { growth: null, pending: true } while the book is still being walked.
export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!payPropConfigured()) {
    return NextResponse.json({ growth: null, error: "PayProp is not connected." });
  }
  const raw = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
  try {
    const growth = await getPortfolioGrowth(month);
    return NextResponse.json(
      growth ? { growth } : { growth: null, pending: true, error: portfolioError() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ growth: null, error: e instanceof Error ? e.message : String(e) });
  }
}
