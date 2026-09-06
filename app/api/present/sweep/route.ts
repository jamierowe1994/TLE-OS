import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeExpiredPresentations, PRESENTATION_DAYS } from "@/lib/present-store";

/**
 * The daily sweep of expired presentations.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/present/sweep
 *
 * A deck past its fortnight is also deleted the moment somebody opens it, so
 * this only ever finds the ones nobody came back to. Cron key only: deleting
 * is not something a URL should do for whoever finds it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const { deleted } = await purgeExpiredPresentations();
  return NextResponse.json({ ok: true, deleted, olderThanDays: PRESENTATION_DAYS });
}
