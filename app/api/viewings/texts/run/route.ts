import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { runViewingTexts } from "@/lib/viewing-texts";

/**
 * The viewing reminder texts - an hour before each TLE viewing.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://tle-os.co.uk/api/viewings/texts/run
 *   add ?dry=1 to see who it would text without sending anything
 *
 * Every five minutes from os-cron-viewing-texts on Railway. Sends only with
 * the viewing_texts switch on; off, the run reports what it would have sent.
 * See lib/viewing-texts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

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
  /* A pretend clock, for a dry run only: "what would 2:05pm send?". Never
     honoured on a real run, so it cannot be used to send early. */
  const at = dry ? req.nextUrl.searchParams.get("at") : null;
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : undefined;
  const run = await runViewingTexts({ dry, now: when });
  const count = (s: string) => run.results.filter((r) => r.state === s).length;
  return NextResponse.json(
    { ...run, sent: count("sent"), would: count("would"), failed: count("failed"), skipped: count("skipped"), held: count("held") },
    { status: run.ok ? 200 : 503 }
  );
}
