import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { matchPlanning, planningStatus, readPlanning, syncPlanning } from "@/lib/planning";

/**
 * The councils' planning registers, into Bond. National.
 *
 * GET  → what is held, what is still unread, the last run.
 * POST → read the register (cron key).
 *          (no params)                the weekly run, UK-wide: two passes, the
 *                                     applications MADE in the last 10 days and
 *                                     the ones DECIDED in the last 10 days
 *          ?recent=10 / ?decided=10   one of those passes on its own
 *          ?from=2025-03-01&to=...    a backfill slice, by application date
 *          ?authority=Cornwall        one council, for a targeted re-read
 *          ?read=1                    only run the reader over unread rows
 *          ?match=1                   only re-run the match onto the board
 *
 * The whole United Kingdom is four pages a week once PlanIt's own search has
 * filtered it, so the weekly run is one call and nowhere near the rate limit.
 * The eighteen-month backfill is the heavy part and is sliced a week at a
 * time; see docs/LANDLORD-RADAR.md.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await planningStatus()) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const p = req.nextUrl.searchParams;

  if (p.get("match")) return NextResponse.json({ ok: true, ...(await matchPlanning()) });
  if (p.get("read")) {
    const read = await readPlanning(Number(p.get("limit") ?? 200));
    await matchPlanning();
    return NextResponse.json({ ok: true, ...read, status: await planningStatus() });
  }

  const from = p.get("from");
  const to = p.get("to");
  if (from && !DATE.test(from)) return NextResponse.json({ ok: false, error: "from must be YYYY-MM-DD" }, { status: 400 });
  if (to && !DATE.test(to)) return NextResponse.json({ ok: false, error: "to must be YYYY-MM-DD" }, { status: 400 });

  const common = { authority: p.get("authority") ?? undefined };
  const results = [];

  if (from || p.get("months")) {
    /* A backfill slice: everything in the window, however old the decision. */
    results.push(
      await syncPlanning({ ...common, from: from ?? undefined, to: to ?? undefined, months: p.get("months") ? Number(p.get("months")) : undefined })
    );
  } else if (p.get("recent") || p.get("decided")) {
    if (p.get("recent")) results.push(await syncPlanning({ ...common, recentDays: Number(p.get("recent")) }));
    if (p.get("decided")) results.push(await syncPlanning({ ...common, decidedDays: Number(p.get("decided")) }));
  } else {
    /* The weekly run: what is new, then what has been decided. Two passes
       because they are different questions and each is small on its own. */
    results.push(await syncPlanning({ ...common, recentDays: 10 }));
    results.push(await syncPlanning({ ...common, decidedDays: 10 }));
  }

  /* Reading is the Planning reader's job, not this one: a national backfill
     leaves ninety thousand to read and that must not hold up the fetch. The
     match is cheap and keeps the board honest between reads. */
  await matchPlanning();
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results, status: await planningStatus() }, { status: ok ? 200 : 502 });
}
