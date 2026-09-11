import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { snapshotWorks } from "@/lib/works-trend";

/**
 * POST /api/maintenance/snapshot   (x-cron-key: CRON_SECRET, or an owner)
 *
 * Writes today's maintenance figures into os_works_snapshots, once a day, so
 * the board's four tiles can compare themselves with last month. The day is
 * the primary key, so running it twice writes the same row twice and nothing
 * drifts.
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

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "manage:switches"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const out = await snapshotWorks();
  return NextResponse.json(out);
}

export const GET = POST;
