import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { cronAuthorised } from "@/lib/bug-bot";
import { runQuestionsChase } from "@/lib/property-answers-chase";

/**
 * POST → chase every signed landlord whose property questions are unfinished
 * (lib/property-answers-chase). Daily from os-cron-daily; an owner can run it
 * by hand. Answers with one line per signed appraisal and what happened.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "manage:switches"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
  const results = await runQuestionsChase(origin);
  return NextResponse.json({ ok: true, sent: results.filter((r) => r.result === "sent").length, results });
}
