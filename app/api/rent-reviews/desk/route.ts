import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { allReviews, rentReviewOn } from "@/lib/rent-reviews";

/**
 * GET -> every Scottish rent review sent, for Michael's Rent Reviews tab
 * (/compliance-desk/rent-reviews). The desk's own capability, and the
 * switch. Reads only.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:agent-compliance")) return NextResponse.json({ ok: false, error: "That's the compliance desk's." }, { status: 403 });
  if (!(await rentReviewOn(actor))) return NextResponse.json({ ok: false, error: "The Scottish rent review isn't switched on for you." }, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: true, reviews: [], stored: false });
  return NextResponse.json({ ok: true, stored: true, reviews: await allReviews() }, { headers: { "cache-control": "private, no-store" } });
}
