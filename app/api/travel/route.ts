import { NextRequest, NextResponse } from "next/server";
import { driveTime, bufferMinutes, type Point } from "@/lib/travel";
import { geocode } from "@/lib/geocode";

/**
 * "How long will it take me to get there?" — asked once, for every place the
 * agent might be setting off FROM.
 *
 * One destination (the property being booked), several origins (home, and
 * whatever was already in the diary before this slot). They go in a single
 * request because they are one question on screen and answering them in
 * separate round-trips makes the panel appear in pieces.
 *
 * The destination may be given as coordinates or as the plain address string
 * the booker is holding — most leads have never been through address lookup,
 * so a string is usually all there is.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LegIn = { id?: string; from?: Point; arriveBy?: string };

type Body = {
  to?: Point;
  toAddress?: string;
  legs?: LegIn[];
};

export async function POST(req: NextRequest) {
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a journey." }, { status: 400 });
  }

  const legsIn = Array.isArray(b.legs) ? b.legs.slice(0, 6) : [];
  if (!legsIn.length) {
    return NextResponse.json({ ok: false, error: "No starting points to measure from." }, { status: 400 });
  }

  /* Where we're going. Coordinates win when the caller has them; otherwise
     the address is geocoded here (cached, so repeat glances are free). */
  let to: Point | null =
    b.to && Number.isFinite(b.to.lat) && Number.isFinite(b.to.lng)
      ? { lat: b.to.lat, lng: b.to.lng }
      : null;
  let resolved: string | null = null;
  let postcode: string | null = null;
  /* Coordinates handed in by the caller are a picked address, so they're
     trusted. A geocoded string might only be an area — see lib/geocode. */
  let precise = true;

  if (!to) {
    const address = (b.toAddress ?? "").trim();
    if (!address) {
      return NextResponse.json({ ok: false, error: "No destination given." }, { status: 400 });
    }
    const found = await geocode(address);
    if (!found.ok) {
      // The destination is the one thing every leg needs. Failing it fails
      // the lot, and the panel says why rather than showing empty rows.
      return NextResponse.json({ ok: false, problem: found.problem });
    }
    to = { lat: found.at.lat, lng: found.at.lng };
    resolved = found.at.tidied;
    postcode = found.at.postcode;
    precise = found.at.precise;
  }

  const legs = await Promise.all(
    legsIn.map(async (leg, i) => {
      const id = leg.id ?? String(i);
      const from = leg.from;
      if (!from || !Number.isFinite(from.lat) || !Number.isFinite(from.lng)) {
        return { id, ok: false as const, problem: { code: "no_coords", says: "That starting point has no location." } };
      }
      const when = leg.arriveBy ? new Date(leg.arriveBy) : null;
      const answer = await driveTime(from, to!, when && !Number.isNaN(when.getTime()) ? when : null);
      if (!answer.ok) return { id, ok: false as const, problem: answer.problem };
      return {
        id,
        ok: true as const,
        minutes: answer.leg.minutes,
        miles: answer.leg.miles,
        withTraffic: answer.leg.withTraffic,
        /** What to actually block out — the drive, rounded up, plus parking. */
        buffer: bufferMinutes(answer.leg.minutes),
      };
    })
  );

  return NextResponse.json({ ok: true, to, resolved, postcode, precise, legs });
}
