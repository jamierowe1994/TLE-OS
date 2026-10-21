import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { pollThreads } from "@/lib/mail-threads";

/**
 * Read every live PLC email thread once (lib/mail-threads).
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/mail-threads/poll
 *
 * Runs every five minutes from inside the Propoly watcher's own timer
 * (/api/pretenancy/watch), so it needs no cron of its own; this door is for
 * a run by hand, by an owner or with the cron key.
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
  if (!cronAuthorised(req) && !(await requireCapability(req, "see:everything"))) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await pollThreads()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The check failed.") }, { status: 500 });
  }
}
