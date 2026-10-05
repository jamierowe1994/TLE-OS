import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { testHomesFor } from "@/lib/test-overlay";
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

  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const scope = await scopeForWho(req, who);
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
    /* The tester's own test homes ride alongside the cached book, never in
       it: the book is shared, and its counts stay the business's own. */
    const [{ book, ageMs, stale }, tests] = await Promise.all([
      managedBookFor(scope.rexUserId),
      testHomesFor(who?.actor?.email).catch(() => []),
    ]);
    return NextResponse.json({
      ok: true,
      live: true,
      scope: scope.label,
      everything: scope.everything,
      ...book,
      ...(tests.length ? { properties: [...tests, ...book.properties] } : {}),
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
