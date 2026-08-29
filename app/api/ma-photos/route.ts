import { NextRequest, NextResponse } from "next/server";
import { listingPhotos } from "@/lib/ma-research";

/**
 * GET /api/ma-photos?ids=16619342,16620113
 *
 * The rest of the photographs for properties already on the screen.
 *
 * SEPARATE FROM /api/ma-research ON PURPOSE. Homesearch has no batch gallery
 * endpoint, so this is one upstream call per listing — around a second for a
 * full list. Folding that into the research call would have held back the
 * cards, the map and the price pills for a second to deliver a feature that
 * only matters once an agent is already looking at a card.
 *
 * Read-only, and the token never leaves the server.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Politeness, and a ceiling on how long one request can take. */
const LANES = 8;
const MAX_IDS = 60;

export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, MAX_IDS);

  if (ids.length === 0) return NextResponse.json({ photos: {} });

  const photos: Record<string, string[]> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(LANES, ids.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= ids.length) return;
        const id = ids[i];
        /* A gallery that fails is an empty gallery, not a failed request. The
           card still has its lead photograph either way. */
        photos[String(id)] = await listingPhotos(id).catch(() => []);
      }
    })
  );

  return NextResponse.json({ photos });
}
