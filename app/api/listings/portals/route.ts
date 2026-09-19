import { NextRequest, NextResponse } from "next/server";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { portalLinksFor } from "@/lib/rex-portal-links";
import { rexConfigured } from "@/lib/rex";
import { whoIs } from "@/lib/admin";
import { forAgent } from "@/lib/agent-words";

/**
 * The public advert links for one listing — Rightmove, Zoopla, OnTheMarket.
 *
 * Read-only, through the office's service account, for the same reason as the
 * portal stats beside it: nobody needs to prove who they are to open a link
 * that any member of the public can already see.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const testId = req.nextUrl.searchParams.get("id");
  if (isTestId(testId)) {
    const t = await testPortals(Number(testId));
    return t ? NextResponse.json(t) : NextResponse.json({ ok: false, error: "That test listing has gone." }, { status: 404 });
  }
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "A listing id is required." }, { status: 400 });
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  }
  try {
    return NextResponse.json({ ok: true, listingId: id, portals: await portalLinksFor(id) });
  } catch (e) {
    const { actor } = await whoIs(req).catch(() => ({ actor: null }));
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The portal links did not load. Try again in a minute.") : "The portal links did not load. Try again in a minute." },
      { status: 502 }
    );
  }
}
