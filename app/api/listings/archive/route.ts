import { NextRequest, NextResponse } from "next/server";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { scopeFor } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { bookFor, retiredFor } from "@/lib/listings-cache";
import { stampArchive } from "@/lib/listings-archive-view";
import { setArchive } from "@/lib/listing-archive-store";
import { archiveOf } from "@/lib/listing-archive";
import { rexConfigured } from "@/lib/rex";
import { forAgent } from "@/lib/agent-words";

/**
 * THE ARCHIVE: everything that stopped moving.
 *
 * Two sources, one list:
 *
 *   1. Drafts past the two-month cap, still `current` in REX. They are in the
 *      main book already, so they cost nothing extra.
 *   2. REX's `withdrawn` rentals - marketed, or half-marketed, and taken off
 *      without a tenant. The OS has never fetched these, which is why a
 *      property the agency lost simply disappeared from the product.
 *
 * Fetched on the FIRST OPEN of the Archived tab rather than with the board,
 * because (2) is three more REX pages and REX takes about fifteen seconds a
 * call. Every agent opening Listings should not pay for a tab most of them
 * will not open.
 *
 * Nothing here writes to REX. Archiving is a view of the same book.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: true, live: false, listings: [], reason: "The listings system isn't connected here." });
  }
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: true,
      live: false,
      listings: [],
      unlinked: true,
      reason: "We can't tell which agent you are in the listings system, so we can't show you your archive.",
    });
  }

  try {
    /* Both reads in parallel. The book is almost always already cached by the
       time this is asked for - the agent has been looking at it - so the wait
       is the withdrawn pull alone. */
    const [book, retired] = await Promise.all([bookFor(scope.rexUserId), retiredFor(scope.rexUserId)]);
    const all = await stampArchive([...book.listings, ...retired]);
    const listings = all.filter((l) => l.archived);
    return NextResponse.json({
      ok: true,
      live: true,
      scope: scope.label,
      listings,
      counts: {
        total: listings.length,
        staleDrafts: listings.filter((l) => l.archiveReason === "stale-draft").length,
        byHand: listings.filter((l) => l.archiveReason === "by-hand").length,
        withdrawn: listings.filter((l) => l.archiveReason === "withdrawn").length,
      },
    });
  } catch (e) {
    const { actor } = await whoIs(req).catch(() => ({ actor: null }));
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." },
      { status: 502 }
    );
  }
}

/** Put one listing away early, or bring it back into drafts. */
export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  const me = subject ?? actor;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string; note?: string };
  const id = String(body.id ?? "").trim();
  if (isTestId(id)) return NextResponse.json({ ok: false, error: TEST_REFUSAL, test: true }, { status: 409 });
  const action = body.action === "restore" ? "restored" : body.action === "archive" ? "archived" : null;
  if (!id || !action) {
    return NextResponse.json({ ok: false, error: "Which listing, and archive or restore?" }, { status: 400 });
  }

  /* A live advert and a let-agreed property are never archivable - the rule
     says so and the button is not offered, but a POST is a POST and the check
     belongs where the write happens, not only where the button is drawn. */
  if (action === "archived") {
    const scope = await scopeFor(req);
    const book = await bookFor(scope.rexUserId);
    const l = book.listings.find((x) => String(x.id) === id);
    if (l && (l.letAgreed || l.publicationStatus === "published")) {
      return NextResponse.json(
        { ok: false, error: "That one is live or let agreed - it can't be archived from here." },
        { status: 400 }
      );
    }
  }

  try {
    await setArchive(id, action, me.email || me.name || null, body.note ?? null);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't save that." }, { status: 500 });
  }

  /* Hand back where the listing now stands, so the screen can update from the
     rule rather than from its own guess at what the button did. */
  const scope = await scopeFor(req);
  const book = await bookFor(scope.rexUserId);
  const l = book.listings.find((x) => String(x.id) === id) ?? null;
  const state = l ? archiveOf(l, { state: action, at: new Date().toISOString() }) : null;
  return NextResponse.json({ ok: true, id, state });
}
