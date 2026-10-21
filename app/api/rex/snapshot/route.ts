import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { snapshotProgress, startSnapshotRun, stopSnapshotRun } from "@/lib/rex-snapshot";

/**
 * Take the copy of REX by machine (21 Oct 2026, lib/rex-snapshot).
 *
 * POST ?deadline=<ISO>&hours=36  start a run (x-cron-key), stopping at the deadline
 * POST ?stop=1                   stop the run going
 * GET                            how far the run has got
 *
 * Admin > REX status has the same button for a person.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function keyOk(req: NextRequest): boolean {
  const want = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("x-cron-key") ?? "";
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: NextRequest) {
  if (!keyOk(req)) return new NextResponse(null, { status: 404 });
  return NextResponse.json(snapshotProgress());
}

export async function POST(req: NextRequest) {
  if (!keyOk(req)) return new NextResponse(null, { status: 404 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("stop")) {
    stopSnapshotRun();
    return NextResponse.json({ ok: true, stopping: true });
  }
  const d = sp.get("deadline");
  const deadline = d ? new Date(d) : undefined;
  if (deadline && !Number.isFinite(deadline.getTime())) return NextResponse.json({ ok: false, error: "deadline is not a date" }, { status: 400 });
  const hours = Math.min(96, Math.max(1, Number(sp.get("hours") ?? 36) || 36));
  const started = startSnapshotRun("cron", { origin: req.nextUrl.origin, deadline, hours });
  return NextResponse.json({ ...started, run: snapshotProgress() });
}
