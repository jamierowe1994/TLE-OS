import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { appraisalForHome } from "@/lib/appraisal-for-home";
import { lookFor } from "@/lib/new-look-store";

/**
 * Valuation first (James, 18 Nov 2026, the "Valuation deck nudges" switch).
 *
 * Terms sent from a home's Compliance tab skip the appraisal, and with it the
 * valuation deck that is meant to carry them. This answers one question for
 * that screen: does this home have a real appraisal - a visit, a figure - whose
 * valuation never went to the landlord? If so the screen points the agent to
 * the appraisal first. Homes listed straight from New Listing (os_case_state
 * 'direct-listing') never had a valuation to send, so they never ask.
 *
 * GET ?listingId=&propertyId=&address= -> { ok, appraisal: { id, address, agent } | null }
 *
 * Read only. Nothing is sent or changed.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const none = NextResponse.json({ ok: true, appraisal: null }, { headers: { "cache-control": "private, no-store" } });
  if (!hasDb() || !(await lookFor(actor).catch(() => null))?.decknudge) return none;

  const sp = req.nextUrl.searchParams;
  const listingId = sp.get("listingId")?.trim() || null;
  const ma = await appraisalForHome({ propertyId: sp.get("propertyId"), address: sp.get("address") }).catch(() => null);
  if (!ma || ma.valuation == null || !ma.appointmentAt) return none;

  const [row] = await q<{ direct: boolean; sent: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM os_case_state cs
                     WHERE cs.kind = 'direct-listing'
                       AND (cs.record_id = $1 OR ($2::text IS NOT NULL AND cs.payload->>'listingId' = $2))) AS direct,
            EXISTS (SELECT 1 FROM os_presentations p WHERE 'lead-' || p.ref = $1 AND p.kind = 'post-appraisal') AS sent`,
    [ma.id, listingId]
  ).catch(() => []);
  if (!row || row.direct || row.sent) return none;

  return NextResponse.json(
    { ok: true, appraisal: { id: ma.id, address: ma.address, agent: ma.agent } },
    { headers: { "cache-control": "private, no-store" } }
  );
}
