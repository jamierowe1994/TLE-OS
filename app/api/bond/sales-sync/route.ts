import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { salesSyncStatus, syncSales, type SalesFile } from "@/lib/sales";

/**
 * HM Land Registry Price Paid Data, into Bond.
 *
 * GET  → sales held, last run.
 * POST → start a read (cron key). ?file=monthly (default) or ?file=2026 for a
 *        whole year of sales, for the first load. ?local=/path.csv on a laptop.
 *        Returns at once; progress in os_sales_sync.
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
  return NextResponse.json({ ok: true, ...(await salesSyncStatus()) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const raw = p.get("file") ?? "monthly";
  const file: SalesFile = /^\d{4}$/.test(raw) ? (raw as SalesFile) : "monthly";
  const local = process.env.NODE_ENV !== "production" ? p.get("local") ?? undefined : undefined;
  const r = await syncSales(file, { localPath: local });
  return NextResponse.json(r.ok ? { ok: true, started: true, runId: r.runId, file } : { ok: false, error: r.reason }, { status: r.ok ? 202 : 409 });
}
