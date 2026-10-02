import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { changeJob, jobsFor, runsFor, scheduleWords } from "@/lib/steve-jobs";

/**
 * Steve's standing jobs, for his Tasks tab (lib/steve-jobs, 2 Oct 2026).
 *
 * GET   → { jobs, runs } - the caller's own
 * PATCH → { id, change: pause | resume | delete } - the caller's own only
 *
 * Setting one up is not here: that is Steve's card, through /api/assistant/act.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const [jobs, runs] = await Promise.all([jobsFor(userId).catch(() => []), runsFor(userId, 7).catch(() => [])]);
  return NextResponse.json({ jobs: jobs.map((j) => ({ ...j, when: scheduleWords(j) })), runs });
}

export async function PATCH(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; change?: string };
  const change = b.change === "pause" || b.change === "resume" || b.change === "delete" ? b.change : null;
  if (!b.id || !change) return NextResponse.json({ error: "Say which job and what to do." }, { status: 400 });
  const ok = await changeJob(userId, b.id, change);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No such job." }, { status: 404 });
}
