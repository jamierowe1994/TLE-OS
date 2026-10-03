import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { isTestId } from "@/lib/test-overlay";
import { TEST_REFUSAL } from "@/lib/test-listing-answers";
import { DAYS, matchFor } from "@/lib/mail-database";
import { pointsFor } from "@/lib/postcode-geo";
import { milesBetween } from "@/lib/m-match";

/**
 * GET /api/m/match?listing=843312 - Email the Database on the phone (3 Oct
 * 2026). Exactly the desk's Mail the database people (lib/mail-database),
 * with where each of them is looking, so the phone can put them on a map
 * around the home and narrow them by distance. READ ONLY: the send is the
 * desk's own POST /api/listings/email-out, with every one of its checks.
 *
 * A person is placed at the home they asked about - the honest stand-in for
 * where they want to live, as the match itself uses it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHOW = 200;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("listing")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, said: "Which property?" }, { status: 400 });
  if (isTestId(id)) return NextResponse.json({ ok: false, said: TEST_REFUSAL, test: true }, { status: 409 });
  if (!hasDb()) return NextResponse.json({ ok: false, said: "The lead book is not on this environment, so there is nobody to match." }, { status: 503 });

  try {
    const { home, people, alreadySent } = await matchFor(id);
    if (!home) return NextResponse.json({ ok: false, notLive: true, said: "Put it live on the portals first. Only a home people can apply for is sent out." }, { status: 409 });

    /* REX's pin first; the postcode where a home has none. */
    const missing = [home, ...people].filter((x) => x.lat == null || x.lng == null);
    const pcs = missing.map((x) => ("postcode" in x ? x.postcode : null)).filter((p): p is string => Boolean(p));
    const points = pcs.length ? await pointsFor(pcs).catch(() => new Map()) : new Map();
    const pointOf = (lat: number | null, lng: number | null, postcode: string | null) =>
      lat != null && lng != null ? { lat, lng } : postcode ? (points.get(postcode.toUpperCase().replace(/\s+/g, " ").trim()) ?? null) : null;
    const at = pointOf(home.lat, home.lng, home.postcode);

    return NextResponse.json({
      ok: true,
      days: DAYS,
      alreadySent,
      home: {
        id: String(home.id),
        name: home.name,
        locality: home.locality,
        rent: home.rent,
        rentPeriod: home.rentPeriod,
        image: home.image,
        lat: at?.lat ?? null,
        lng: at?.lng ?? null,
      },
      people: people.slice(0, SHOW).map((p) => ({
        ...p,
        miles: at && p.lat != null && p.lng != null ? Math.round(milesBetween(at, { lat: p.lat, lng: p.lng }) * 10) / 10 : null,
      })),
      total: people.length,
    });
  } catch {
    return NextResponse.json({ ok: false, said: "The matches did not load. Try again in a minute." }, { status: 502 });
  }
}
