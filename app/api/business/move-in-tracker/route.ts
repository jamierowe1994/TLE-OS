import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/admin";
import { getPropolyMoveInForecast } from "@/lib/business/propoly-deals";

// Move-in tracker: completed MTD + forward forecast (active Propoly deals by
// move-in month) + quarter/YTD rollups, with the comparison figures the
// trend arrows need. All Propoly - REX doesn't hold move-ins.

export async function GET(req: NextRequest) {
  /* Kirstie reads the move-ins too (Susan, 2 Nov 2026: "Kirsties view needs
     to include oversight of the move-ins and Pipeline like mine"). */
  if (!(await requireAnyCapability(req, ["see:business", "see:pretenancy"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tracker = await getPropolyMoveInForecast().catch(() => null);
  return NextResponse.json({ configured: tracker != null, tracker });
}
