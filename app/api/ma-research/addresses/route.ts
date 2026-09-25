import { NextRequest, NextResponse } from "next/server";
import { findAddresses } from "@/lib/ma-research";

/**
 * GET /api/ma-research/addresses?postcode=WR1 3DB   every address Homesearch holds there
 * GET /api/ma-research/addresses?q=moor street       Homesearch's type-ahead, 3+ characters
 *
 * For picking the property by hand when match_address cannot find it. Read-only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const query = (p.get("q") ?? "").trim();
  const postcode = (p.get("postcode") ?? "").trim();
  if (!query && !postcode) {
    return NextResponse.json({ ok: false, error: "postcode or q is required" }, { status: 400 });
  }
  if (!process.env.HOMESEARCH_TOKEN) {
    return NextResponse.json({ ok: false, error: "Homesearch is not connected here." }, { status: 503 });
  }
  try {
    return NextResponse.json({ ok: true, addresses: await findAddresses({ postcode, query }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
