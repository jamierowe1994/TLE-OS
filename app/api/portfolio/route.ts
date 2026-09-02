import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";

/**
 * The managed book for the Portfolio screen.
 *
 * Scoped the same way as /api/listings: an owner gets the business, an agent
 * gets their own leased listings, and an agent whose OS account is not linked
 * to a REX user gets a clear sentence rather than everybody's book.
 *
 * No static fallback. Listings has one because it predates the live-figures
 * rule; a portfolio standing in with somebody else's numbers is exactly what
 * that rule forbids. Not connected, or failed, is said out loud.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: false,
      live: false,
      error: "REX isn't connected on this environment, so there is no book to show.",
    });
  }

  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: false,
      live: false,
      unlinked: true,
      error:
        "We can't tell which REX user you are, so we can't show you your portfolio — and we won't show you everybody's. Ask James to link your account.",
    });
  }

  try {
    const { book, ageMs, stale } = await managedBookFor(scope.rexUserId);
    return NextResponse.json({
      ok: true,
      live: true,
      scope: scope.label,
      everything: scope.everything,
      ...book,
      ageMs,
      ...(stale ? { stale: true } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, live: true, error: e instanceof Error ? e.message : "REX didn't answer." },
      { status: 502 }
    );
  }
}
