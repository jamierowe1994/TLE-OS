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
  const beds = Math.min(6, Math.max(1, Number(p.get("beds") ?? 2) || 2));
  try {
    return NextResponse.json(await getResearch(address, postcode, beds));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
