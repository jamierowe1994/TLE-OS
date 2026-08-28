import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { SEED, SNAPSHOT_DATE } from "@/lib/business/seed-data";

// Admin-gated delivery of the full dashboard snapshot (SEED). lib/seed-data.ts
// is "server-only" — it contains tenant personal data (arrears) and owner-only
// financials (P&L, partner net income), so it must never ship in a client
// bundle. The admin tabs fetch it here instead; a valid session belonging to
// an ADMIN_EMAILS address is required, exactly like every other /api/admin/*.

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json(
      { error: "This area is locked to the business owner." },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { seed: SEED, snapshotDate: SNAPSHOT_DATE },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
