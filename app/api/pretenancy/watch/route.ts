import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { publicOrigin } from "@/lib/origin";
import { watchDeals, watchStatus, listDealEvents } from "@/lib/business/deal-watch";
import { switchOn } from "@/lib/switches";
import { refreshPropolyBooks, propolyDealsSavedAt } from "@/lib/business/propoly-deals";
import { dayUsage } from "@/lib/business/propoly-meter";

/**
 * The Propoly watcher.
 *
 * GET  → status: when it last looked, what it holds, the latest moves. Anyone
 *        with see:pretenancy, or the cron key.
 * POST → one run: compare the book to the last look, record the moves, tell
 *        the agents if that switch is on. Cron key only.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/pretenancy/watch
 *
 * Run it every five minutes. Since 27 Sep this is also THE one reader of
 * Propoly: each run first re-reads whichever books are due (deals every five
 * minutes in office hours, half-hourly otherwise; managers daily; completed
 * deals hourly) into the saved copy every screen reads, then compares. See
 * lib/business/propoly-deals. The first run seeds silently; see
 * lib/business/deal-watch.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "see:pretenancy"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [status, latest, armed, usage, savedAt] = await Promise.all([
    watchStatus(),
    listDealEvents({ limit: 20 }),
    switchOn("deal_watch_notify"),
    dayUsage(),
    propolyDealsSavedAt(),
  ]);
  return NextResponse.json({ ok: true, ...status, tellingAgents: armed, latest, dealsSavedAt: savedAt ? new Date(savedAt).toISOString() : null, propolyCallsToday: usage });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const read = await refreshPropolyBooks();
    const result = await watchDeals({ origin: publicOrigin(req) });
    return NextResponse.json({ ...result, read }, { status: result.ok ? 200 : 503 });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: publicError(e, "watch failed") }, { status: 500 });
  }
}
