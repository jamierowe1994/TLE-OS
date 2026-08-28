import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/business/auth";
import { requireCapability } from "@/lib/admin";
import { findById } from "@/lib/business/users-store";
import { getPropolyMoveInForecast } from "@/lib/business/propoly-deals";

// Move-in tracker: completed MTD + forward forecast (active Propoly deals by
// move-in month) + quarter/YTD rollups, with the comparison figures the
// trend arrows need. All Propoly — REX doesn't hold move-ins.

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const admin = userId ? await findById(userId) : null;
  if (!admin || !(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tracker = await getPropolyMoveInForecast().catch(() => null);
  return NextResponse.json({ configured: tracker != null, tracker });
}
