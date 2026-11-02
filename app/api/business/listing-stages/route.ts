import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { activity } from "@/lib/activity";
import { stageCounts, type StageListing } from "@/lib/listing-stages";
import { grantWholeBusiness } from "@/lib/scope";
import { publicError } from "@/lib/public-error";
import { GET as listingsGET } from "@/app/api/listings/route";

/**
 * GET /api/business/listing-stages → the whole business's Available and Let
 * agreed, by the Listings board's own rule (lib/listing-stages).
 *
 * Susan, 2 Nov 2026: "We dont have 190 live listings and 54 forward pipeline".
 * The Business KPIs summed REX's "current" listings per agent: drafts counted
 * as live, and REX's let-agreed flag as the pipeline, with nothing knowing a
 * home had been let through an accepted offer or Propoly. The Listings board
 * and the dashboard already count these one way; this hands that same count to
 * My Business, so the three can never disagree. A stock: today's, not a month's.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  try {
    const sub = new NextRequest(new URL("/api/listings?tests=0", req.url), { headers: req.headers });
    grantWholeBusiness(sub);
    const [res, act] = await Promise.all([listingsGET(sub), activity().catch(() => null)]);
    const j = (await res.json()) as { ok?: boolean; error?: string; bookError?: string; listings?: unknown[]; ageMs?: number };
    if (!res.ok || j.ok === false || !Array.isArray(j.listings)) throw new Error(j.bookError ?? j.error ?? "The Listings board couldn't be read just now.");
    const counts = stageCounts(j.listings as StageListing[], new Set(act?.accepted ?? []));
    return NextResponse.json({
      ok: true,
      ...counts,
      readAt: new Date(Date.now() - (typeof j.ageMs === "number" ? j.ageMs : 0)).toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The Listings board couldn't be read just now.") }, { status: 502 });
  }
}
