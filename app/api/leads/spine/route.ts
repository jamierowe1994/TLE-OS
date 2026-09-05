import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { allSpines } from "@/lib/lead-touches";

/**
 * GET /api/leads/spine → every lead the OS has logged something against,
 * folded to its spine. The Leads list reads this once and lets the Stage
 * column say "2nd contact" or "Nurture" instead of REX's three words.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const spines = await allSpines();
  return NextResponse.json({ ok: true, spines });
}
