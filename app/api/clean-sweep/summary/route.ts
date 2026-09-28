import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { sweepSummary } from "@/lib/clean-sweep";

/**
 * The clean sweep's running count: how much is still missing, overall and per
 * section (lib/clean-sweep sweepSummary). Counts only.
 *
 * Read by the checker's Refresh button (a session with see:clean-sweep) and by
 * the two-hourly count that keeps James's clean-sweep page current (the cron
 * key in x-cron-key). Fails shut when CRON_SECRET is unset, so it is safe on
 * the middleware's machine-route list.
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

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) {
    const { actor } = await whoIs(req);
    if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (!can(actor.role, "see:clean-sweep")) return NextResponse.json({ ok: false, error: "The clean sweep is for the office." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await sweepSummary()) }, { headers: { "cache-control": "no-store" } });
}
