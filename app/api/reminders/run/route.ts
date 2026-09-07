import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { runReminders } from "@/lib/reminders";

/**
 * The reminders run.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/reminders/run
 *
 * Every ten minutes from a Railway cron. Works out, for every person with
 * an OS account, what on their book needs them today (lib/reminders), writes
 * it to os_reminders, and clears whatever has been dealt with since. An
 * owner can also press it to see the run's own account of itself.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  const owner = await requireCapability(req, "see:everything");
  if (!owner && !cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const run = await runReminders();
  return NextResponse.json(run, { status: run.ok ? 200 : 503 });
}
