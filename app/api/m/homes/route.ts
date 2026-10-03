import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { liveBook } from "@/lib/tenant-matching";
import { pointsFor } from "@/lib/postcode-geo";
import { milesBetween, postcodeIn } from "@/lib/m-match";

/**
 * GET /api/m/homes?near=<address with a postcode>&rent=875 - Find a Home on
 * the phone (3 Oct 2026), the other way round from Email the Database: one
 * tenant, the live homes around where they want to be. READ ONLY: the send
 * is the desk's own POST /api/leads/email-properties.
 *
 * The live book is the one the automatic tenant emails offer (liveBook:
 * published, not let agreed, with a rent), so nobody is sent a home they
 * cannot apply for. Within ten miles, nearest first; the phone narrows it.
 * "Similar rent" is the matcher's own band - within a fifth either way.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MILES = 10;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  const near = req.nextUrl.searchParams.get("near") ?? "";
  const rent = Number(req.nextUrl.searchParams.get("rent")) || null;
  const pc = postcodeIn(near);
  if (!pc) return NextResponse.json({ ok: false, said: "There is no postcode on their record, so there is nowhere to search around." }, { status: 400 });

  try {
    const [points, book] = await Promise.all([pointsFor([pc]), liveBook()]);
    const at = points.get(pc) ?? null;
    if (!at) return NextResponse.json({ ok: false, said: `${pc} could not be found on the map.` }, { status: 404 });

    /* REX's pin first, the postcode where a home has none. */
    const unplaced = book.filter((l) => (l.lat == null || l.lng == null) && l.postcode).map((l) => l.postcode!);
    const more = unplaced.length ? await pointsFor(unplaced).catch(() => new Map()) : new Map();

    const homes = book
      .map((l) => {
        const p = l.lat != null && l.lng != null ? { lat: l.lat, lng: l.lng } : l.postcode ? (more.get(l.postcode.toUpperCase().replace(/\s+/g, " ").trim()) ?? null) : null;
        if (!p) return null;
        const miles = Math.round(milesBetween(at, p) * 10) / 10;
        if (miles > MAX_MILES) return null;
        return {
          id: String(l.id),
          name: l.name,
          locality: l.locality,
          rent: l.rent,
          rentPeriod: l.rentPeriod,
          rentMonthly: l.rentMonthly,
          image: l.image,
          lat: p.lat,
          lng: p.lng,
          miles,
          similarRent: rent ? Math.abs((l.rentMonthly ?? 0) - rent) <= rent * 0.2 : null,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => a.miles - b.miles);

    return NextResponse.json({ ok: true, at: { ...at, postcode: pc }, homes });
  } catch {
    return NextResponse.json({ ok: false, said: "The homes did not load. Try again in a minute." }, { status: 502 });
  }
}
