import { NextRequest, NextResponse } from "next/server";
import { getResearch } from "@/lib/ma-research";

/**
 * GET /api/ma-research?address=…&postcode=…&beds=2
 *
 * The evidence behind a valuation. Read-only, and see lib/ma-research for why
 * comparables come from our own REX book rather than a data feed.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const address = (p.get("address") ?? "").trim();
  const postcode = (p.get("postcode") ?? "").trim();
  if (!address || !postcode) {
    return NextResponse.json({ error: "address and postcode are required" }, { status: 400 });
  }
  const radius = Number(req.nextUrl.searchParams.get("radius") ?? 0);
  const minRent = Number(req.nextUrl.searchParams.get("minRent") ?? 0);
  const maxRent = Number(req.nextUrl.searchParams.get("maxRent") ?? 0);
  const typeRaw = req.nextUrl.searchParams.get("type");
  const type = typeRaw === "H" || typeRaw === "F" ? typeRaw : undefined;
  /* Two different questions wearing one parameter.
     
     ?beds= absent or 0 means "any size" for the on-market LIST — that is what
     the Any beds control sends, and it used to be clamped up to 2, so Any
     silently meant two-bed. The area STATISTICS still need a size, because
     Homesearch has no all-sizes average, so they keep the old default. */
  const askedBeds = Math.min(6, Math.max(0, Math.round(Number(p.get("beds") ?? 0)) || 0));
  const statsBeds = askedBeds || 2;
  try {
    return NextResponse.json(await getResearch(address, postcode, statsBeds, {
      radiusMiles: Number.isFinite(radius) && radius > 0 ? radius : undefined,
      beds: askedBeds || undefined,
      minRent: minRent > 0 ? minRent : undefined,
      maxRent: maxRent > 0 ? maxRent : undefined,
      type,
    }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
