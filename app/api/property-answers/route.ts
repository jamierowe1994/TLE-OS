import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { answersForAddress, answersForAppraisal, answersForProperties } from "@/lib/property-answers-store";

/**
 * What the landlord told us, for the people who need to act on it.
 *
 *   ?appraisalId=…              one file
 *   ?propertyId=…               one home, or several comma-separated
 *   ?address=…                  a home REX has no property for yet
 *
 * ── Staff only, and read only ─────────────────────────────────────────────
 *
 * The landlord's own route (api/landlord/property-answers) is the only place
 * these are written. This one exists so an agent can read a stopcock at nine
 * on a Sunday night, and it is a plain OS session check: anybody who can open
 * the property file can already see the certificates and the tenancy on it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const appraisalId = (p.get("appraisalId") ?? "").trim();
  const propertyId = (p.get("propertyId") ?? "").trim();
  const address = (p.get("address") ?? "").trim();

  if (!appraisalId && !propertyId && !address) {
    return NextResponse.json({ ok: false, error: "Ask about a property, an address or an appraisal." }, { status: 400 });
  }

  try {
    /**
     * EVERY KEY GIVEN, not the first one that looks usable.
     *
     * A home can be known by its REX property, by its address, or by the
     * appraisal it came from, and the three do not always agree yet: the
     * compliance panel can have matched a REX property while the appraisal
     * row behind the answers has not been linked to it. Asking on only one
     * key showed an empty panel over a property whose landlord had answered
     * every question. So all of them are asked and the results merged.
     */
    const found = (
      await Promise.all([
        appraisalId ? answersForAppraisal(appraisalId).then((x) => (x ? [x] : [])) : Promise.resolve([]),
        propertyId ? answersForProperties(propertyId.split(",")) : Promise.resolve([]),
        address ? answersForAddress(address) : Promise.resolve([]),
      ])
    ).flat();

    const seen = new Set<string>();
    const properties = found.filter((p2) => (seen.has(p2.appraisalId) ? false : (seen.add(p2.appraisalId), true)));
    return NextResponse.json({ ok: true, properties });
  } catch (e) {
    /* Said out loud rather than thrown. A 500 with an empty body tells the
       panel nothing and the person reading it less. */
    const why = e instanceof Error ? e.message : "Couldn't read the answers.";
    console.error("[property-answers]", why);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }
}
