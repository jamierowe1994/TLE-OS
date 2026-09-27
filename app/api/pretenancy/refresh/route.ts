import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { propolyDealsSavedAt, refreshPropolyDealsNow } from "@/lib/business/propoly-deals";

/**
 * "Refresh now" on the pre-tenancy board (27 Sep 2026).
 *
 * The board reads the saved copy of Propoly's deals that the watcher cron
 * re-reads every five minutes in office hours. When Kirstie has just moved a
 * deal in Propoly and wants to see it now, this reads Propoly out of turn -
 * at most once a minute, whoever asks, so a busy button cannot run the key dry.
 *
 * GET  → when the deals on screen were read from Propoly.
 * POST → read them again now (or say it was done under a minute ago).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:pretenancy"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const at = await propolyDealsSavedAt();
  return NextResponse.json({ ok: true, savedAt: at ? new Date(at).toISOString() : null });
}

export async function POST(req: NextRequest) {
  if (!(await requireCapability(req, "see:pretenancy"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { savedAt, walked } = await refreshPropolyDealsNow();
  return NextResponse.json({ ok: true, walked, savedAt: savedAt ? new Date(savedAt).toISOString() : null });
}
