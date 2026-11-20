import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { countLetsInProgress, LetsStillReading } from "@/lib/lets-in-progress";

/**
 * GET /api/lets/in-progress → the signed-in person's lets in progress, counted
 * on the server (Susan Liles, 20 Nov 2026, ticket 0573c824): the Applications
 * board's All tab, and the same count the PM Dashboard's Lets in Progress tile
 * reads (lib/lets-in-progress). ?quick=1 and ?fresh=1 read the applications
 * the way the board does (lib/applications-read).
 *
 * { ok, count, deals, waiting, wholeBook, at, stale? } or { ok: false, error, retry? }.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("fresh") === "1" ? "fresh" : sp.get("quick") === "1" ? "quick" : "";
  try {
    const lets = await countLetsInProgress((path) => new NextRequest(new URL(path, req.url), { headers: req.headers }), mode);
    return NextResponse.json({ ok: true, ...lets });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The lets in progress couldn't be counted just now."), ...(e instanceof LetsStillReading ? { retry: true } : {}) });
  }
}
