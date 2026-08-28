import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getHistory, getYoYLive } from "@/lib/business/business-history";

// Closed-month live funnel history + like-for-like YoY for the admin
// Overview's period pills. First-ever call computes any unstored months from
// REX/Propoly (slow — up to a minute); after that everything is served from
// the permanent store, so keep the route budget generous.

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [months, yoy] = await Promise.all([getHistory(), getYoYLive()]);
  return NextResponse.json({ months, yoy });
}
