import { NextRequest, NextResponse } from "next/server";
import { portalStatsFor } from "@/lib/rex-portal-stats";
import { rexConfigured } from "@/lib/rex";
import { whoIs } from "@/lib/admin";
import { forAgent } from "@/lib/agent-words";

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
    return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });
  }
  try {
    const stats = await portalStatsFor(id);
    if (!stats) return NextResponse.json({ ok: false, error: "The portal figures for that listing did not load. Try again in a minute." }, { status: 502 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    const { actor } = await whoIs(req).catch(() => ({ actor: null }));
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The portal figures did not load. Try again in a minute.") : "The portal figures did not load. Try again in a minute." },
      { status: 500 }
    );
  }
}
