import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { switchOn } from "@/lib/switches";

/**
 * Is Print Brochure switched on? (Erleta Vathej, ticket 47b2389c; James,
 * 10 Nov 2026.) The listing page and the Diary ask before they draw the
 * button. The brochure itself is app/brochure, which asks the switch again.
 *
 *   GET → { ok, armed }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, armed: await switchOn("listing_brochure") });
}
