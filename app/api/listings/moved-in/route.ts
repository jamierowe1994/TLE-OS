import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { isOwner } from "@/lib/agent-words";
import { movedInReport, AFTER_DAYS } from "@/lib/listings-moved-in";
import { rexConfigured } from "@/lib/rex";

/**
 * The owners' list of let homes whose tenant moved in a fortnight ago or more
 * and whose advert is still being sent to the portals (Susan Liles, 3 Nov
 * 2026; lib/listings-moved-in).
 *
 * GET            -> { ok, rows, looked, notYet, noDate, unreadable, checkedAt, afterDays }
 * GET ?fresh=1   -> the same, read again now rather than from the last ten minutes
 *
 * Owners and Susan only, and not while viewing as somebody else. Read only:
 * taking an advert down is /api/listings/publish "off", from the screen.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!isOwner(actor) || viewingAs) return NextResponse.json({ ok: false, error: "This list is for the owners." }, { status: 403 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  try {
    const report = await movedInReport(req.nextUrl.searchParams.get("fresh") === "1");
    return NextResponse.json({ ok: true, afterDays: AFTER_DAYS, ...report });
  } catch (e) {
    console.error("[listings/moved-in]", e);
    return NextResponse.json({ ok: false, error: "The listings system did not answer, so the list could not be checked. Try again in a minute." }, { status: 502 });
  }
}
