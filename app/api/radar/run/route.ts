import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
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
  const runs = await q<Record<string, unknown>>(
    `SELECT id, status, swept, skipped, seen, new_rows, events, active, quiet, digest, error, started_at, finished_at
       FROM os_radar_runs ORDER BY started_at DESC LIMIT 3`
  );
  return NextResponse.json({
    ok: true,
    dryRun: true,
    runs,
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

  /* THE RUN ANSWERS AT ONCE. Both feeds for 44 districts take two to three
     minutes, and the edge in front of Railway closes any request at 100
     seconds with a 524 - measured 2 Sep, the run had finished server-side
     and the caller was told it failed. So the work is detached, the row in
     os_radar_runs is the answer, and GET reports it. ?wait=1 keeps the old
     synchronous shape for a laptop. */
  const running = await q<{ id: number }>(
    `SELECT id FROM os_radar_runs WHERE status = 'running' AND started_at > NOW() - INTERVAL '30 minutes'`
  );
  if (running.length) {
    return NextResponse.json({ ok: false, error: "A run is already going.", runId: running[0].id }, { status: 409 });
  }
  const [run] = await q<{ id: number }>(`INSERT INTO os_radar_runs DEFAULT VALUES RETURNING id`);
  const runId = run.id;

  const work = async () => {
    try {
      const results = await sweepPatch();
      const skipped = results.filter((r) => r.skipped);
      const prospects = await refreshProspects();
      let digest: { sent: string[]; skipped: string | null };
      try {
        digest = await sendDigest();
      } catch (e) {
        digest = { sent: [], skipped: `Digest failed: ${(e as Error).message}` };
      }
      await q(
        `UPDATE os_radar_runs
            SET status = 'done', swept = $2, skipped = $3, seen = $4, new_rows = $5, events = $6,
                active = $7, quiet = $8, digest = $9, finished_at = NOW()
          WHERE id = $1`,
        [
          runId,
          results.length - skipped.length,
          skipped.length,
          results.reduce((n, r) => n + r.seen, 0),
          results.reduce((n, r) => n + r.newRows, 0),
          results.reduce((n, r) => n + r.events, 0),
          prospects.active,
          prospects.quiet,
          digest.sent.length ? `sent to ${digest.sent.join(", ")}` : digest.skipped,
        ]
      );
      return { results, skipped, prospects, digest };
    } catch (e) {
      await q(`UPDATE os_radar_runs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`, [runId, (e as Error).message]);
      throw e;
    }
  };

  if (req.nextUrl.searchParams.get("wait")) {
    const { results, skipped, prospects, digest } = await work();
    return NextResponse.json({
      ok: true,
      runId,
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

  void work().catch(() => {
    /* Recorded on the run row. */
  });
  return NextResponse.json({ ok: true, started: true, runId, seeded, addedByHand }, { status: 202 });
}
