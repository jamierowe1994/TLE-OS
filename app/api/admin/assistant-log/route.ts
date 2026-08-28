import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { allLines } from "@/lib/assistant-log";

/**
 * Every conversation, for James.
 *
 * GET /api/admin/assistant-log → { lines }
 *
 * Capability-gated, unlike the agent-facing route which only ever returns the
 * caller's own history. Reading across everybody is a different act from
 * reading your own, and it should need a different permission.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:people"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ lines: await allLines() });
}
