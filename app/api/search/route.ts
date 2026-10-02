import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor, searchScope } from "@/lib/scope";
import { searchEverything } from "@/lib/search";
export type { Hit } from "@/lib/search";

/**
 * GET /api/search?q=… → the one search bar, made real (5 Sep 2026).
 *
 * James: "the search bar no longer works in any of the tabs". It never had:
 * every page header drew a bar, and only Listings wired it. This answers the
 * bar on every page: an address, a name, an email or a phone number, and
 * back come the property, the lead, the application and the deal that
 * match, each with the screen that opens it.
 *
 * Read from the caches the screens already fill (listings, leads, the
 * compliance book, Propoly's deals) so a keystroke never walks REX. Only
 * applications are read live, and they answer in about a second.
 * Scoped like everything else: an agent searches their own book.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (needle.length < 2) return NextResponse.json({ ok: true, hits: [] });
  const scope = await scopeFor(req);
  const rexUserId = await searchScope(req, scope);
  if (rexUserId === false) return NextResponse.json({ ok: true, hits: [], reason: "Your account isn't linked to your agent record yet, so search has nothing of yours to look through. Ask James to link it." });

  const hits = await searchEverything(needle, rexUserId);
  return NextResponse.json({ ok: true, hits });
}
