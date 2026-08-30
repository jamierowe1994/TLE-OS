import { NextResponse } from "next/server";
import { stats } from "@/lib/plc-shadow";

/**
 * GET /api/plc/shadow → how the recommendation has held up against people.
 *
 * Read on one page, deliberately away from the screens compliance use while
 * deciding. Telling somebody "the rules are right 98% of the time" WHILE they
 * decide would destroy the measurement — they would no longer be an
 * independent check, they would be agreeing with a number.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, ...(await stats()) });
}
