import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { assistantConfigured, budget } from "@/lib/assistant-brain";

/**
 * Whether the assistant can currently answer, and what he has spent today.
 *
 * GET /api/admin/assistant-brain → { live, spent, cap }
 *
 * Deliberately reports the two failure modes separately at the console — no
 * key and over-budget look identical to an agent but need completely
 * different responses from James.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:people"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const b = await budget();
  return NextResponse.json({
    live: assistantConfigured() && b.left > 0,
    configured: assistantConfigured(),
    spent: b.spent,
    cap: b.cap,
  });
}
