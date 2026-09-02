import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { HMO_REGISTERS, hmoSyncStatus, matchHmoLicences, syncHmoRegister } from "@/lib/hmo";

/**
 * The councils' HMO registers, into Bond.
 *
 * GET  → councils known, licences held, expiring soon, last run.
 * POST → read one council's register now (cron key). ?council=West%20Northamptonshire
 *        (default: every council known). ?local=/path.pdf on a laptop.
 *        ?match=1 only re-runs the match.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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
  return NextResponse.json({ ok: true, ...(await hmoSyncStatus()) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  if (p.get("match")) return NextResponse.json({ ok: true, ...(await matchHmoLicences()) });
  const local = process.env.NODE_ENV !== "production" ? p.get("local") ?? undefined : undefined;
  const councils = p.get("council") ? [p.get("council")!] : HMO_REGISTERS.map((r) => r.council);
  const results = [];
  for (const c of councils) results.push({ council: c, ...(await syncHmoRegister(c, { localPdf: local })) });
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results, status: await hmoSyncStatus() }, { status: ok ? 200 : 502 });
}
