import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { assembled } from "@/lib/applications-board";
import { rexConfigured } from "@/lib/rex";
import { testApplicationsFor } from "@/lib/test-overlay";
import { decisionsFor } from "@/lib/offer-decisions";

/**
 * GET /api/offers/open -> { byListing: { [listingId]: n }, total }
 *
 * The offers still waiting on a decision, per listing (7 Oct 2026). Offers
 * live on their listing until accepted (James), so the Listings board's
 * "Offers in" tab and the Applications page's "Open offers" count read this.
 *
 * Open = not accepted or declined, here or in REX, and not closed: REX
 * applications in the same scope as the board, offers saved in the OS with
 * no decision, and the tester's own test offers still received. Read only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor || !can(actor.role, "staff:internal")) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const byListing: Record<string, number> = {};
  const add = (id: unknown) => {
    const k = String(id ?? "");
    if (k) byListing[k] = (byListing[k] ?? 0) + 1;
  };

  try {
    const [rex, os, tests] = await Promise.all([
      (async () => {
        if (!rexConfigured()) return [];
        const scope = await scopeForWho(req, who);
        if (scope.unlinked) return [];
        const { held } = await assembled(scope.rexUserId);
        const { applications, closed } = held.value;
        return applications.filter((a) => (a.status === "received" || a.status === "communicated") && !closed.get(a.id));
      })().catch(() => []),
      hasDb()
        ? q<{ listing_id: string }>(
            `SELECT r.listing_id FROM os_tenant_viewing_responses r
              WHERE r.kind = 'offer' AND r.listing_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM os_offer_decisions d WHERE d.ref = 'os:' || r.id)`
          ).catch(() => [])
        : Promise.resolve([]),
      testApplicationsFor(actor.email).catch(() => []),
    ]);
    const decided = await decisionsFor(rex.map((a) => `rex:${a.id}`));
    for (const a of rex) if (!decided.has(`rex:${a.id}`)) add(a.listingId);
    for (const r of os) add(r.listing_id);
    for (const t of tests) if (t.status === "received" || t.status === "communicated") add(t.listingId);
    const total = Object.values(byListing).reduce((n, x) => n + x, 0);
    return NextResponse.json({ ok: true, byListing, total });
  } catch (e) {
    console.error("open offers failed", e);
    return NextResponse.json({ ok: false, error: "Couldn't count the offers." }, { status: 500 });
  }
}
