import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";
import { sweepDiary } from "@/lib/rex-viewings";

/**
 * POST /api/viewings/sweep?days=730   (x-cron-key: CRON_SECRET; or an owner)
 *
 * The nightly sweep of REX's diary into the viewings ledger, whole book at
 * once, so a property's history is there before anyone opens it. Safe to run
 * as often as you like: rows are keyed on REX's event id and updated in
 * place, never added twice.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." });
  const days = Math.min(3650, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 730) || 730));
  const started = Date.now();
  const pages = Math.min(80, Math.max(1, Number(req.nextUrl.searchParams.get("pages") ?? 50) || 50));
  const out = await sweepDiary(days, pages);
  return NextResponse.json({ ok: true, days, ...out, ms: Date.now() - started });
}

export const GET = POST;
