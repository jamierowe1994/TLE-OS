import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import {
  addDistricts,
  PATCH_DISTRICTS,
  radarSummary,
  refreshProspects,
  seedPatch,
  sendDigest,
  sweepPatch,
  watchedDistricts,
} from "@/lib/radar";

/**
 * The Landlord Radar run: sweep the patch, derive the prospects, send the digest.
 *
 * GET  → DRY RUN. Which districts are watched, when each last ran, and the
 *        current summary. Writes nothing.
 * POST → the real run. Cron key only.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/radar/run
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" ".../run?add=MK40,MK41"   # grow the patch
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" ".../run?refresh=1"      # rescore only, no sweep
 *
 * WHY IT SEEDS ITSELF: a scheduler that runs a job which quietly watches
 * nothing reports green forever. With no districts on file the first POST
 * seeds NN and MK — the patch James named on 2 Sep — and says so in the
 * response. Growing it afterwards is ?add=.
 *
 * Same machine-route rule as the capture: this path is in MACHINE_ROUTES in
 * middleware.ts, authenticates itself, and fails shut on a missing secret.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* Thirty-seven districts, each paged, each with a pause. The biggest (NN1,
   725 rows) is three pages. Comfortably inside this. */
export const maxDuration = 800;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  }
  const districts = await watchedDistricts();
  return NextResponse.json({
    ok: true,
    dryRun: true,
    capability: ["district-sweep", "events", "prospects", "digest"],
    watching: districts.length,
    districts,
    patch: PATCH_DISTRICTS,
    summary: await radarSummary(),
    note:
      districts.length === 0
        ? "Nothing is being watched yet. The first POST seeds NN and MK."
        : "POST with the cron key to sweep these.",
  });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  }

  const addParam = req.nextUrl.searchParams.get("add");
  const addedByHand = addParam ? await addDistricts(addParam, "cron") : [];
  const seeded = (await watchedDistricts()).length === 0 ? await seedPatch("cron") : [];

  if (req.nextUrl.searchParams.get("refresh")) {
    /* Rescore from what is already captured. Seconds, not minutes — for
       after a weight change, or to check the derivation without a sweep. */
    const prospects = await refreshProspects();
    return NextResponse.json({ ok: true, refreshedOnly: true, seeded, addedByHand, prospects, summary: await radarSummary() });
  }

  const results = await sweepPatch();
  const skipped = results.filter((r) => r.skipped);
  const prospects = await refreshProspects();

  let digest: { sent: string[]; skipped: string | null };
  try {
    digest = await sendDigest();
  } catch (e) {
    digest = { sent: [], skipped: `Digest failed: ${(e as Error).message}` };
  }

  return NextResponse.json({
    ok: true,
    seeded,
    addedByHand,
    swept: results.length - skipped.length,
    skipped: skipped.length,
    skippedDetail: skipped,
    truncated: results.filter((r) => r.truncated).map((r) => r.sector),
    seen: results.reduce((n, r) => n + r.seen, 0),
    newRows: results.reduce((n, r) => n + r.newRows, 0),
    newlyLetAgreed: results.reduce((n, r) => n + r.newlyLetAgreed, 0),
    goneNow: results.reduce((n, r) => n + r.goneNow, 0),
    events: results.reduce((n, r) => n + r.events, 0),
    prospects,
    digest,
    summary: await radarSummary(),
    results,
  });
}
