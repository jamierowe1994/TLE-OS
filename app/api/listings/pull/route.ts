import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { assertNotViewingAs } from "@/lib/view-as";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { toListing } from "@/lib/rex-listings";
import { pullListing } from "@/lib/pulled-listings";
import { invalidateListingBook } from "@/lib/listings-cache";

/**
 * POST /api/listings/pull { id } → carry this REX listing in the OS.
 *
 * The other half of /api/search/rex. Somebody searched REX, found a property
 * the OS does not hold, and asked for it. From here on the Listings board
 * carries it like any other.
 *
 * ── It is a read of REX, never a write ────────────────────────────────────
 *
 * REX is read-only for us. This reads one listing and records, in our own
 * table, that we want it in the book. Nothing is sent to REX and nothing in
 * REX changes.
 *
 * ── Scoped at REX, not here ───────────────────────────────────────────────
 *
 * The same rule as the search that found it: an agent may pull only a listing
 * that REX says is theirs, and REX is asked, with its own agent filter, rather
 * than us reading an agent id off a row and believing it. An owner may pull
 * anything, because an owner can already see everything.
 *
 * ── Not while wearing somebody else's face ────────────────────────────────
 *
 * A pull is a small write to our own database, and a view-as is read-only -
 * otherwise a property appears on somebody's board with no record of who put
 * it there.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 403 });
  }
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  }

  const scope = await scopeFor(req);
  const mine = scope.rexUserId ?? null;
  if (!scope.everything && !mine) {
    return NextResponse.json({ ok: false, error: "Connect your listings account on your Profile first." }, { status: 403 });
  }

  /* Ask REX for it, with the agent filter when there is one. A listing that
     is not theirs simply does not come back, which is the refusal. */
  const res = await rexCall("Listings", "search", {
    criteria: [
      { name: "id", value: id },
      /* Lettings only. The book has always carried this criterion, and
         without it here the search box becomes a way to pull the sales
         business's stock into a lettings OS one address at a time. */
      { name: "listing_category_id", value: "residential_rental" },
      ...(!scope.everything && mine ? [{ name: "listing_agent_1_id", value: mine }] : []),
    ],
    limit: 1,
  }).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json({ ok: false, error: "The listings system did not answer just now. Try again in a minute." }, { status: 502 });
  }
  const row = rexRows(res.result)[0];
  if (!row) {
    return NextResponse.json({ ok: false, error: "That listing is not a lettings property of yours." }, { status: 404 });
  }

  /* The book's own mapper, so the address in the log reads exactly as it does
     on the board rather than whichever REX field happened to be at the top. */
  const address = toListing(row as never).name || null;

  await pullListing(id, address, actor.email ?? actor.id);
  /* The board is cached per scope; it has to be rebuilt or the property they
     just asked for is not there when they arrive. */
  await invalidateListingBook();

  return NextResponse.json({ ok: true, id, address, href: `/listings?open=${encodeURIComponent(id)}` });
}
