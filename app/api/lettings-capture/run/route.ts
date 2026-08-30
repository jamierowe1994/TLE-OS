import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { hsLetRows } from "@/lib/ma-research";
import {
  addSectors,
  repairFabricatedLetDates,
  seedSectorsFromAppraisals,
  seedSectorsFromBook,
  sweepSector,
  watchedSectors,
  type SweepResult,
} from "@/lib/listing-capture";

/**
 * The daily market sweep.
 *
 * GET  → DRY RUN. Reports which sectors are watched and when each last ran.
 *        Writes nothing.
 * POST → the real sweep. Cron key only.
 *
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/lettings-capture/run
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" ".../run?seed=1"        # seed from our REX book
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" ".../run?add=NN5%204"   # name a sector by hand
 *
 * WHY THIS EXISTS: Homesearch has no completed-let source and no let date —
 * see the note at the top of lib/ma-research. Looking every day is the only
 * way to learn when something let. See lib/listing-capture.
 *
 * ── Two failure modes it is built around ──────────────────────────────────
 *
 * 1. A FAILED FETCH MUST NOT ERASE A BOOK. A sector that returns zero rows is
 *    skipped entirely rather than marking its whole book as vanished. The
 *    result says how many were skipped, because a run that quietly did nothing
 *    and a run that quietly did the wrong thing look identical in a log.
 *
 * 2. A SCHEDULER READS 200 AS SUCCESS. This path is in MACHINE_ROUTES in
 *    middleware.ts, because without it the middleware answers a cron POST with
 *    307 → /sign-in, the scheduler follows the redirect, gets an HTML login
 *    page, sees 200 and reports success. That has already happened once on
 *    this project. The route authenticates itself and fails shut on a missing
 *    secret, which is what makes the exemption safe.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  /* Fail shut on a missing secret: unset must never mean "let everybody in". */
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  }
  const sectors = await watchedSectors();
  return NextResponse.json({
    ok: true,
    dryRun: true,
    watching: sectors.length,
    sectors,
    note:
      sectors.length === 0
        ? "Nothing is being watched yet. POST with ?seed=1 to seed from our REX book, or ?add=NN5 4 to name one by hand."
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

  /* ?seed=1  — our own REX book AND any appraisal postcodes.
     ?add=NN5 4,NN5 5 — by hand, for a patch we have no stock in yet.

     Both are additive and both REPORT what they added. The first version only
     asked os_market_appraisals, which is empty because the appraisals on screen
     are sample records in code — it returned [] and read as a successful run
     that had simply found nothing to do. */
  const seeded = req.nextUrl.searchParams.get("seed")
    ? [
        ...(await seedSectorsFromBook("cron")),
        ...(await seedSectorsFromAppraisals("cron")),
      ]
    : [];
  const addParam = req.nextUrl.searchParams.get("add");
  const addedByHand = addParam ? await addSectors(addParam, "cron") : [];

  /* ?repair=1 — one-off, for the 1,985 let dates the first sweep invented by
     stamping NOW() on properties that were already let agreed when we met them.
     Idempotent, and worth leaving in place: the same mistake in a future change
     would be repairable the same way. */
  const repaired = req.nextUrl.searchParams.get("repair")
    ? await repairFabricatedLetDates()
    : null;

  const sectors = await watchedSectors();
  if (sectors.length === 0) {
    return NextResponse.json({
      ok: true,
      swept: 0,
      seeded,
      addedByHand,
      ...(repaired != null ? { repairedLetDates: repaired } : {}),
      note:
        "Nothing to watch. ?seed=1 found no sectors — check REX is configured and has current rentals — or pass ?add=NN5 4 to name one by hand.",
    });
  }

  /* One sector at a time, deliberately. Homesearch rate limits are real —
     F&C's own client retries 429 and 503 with backoff — and a daily job has
     all the time in the world. Sequential also means a mid-run failure leaves
     the sectors already done correctly written rather than half-applied. */
  const results: SweepResult[] = [];
  for (const sector of sectors) {
    try {
      results.push(await sweepSector(sector, hsLetRows));
    } catch (e) {
      results.push({
        sector,
        seen: 0,
        newRows: 0,
        newlyLetAgreed: 0,
        goneNow: 0,
        skipped: (e as Error).message,
      });
    }
  }

  const skipped = results.filter((r) => r.skipped);
  return NextResponse.json({
    ok: true,
    seeded,
    addedByHand,
    ...(repaired != null ? { repairedLetDates: repaired } : {}),
    swept: results.length - skipped.length,
    /* Said out loud. A sector that was skipped contributed nothing, and a
       summary that only counts successes reads as full coverage. */
    skipped: skipped.length,
    skippedDetail: skipped,
    truncated: results.filter((r) => r.truncated).map((r) => r.sector),
    seen: results.reduce((n, r) => n + r.seen, 0),
    newRows: results.reduce((n, r) => n + r.newRows, 0),
    newlyLetAgreed: results.reduce((n, r) => n + r.newlyLetAgreed, 0),
    goneNow: results.reduce((n, r) => n + r.goneNow, 0),
    results,
  });
}
