import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { allLines } from "@/lib/assistant-log";
import { trendsFrom } from "@/lib/assistant-trends";

/**
 * Every conversation, for James.
 *
 * GET /api/admin/assistant-log → { lines, trends }
 *
 * `trends` is what people keep asking (lib/assistant-trends): questions
 * asked more than once, grouped however they were worded, top five.
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
  const lines = await allLines(2000);
  return NextResponse.json({ lines: lines.slice(0, 400), trends: trendsFrom(lines, { top: 5 }) });
}
