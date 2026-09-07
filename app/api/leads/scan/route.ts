import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { fetchLeadBook } from "@/lib/rex-leads";
import { ledgerStats, recordLeads } from "@/lib/lead-ledger";
import { rexConfigured } from "@/lib/rex";
import { requireCapability } from "@/lib/admin";

/**
 * POST /api/leads/scan   (x-cron-key: CRON_SECRET; or an owner signed in)
 *
 * The five-minute scan. Reads REX's newest leads business-wide, writes every
 * one into the ledger, and refreshes the whole-business board cache so Leads
 * opens fresh whether or not anybody had it open. Before this the board only
 * refreshed when someone looked at it, and nothing was kept.
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
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." });
  const started = Date.now();
  const book = await fetchLeadBook(null);
  const written = await recordLeads(book.leads);
  /* The board cache the page reads (app/api/leads/route.ts, key leads:v2:all):
     refreshed here so the next open is instant and current. */
  if (hasDb()) {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      ["leads:v2:all", JSON.stringify({ book })]
    ).catch(() => null);
  }
  const stats = await ledgerStats();
  return NextResponse.json({ ok: true, scanned: book.scanned, kept: book.leads.length, written, onFile: stats.onFile, since: stats.since, newestAt: book.newestAt, ms: Date.now() - started });
}

export const GET = POST;
