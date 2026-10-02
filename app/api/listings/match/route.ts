import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeForWho } from "@/lib/scope";
import { hasDb } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { rexConfigured } from "@/lib/rex";
import { fetchKeys, type KeySet } from "@/lib/rex-keys";
import { testListingsFor } from "@/lib/test-overlay";

/**
 * THE LISTING BEHIND A DIARY ENTRY, AND ITS KEYS - ONE ROUND TRIP (2 Oct 2026).
 *
 *   GET ?address=<the appointment's where + what>
 *     → { ok, match: { propertyId, image, locality, name } | null,
 *         keysOk, keys }
 *
 * The viewing and appointment drawers used to download the whole listing
 * book (/api/listings: ~270 listings with every photo url and advert) to
 * match ONE address, then ask /api/keys for that property's keys. The same
 * match now happens here, against the same scoped book the board shows, and
 * the keys come back with it.
 *
 * The rule is the drawers' own, unchanged: live REX appointments carry no
 * listing link, so the street line of a listing must appear in the
 * appointment's text, and only a street line longer than six characters
 * counts - "Bristol" matches sixty properties and none of them reliably. A
 * wrong match would show somebody the wrong keys, so the first conservative
 * hit or nothing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const target = (req.nextUrl.searchParams.get("address") ?? "").toLowerCase().slice(0, 500);
  if (!target.trim()) return NextResponse.json({ ok: false, error: "Which address?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, live: false, match: null, keysOk: true, keys: [] });

  /* Whose book, as /api/listings decides it - an agent matches against their
     own listings and the tester's test listings, nobody else's. */
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, unlinked: true, match: null });

  try {
    const [book, tests] = await Promise.all([
      bookFor(scope.rexUserId),
      testListingsFor(who?.actor?.email).catch(() => []),
    ]);
    /* Tests first, as the board lists them. */
    const hit = [...tests, ...book.listings].find((l) => {
      const name = (l.name ?? "").toLowerCase();
      return name.length > 6 && target.includes(name);
    });
    if (!hit) return NextResponse.json({ ok: true, match: null, keysOk: true, keys: [] });

    const match = { propertyId: hit.propertyId ?? null, image: hit.image ?? null, locality: hit.locality, name: hit.name };
    if (!match.propertyId) return NextResponse.json({ ok: true, match, keysOk: true, keys: [] });
    let keysOk = true;
    let keys: KeySet[] = [];
    try {
      keys = (await fetchKeys([match.propertyId]))[match.propertyId] ?? [];
    } catch {
      /* The match still stands; the drawer says the keys could not be read. */
      keysOk = false;
    }
    return NextResponse.json({ ok: true, match, keysOk, keys });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "The listings did not answer.", match: null }, { status: 502 });
  }
}
