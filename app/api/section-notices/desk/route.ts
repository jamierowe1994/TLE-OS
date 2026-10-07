import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { deskNotices } from "@/lib/section-notices";

/**
 * Michael's Sections tab: every Section 13 and Section 8 that has been
 * submitted, of every state but draft and withdrawn. One read; the page
 * splits it by kind and by state, so the counts on the tabs and the lists
 * under them are the same rows.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, reason: "No database on this environment.", notices: [] });
  try {
    return NextResponse.json({ ok: true, stored: true, notices: await deskNotices() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the notices." }, { status: 502 });
  }
}
