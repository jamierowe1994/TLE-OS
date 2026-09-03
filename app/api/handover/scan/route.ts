import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getApplications } from "@/lib/applications";
import { rexConfigured } from "@/lib/rex";
import { ensureHandoverTodos, handedOverIds, runHandover } from "@/lib/handover";

/**
 * Rehearse the handover for every newly accepted application.
 *
 * Run on a cron. It finds applications accepted in the last three weeks
 * that have no shadow run yet and works each one through in shadow mode -
 * live Propoly and REX reads, nothing written - so that by the time anyone
 * asks "would ours have done what Howard's did", the answer is already on
 * the application. It never runs live: that is a button a person presses.
 *
 * Authenticated by CRON_SECRET in x-cron-key, fail-shut when unset in
 * production, the same as every other cron here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOOKBACK_DAYS = 21;
const PER_RUN = 8;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = req.headers.get("x-cron-key") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });

  const todos = await ensureHandoverTodos();

  const since = Date.now() - LOOKBACK_DAYS * 86_400_000;
  const apps = await getApplications(300);
  const done = await handedOverIds("shadow");
  const due = apps
    .filter((a) => a.status === "accepted")
    .filter((a) => a.dateAccepted && new Date(a.dateAccepted).getTime() >= since)
    .filter((a) => !done.has(a.id))
    .slice(0, PER_RUN);

  const runs: { applicationId: string; status: string; steps: number }[] = [];
  for (const a of due) {
    try {
      const run = await runHandover(a.id, { by: "shadow scan", mode: "shadow" });
      runs.push({ applicationId: a.id, status: run.status, steps: run.steps.length });
    } catch (e) {
      runs.push({ applicationId: a.id, status: `error: ${e instanceof Error ? e.message : String(e)}`, steps: 0 });
    }
  }
  return NextResponse.json({ ok: true, todosAdded: todos, considered: due.length, runs });
}
