import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { hasDb } from "@/lib/db";
import type { ListingBook, OsListing } from "@/lib/rex-listings";
import { cacheKeyFor, heldFor, refresh, FRESH_MS, STALE_MS } from "@/lib/listings-cache";
import { withArchiveState } from "@/lib/listings-archive-view";
import { rexConfigured } from "@/lib/rex";
import { whoIs } from "@/lib/admin";
import { forAgent } from "@/lib/agent-words";
import { testListingsFor } from "@/lib/test-overlay";

/**
 * The tester's own test listings on the front of the book (lib/test-overlay):
 * a test file past its take-on has a listing live on the portals that REX has
 * never heard of. Only the person who made it sees it, and it is never in the
 * counts that report the business.
 *
 * Takes the test listings already read (in parallel with the archive state,
 * 2 Oct 2026) rather than asking whoIs and the database again in series.
 */
function withTests<T extends { listings: unknown[] }>(payload: T, tests: OsListing[]): T {
  if (!tests.length) return payload;
  const stamped = tests.map((l) => ({ ...l, archived: false, archiveReason: null, archivedSince: null, archiveAgeDays: null, test: true }));
  return { ...payload, listings: [...stamped, ...payload.listings] };
}

/**
 * The rental book, cached — same two layers as the leads route (memory for
 * speed, os_cache so the first person in after a deploy doesn't pay for
 * everyone) and the same stale-while-revalidate manners.
 *
 * The book changes far more slowly than the lead feed, so it holds longer:
 * a listing added five minutes ago is not the emergency a lead is.
 *
 * The cache itself lives in lib/listings-cache.ts, because the write-up route
 * has to be able to clear it and a route module is the wrong place to keep
 * state another route owns a share of.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: true,
      live: false,
      /* The ONLY answer that lets the page show the saved export. */
      demo: true,
      reason: "The listings system isn't connected here, so a saved copy is standing in.",
    });
  }

  /* WHOSE BOOK. Resolved before anything is fetched or read from cache.
     The person is read ONCE and used for both the scope and the test
     listings - it used to be read twice, in series (2 Oct 2026). A failed
     read here leaves scopeForWho to ask again and fail as it always did. */
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: true,
      live: false,
      unlinked: true,
      reason:
        "We can't tell which agent you are in the listings system, so we can't show you your listings - and we won't show you everybody's. Ask James to link your account.",
    });
  }
  const key = cacheKeyFor(scope.rexUserId);

  /* The tester's own listings are read alongside the cached book, not after it. */
  const tests: Promise<OsListing[]> =
    req.nextUrl.searchParams.get("tests") === "0" ? Promise.resolve([]) : testListingsFor(who?.actor?.email).catch(() => []);
  const held = await heldFor(key);
  const age = held ? Date.now() - held.at : Infinity;

  /* The archive state is stamped on at SERVE time, never baked into the
     cached book. The book is cached for ten minutes; the overrides change the
     instant somebody presses Archive, and a listing that stayed put for ten
     minutes after being archived would read as a button that does nothing. */
  const serve = async (book: ListingBook) => {
    const [archived, mine] = await Promise.all([withArchiveState(book), tests]);
    return withTests(archived, mine);
  };
  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await serve(held.book)), ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await serve(held.book)), ageMs: age, stale: true });
  }

  try {
    const fresh = await refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await serve(fresh.book)), ageMs: 0 });
  } catch (e) {
    if (held) return NextResponse.json({ ok: true, live: true, scope: scope.label, ...(await serve(held.book)), ageMs: age, stale: true });
    const actor = who?.actor ?? null;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." },
      { status: 502 }
    );
  }
}
