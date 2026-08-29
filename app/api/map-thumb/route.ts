import { NextRequest, NextResponse } from "next/server";

/**
 * A tiny picture of a map, for the toggle button.
 *
 * GET /api/map-thumb?lat=52.24&lon=-0.9  → image/png
 *
 * ── Why this is proxied rather than fetched from the browser ──────────────
 *
 * GOOGLE_MAPS_API_KEY has no NEXT_PUBLIC_ prefix, which means it is a SERVER
 * secret and nothing in the browser can read it. That is the right way round
 * and worth keeping: a Maps key in client JavaScript is a key anybody can lift
 * and spend against the account, and referrer restrictions are a speed bump
 * rather than a lock.
 *
 * So the browser asks US for a picture, and we ask Google. The key never
 * leaves the server, the button is a plain <img>, and if the key is ever
 * rotated nothing in the client needs redeploying.
 *
 * ── Why Static Maps and not the JavaScript SDK ────────────────────────────
 *
 * The button is a 44px circle showing roughly where the property is. Loading
 * a whole interactive map library to draw it would cost more than the screen
 * it sits on, and the JS SDK cannot run without exposing the key anyway.
 * One image request, cached hard, is the honest size of this job.
 *
 * The main map stays Leaflet on CARTO tiles — free, keyless, and already the
 * look James asked for.
 */

export const runtime = "nodejs";
/* The same few coordinates over and over — an appraisal has one subject. A day
 * of caching turns this into one Google request per property per day. */
export const revalidate = 86400;

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  /* No key is not an error. The caller draws its own fallback rather than
     showing a broken image — the button still works, it just isn't a map. */
  if (!key) return new NextResponse(null, { status: 404 });

  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lon}` +
    `&zoom=14&size=88x88&scale=2&maptype=roadmap` +
    /* No marker and no labels: at 44px a pin is most of the picture and the
       words are unreadable. It only has to say "this is a map". */
    `&style=feature:poi|visibility:off` +
    `&style=feature:administrative|element:labels|visibility:off` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return new NextResponse(null, { status: 502 });
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/png",
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
