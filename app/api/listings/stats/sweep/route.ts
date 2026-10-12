import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepMarket } from "@/lib/portal-market";

/**
 * POST /api/listings/stats/sweep   (x-cron-key: CRON_SECRET)
 *
 * The day's read of every live home's portal figures (lib/portal-market), so
 * the history builds every day whether or not anybody opens a listing's On
 * the portals. Skipped when today's are already in. Run by the lunchtime
 * Railway cron; opening the panel starts the same read if it hasn't run.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  const read = await sweepMarket().catch(() => -1);
  return NextResponse.json({ ok: read >= 0, read });
}
