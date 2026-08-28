import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getPropolyMoveInForecast } from "@/lib/business/propoly-deals";

// Move-in tracker: completed MTD + forward forecast (active Propoly deals by
// move-in month) + quarter/YTD rollups, with the comparison figures the
// trend arrows need. All Propoly — REX doesn't hold move-ins.

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tracker = await getPropolyMoveInForecast().catch(() => null);
  return NextResponse.json({ configured: tracker != null, tracker });
}
