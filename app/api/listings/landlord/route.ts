import { NextRequest, NextResponse } from "next/server";
import { landlordForListing } from "@/lib/rex-landlord";
import { rexConfigured } from "@/lib/rex";

/**
 * GET /api/listings/landlord?id=<rex listing id>
 *
 * Who the landlord is, for the screens that are about to write to them. The
 * booker asks before composing a confirmation; the listing drawer asks to fill
 * its Landlord panel.
 *
 * Three outcomes, kept apart all the way to the screen:
 *   { landlord: {...} }            — a real person
 *   { landlord: null }             — REX genuinely holds no owner (~1 in 8)
 *   { ok: false, problem }         — REX didn't answer; we do NOT know
 *
 * The last two used to be the same thing, which is how "we couldn't reach REX"
 * would have read as "this property has no landlord".
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, problem: "No listing given." }, { status: 400 });
  }
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: false,
      problem: "REX isn't connected on this environment, so the landlord can't be looked up.",
    });
  }

  const answer = await landlordForListing(id);
  if (!answer.ok) return NextResponse.json({ ok: false, problem: answer.problem });
  return NextResponse.json({ ok: true, landlord: answer.landlord });
}
