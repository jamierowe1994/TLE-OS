import { NextRequest, NextResponse } from "next/server";
import { portalStatsFor } from "@/lib/rex-portal-stats";
import { rexConfigured } from "@/lib/rex";

/**
 * What the portals did with one listing.
 *
 * Read-only, through the office's service account — deliberately. Per-user
 * REX tokens are for anything we WRITE, so records carry the name of whoever
 * did the thing. Nobody needs to prove who they are to look at a view count,
 * and asking them to would put a login in front of a number.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "A listing id is required." }, { status: 400 });
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  }
  try {
    const stats = await portalStatsFor(id);
    if (!stats) return NextResponse.json({ ok: false, error: "REX wouldn't answer for that listing." }, { status: 502 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Portal stats failed." },
      { status: 500 }
    );
  }
}
