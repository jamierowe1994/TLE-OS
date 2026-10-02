import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { scanAndPush } from "@/lib/push";
import { requireCapability } from "@/lib/admin";

/**
 * POST /api/push/scan   (x-cron-key: CRON_SECRET; or an owner signed in)
 *
 * Every five minutes: what has landed in each phone owner's bell since the
 * last scan goes to their phone (lib/push). Does nothing while the
 * "phone_alerts" switch is off, and says so.
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

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "manage:switches"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." });
  return NextResponse.json(await scanAndPush());
}
