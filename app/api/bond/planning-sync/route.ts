import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { PLANNING_AUTHORITIES, matchPlanning, planningStatus, readPlanning, syncPlanningAuthority } from "@/lib/planning";

/**
 * Planning applications, into Bond.
 *
 * GET  → what is held, what is still unread, the last run.
 * POST → read the register (cron key).
 *          ?authority=Milton%20Keynes   one authority (default: the next one due)
 *          ?months=18                   a first load by application date
 *          ?since=10                    the weekly run: what changed in N days
 *          ?read=1                      only run the reader over unread rows
 *          ?match=1                     only re-run the match onto the board
 *
 * One authority per call on purpose: PlanIt rate limits hard (eight requests
 * in ten seconds earned a 429 asking for 262 seconds back), so the workflow
 * spaces the calls out rather than this route sleeping through them.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
  return NextResponse.json({ ok: true, ...(await planningStatus()) });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const p = req.nextUrl.searchParams;

  if (p.get("match")) return NextResponse.json({ ok: true, ...(await matchPlanning()) });
  if (p.get("read")) {
    const read = await readPlanning(Number(p.get("limit") ?? 200));
    await matchPlanning();
    return NextResponse.json({ ok: true, ...read, status: await planningStatus() });
  }

  const named = p.get("authority");
  if (named && !PLANNING_AUTHORITIES.some((a) => a.name === named)) {
    return NextResponse.json(
      { ok: false, error: `Not an authority Bond reads. Known: ${PLANNING_AUTHORITIES.map((a) => a.name).join(", ")}.` },
      { status: 400 }
    );
  }
  const authorities = named ? [named] : PLANNING_AUTHORITIES.map((a) => a.name);
  const months = p.get("months") ? Number(p.get("months")) : undefined;
  const since = p.get("since") ? Number(p.get("since")) : months ? undefined : 10;

  const results = [];
  for (const a of authorities) results.push(await syncPlanningAuthority(a, { months, sinceDays: since }));
  /* Read what came in, then put it on the board. Both are safe to repeat. */
  const read = await readPlanning();
  await matchPlanning();
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results, read, status: await planningStatus() }, { status: ok ? 200 : 502 });
}
