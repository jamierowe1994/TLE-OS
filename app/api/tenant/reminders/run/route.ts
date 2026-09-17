import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { runTenantReminders } from "@/lib/tenant-reminders";

/**
 * The tenant reminders run - passport nudges and the morning viewing reminder.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/tenant/reminders/run
 *   add ?dry=1 to see who it would write to without sending anything
 *
 * Hourly, chained after /api/reminders/run on the os-cron-reminders service.
 * Sends only with the tenant_reminders switch on (and customer email); with it
 * off, the run reports what it would have sent. See lib/tenant-reminders.
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
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  /* A pretend clock, for a dry run only: "what would 7am tomorrow send?".
     Never honoured on a real run, so it cannot be used to send early. */
  const at = dry ? req.nextUrl.searchParams.get("at") : null;
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : undefined;
  const run = await runTenantReminders({ dry, now: when });
  const count = (s: string) => run.results.filter((r) => r.state === s).length;
  return NextResponse.json(
    { ...run, sent: count("sent"), would: count("would"), failed: count("failed"), skipped: count("skipped") },
    { status: run.ok ? 200 : 503 }
  );
}
