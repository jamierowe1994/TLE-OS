import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { bookScope, scopeForWho } from "@/lib/scope";
import { homeLinksFor } from "@/lib/home-links";

/**
 * GET /api/home-links?from=listing|home&listing=…&property=…&address=…
 *   → the same home's listing, managed home and let in progress (lib/home-links),
 *     for the toggle at the head of a listing's page and a home's page.
 * Scoped as the pages are: Listings and Applications by the person's own
 * book, Portfolio by bookScope.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (hasDb() && !who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") === "home" ? "home" : "listing";
  const [listings, homes] = await Promise.all([scopeForWho(req, who), bookScope(req, who)]);
  try {
    const links = await homeLinksFor(
      {
        from,
        listingId: sp.get("listing")?.trim() || null,
        propertyId: sp.get("property")?.trim() || null,
        address: (sp.get("address") ?? "").slice(0, 300),
      },
      /* An unlinked agent's book is nobody's: nothing to link to. */
      { listings: listings.unlinked ? false : listings.rexUserId, homes: homes.unlinked ? false : homes.rexUserId }
    );
    return NextResponse.json({ ok: true, ...links });
  } catch {
    return NextResponse.json({ ok: false, listing: null, home: null, let: null });
  }
}
