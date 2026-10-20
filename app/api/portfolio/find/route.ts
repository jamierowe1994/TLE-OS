import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { bookScope } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { currentLets } from "@/lib/current-lets";
import { addrOf, isRoomAddress, sameHome } from "@/lib/address-parse";
import { publicError } from "@/lib/public-error";

/**
 * GET ?id=<os_properties id | REX property id>&name=<address>
 *
 * Which page a home is on (/portfolio/<listing>), for screens that hold the
 * home by its property rather than its let: the clean sweep (an OS record,
 * pm-...) and the compliance drawer (a REX property id). Rooms share the
 * house's REX property, so the address picks the door. The person's own
 * book: the whole business for the office.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const who = hasDb() ? await whoIs(req).catch(() => null) : null;
    if (hasDb() && !who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
    let address = (req.nextUrl.searchParams.get("name") ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
    const scope = await bookScope(req, who);
    if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell which agent you are, so there's no book to look in." }, { status: 403 });

    /* An OS record: its REX property and its own address. */
    let rexId: string | null = /^\d+$/.test(id) ? id : null;
    if (!rexId && hasDb()) {
      const rows = await q<{ rex_property_id: string | null; address: string }>(`SELECT rex_property_id, address FROM os_properties WHERE id = $1`, [id]).catch(() => []);
      rexId = rows[0]?.rex_property_id ?? null;
      address ||= rows[0]?.address ?? "";
    }
    const { book } = await managedBookFor(scope.rexUserId);
    const atDoor = book.properties.filter((p) => p.propertyId === id || (rexId && p.propertyId === rexId));
    const door = address ? atDoor.filter((p) => sameHome(address, addrOf(p)) || (!isRoomAddress(address) && !isRoomAddress(addrOf(p)))) : atDoor;
    const pick = currentLets(door.length ? door : atDoor)[0] ?? (door.length ? door : atDoor)[0];
    if (!pick) {
      return NextResponse.json({ ok: false, error: scope.everything ? "This home isn't on Portfolio: it has no current let on the book." : "This home isn't in your book." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, listingId: String(pick.listingId) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The home couldn't be found just now. Try again in a minute.") }, { status: 500 });
  }
}
