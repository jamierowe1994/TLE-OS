import { NextRequest, NextResponse } from "next/server";
import { geocode } from "@/lib/geocode";

/**
 * Place an address or postcode, for the Radar radius search.
 *
 * GET /api/radar/near?q=NN1 5EJ  → { ok, label, lat, lon }
 *
 * A bare postcode goes to postcodes.io: free, no key, and it answers with the
 * postcode's centroid, which is what a radius search wants. Anything longer
 * goes through lib/geocode (Google), which needs GOOGLE_MAPS_API_KEY and says
 * so plainly when it is missing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ ok: false, error: "Type an address or a postcode." }, { status: 400 });

  if (POSTCODE.test(q) || OUTCODE.test(q)) {
    const kind = OUTCODE.test(q) ? "outcodes" : "postcodes";
    try {
      const r = await fetch(`https://api.postcodes.io/${kind}/${encodeURIComponent(q.replace(/\s+/g, ""))}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const j = (await r.json()) as {
        status: number;
        result?: { postcode?: string; outcode?: string; latitude: number | null; longitude: number | null };
      };
      if (r.ok && j.result && j.result.latitude != null && j.result.longitude != null) {
        return NextResponse.json({
          ok: true,
          label: j.result.postcode ?? j.result.outcode ?? q.toUpperCase(),
          lat: j.result.latitude,
          lon: j.result.longitude,
        });
      }
      if (r.status === 404) {
        return NextResponse.json({ ok: false, error: `"${q.toUpperCase()}" is not a postcode we can place.` }, { status: 404 });
      }
    } catch {
      /* Fall through to the address geocoder. */
    }
  }

  const g = await geocode(q);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.problem.says }, { status: 422 });
  return NextResponse.json({
    ok: true,
    label: g.at.postcode ?? g.at.tidied ?? q,
    lat: g.at.lat,
    lon: g.at.lng,
  });
}
