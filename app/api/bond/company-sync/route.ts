import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { companySyncStatus, matchCompanyOwners, syncCompanyTitles } from "@/lib/company-owners";

/**
 * The Land Registry company files, into Bond.
 *
 * GET  → status: connected or what is missing, titles held, last run.
 * POST → start a sync (cron key). Returns at once; the run reports into
 *        os_company_sync. ?dataset=ocod for the overseas file (default ccod).
 *        ?match=1 only re-runs the match against the flagged list.
 *        ?local=/path/to.zip reads a file on disk instead - laptops only.
 *
 * In MACHINE_ROUTES, authenticates itself, fails shut without a secret.
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
  return NextResponse.json({ ok: true, ...(await companySyncStatus()) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  if (p.get("match")) {
    return NextResponse.json({ ok: true, ...(await matchCompanyOwners()), status: await companySyncStatus() });
  }
  const dataset = p.get("dataset") === "ocod" ? "ocod" : "ccod";
  const local = process.env.NODE_ENV !== "production" ? p.get("local") ?? undefined : undefined;
  const r = await syncCompanyTitles(dataset, { localZip: local });
  return NextResponse.json(r.ok ? { ok: true, started: true, runId: r.runId, dataset } : { ok: false, error: r.reason }, {
    status: r.ok ? 202 : 409,
  });
}
