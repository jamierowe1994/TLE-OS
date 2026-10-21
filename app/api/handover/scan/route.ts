import { NextRequest, NextResponse } from "next/server";
import { heldForRex } from "@/lib/rex-jobs";
import { introOnlyIds } from "@/lib/intro-only";
import { publicError } from "@/lib/public-error";
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
  /* REX down (lib/rex-jobs): step aside; the next turn picks it up. */
  const held = await heldForRex(req, { rerunWhenBack: false });
  if (held) return held;

  const todos = await ensureHandoverTodos();

  const since = Date.now() - LOOKBACK_DAYS * 86_400_000;
  const apps = await getApplications(300);
  /* A let already pushed for real is not rehearsed afterwards (16 Oct 2026):
     44 South Bridge's swap went to Propoly at 18:10 on 12 Oct and this scan
     rehearsed it at 06:04 the next morning, so its newest run read "not in
     Propoly yet" whenever Propoly's deals weren't to hand. */
  const [shadowDone, liveDone] = await Promise.all([handedOverIds("shadow"), handedOverIds("live")]);
  const done = new Set([...shadowDone, ...liveDone]);
  /* Intro only never hands over (lib/intro-only). */
  const intro = await introOnlyIds().catch(() => new Set<string>());
  const due = apps
    .filter((a) => a.status === "accepted")
    .filter((a) => a.listingId == null || !intro.has(String(a.listingId)))
    .filter((a) => a.dateAccepted && new Date(a.dateAccepted).getTime() >= since)
    .filter((a) => !done.has(a.id))
    .slice(0, PER_RUN);

  const runs: { applicationId: string; status: string; steps: number }[] = [];
  for (const a of due) {
    try {
      const run = await runHandover(a.id, { by: "shadow scan", mode: "shadow" });
      runs.push({ applicationId: a.id, status: run.status, steps: run.steps.length });
    } catch (e) {
      runs.push({ applicationId: a.id, status: `error: ${publicError(e)}`, steps: 0 });
    }
  }
  return NextResponse.json({ ok: true, todosAdded: todos, considered: due.length, runs });
}
