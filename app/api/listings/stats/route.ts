import { NextRequest, NextResponse } from "next/server";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { portalStatsFor } from "@/lib/rex-portal-stats";
import { rexConfigured } from "@/lib/rex";
import { whoIs } from "@/lib/admin";
import { forAgent } from "@/lib/agent-words";
import { historyFor, marketFor, recordStats, sweepMarket } from "@/lib/portal-market";
import { bookFor } from "@/lib/listings-cache";

/**
 * What the portals did with one listing.
 *
 * Read-only, through the office's service account — deliberately. Per-user
 * REX tokens are for anything we WRITE, so records carry the name of whoever
 * did the thing. Nobody needs to prove who they are to look at a view count,
 * and asking them to would put a login in front of a number.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "A listing id is required." }, { status: 400 });
  if (isTestId(id)) return NextResponse.json({ ok: false, error: "A test listing has no portal figures - it was never really on them.", test: true }, { status: 409 });
  /* ?only=market: the comparison again, without asking REX - the panel
     reads this while the day's sweep of the market is still going. */
  if (req.nextUrl.searchParams.get("only") === "market") {
    const { actor } = await whoIs(req);
    if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const [market, history] = await Promise.all([marketFor(id), historyFor(id)]);
    return NextResponse.json({ ok: true, market, history });
  }
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  }
  try {
    const stats = await portalStatsFor(id);
    if (!stats) return NextResponse.json({ ok: false, error: "The portal figures for that listing did not load. Try again in a minute." }, { status: 502 });
    /* Kept, so this home has a history and sits in the market (lib/portal-
       market), and the day's read of every other live home started behind
       the answer rather than in front of it. */
    const book = await bookFor(null).catch(() => null);
    const l = book?.listings.find((x) => String(x.id) === id);
    if (l) await recordStats({ id, name: l.name, locality: l.locality, rentMonthly: l.rentMonthly, publishedAt: l.publishedAt }, stats);
    const sweep = sweepMarket().catch(() => 0);
    void sweep;
    const [market, history] = await Promise.all([marketFor(id), historyFor(id)]);
    return NextResponse.json({ ok: true, ...stats, market, history });
  } catch (e) {
    const { actor } = await whoIs(req).catch(() => ({ actor: null }));
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The portal figures did not load. Try again in a minute.") : "The portal figures did not load. Try again in a minute." },
      { status: 500 }
    );
  }
}
