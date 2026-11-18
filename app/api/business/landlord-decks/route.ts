import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { currentMonth } from "@/lib/business/format";
import { getLandlordDeckFigures } from "@/lib/business/landlord-decks";

// The Landlord Decks tab of Company Figures (James, 18 Nov 2026). See
// lib/business/landlord-decks.
//
// GET /api/business/landlord-decks?month=YYYY-MM -> { ok: true, figures }
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const raw = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
  try {
    const figures = await getLandlordDeckFigures(month);
    return NextResponse.json({ ok: true, figures }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
