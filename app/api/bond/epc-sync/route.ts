import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { EPC_COUNCILS, epcSyncStatus, matchEpc, syncEpc } from "@/lib/epc";

/**
 * The EPC register, into Bond.
 *
 * GET  → connected or what is missing, certificates held, last run.
 * POST → start a read for one council (cron key): ?council=West%20Northamptonshire.
 *        Default is the first council not read this month. ?match=1 re-runs the match.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  return NextResponse.json({ ok: true, ...(await epcSyncStatus()) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  if (p.get("match")) return NextResponse.json({ ok: true, ...(await matchEpc()) });
  const council = p.get("council") ?? EPC_COUNCILS[0];
  if (!EPC_COUNCILS.includes(council)) {
    return NextResponse.json({ ok: false, error: `Unknown council. One of: ${EPC_COUNCILS.join(", ")}.` }, { status: 400 });
  }
  const r = await syncEpc(council);
  return NextResponse.json(r.ok ? { ok: true, started: true, runId: r.runId, council } : { ok: false, error: r.reason }, { status: r.ok ? 202 : 409 });
}
