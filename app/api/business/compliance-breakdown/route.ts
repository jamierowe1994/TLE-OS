import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getComplianceBook } from "@/lib/compliance-cache";
import { complianceBreakdown } from "@/lib/compliance-breakdown";
import { rexConfigured } from "@/lib/rex";

/**
 * GET /api/business/compliance-breakdown → compliance per certificate type,
 * for the Compliance tab on My Business.
 *
 * WHY A SECOND COMPLIANCE ROUTE. /api/business/compliance-live counts every
 * entry REX holds across the whole account: let-only homes, homes nobody
 * manages, oil safety, three kinds of HMO licence, terms of business. 2,635
 * items on 16 Sep 2026. That is not the question Susan asked, and it disagreed
 * with the Compliance page Michael works from. This reads the SAME cached book
 * as that page (lib/compliance-cache) - see lib/compliance-breakdown.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
  }
  try {
    const { book, ageMs, stale } = await getComplianceBook();
    return NextResponse.json({
      ok: true,
      asAt: new Date(Date.now() - ageMs).toISOString(),
      stale,
      ...complianceBreakdown(book.properties),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
