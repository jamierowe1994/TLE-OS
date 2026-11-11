import { NextResponse, type NextRequest } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability } from "@/lib/admin";
import { buildQueue } from "@/lib/compliance-tracker";
import { chaseBriefs, chaseSettings, currentTracker } from "@/lib/cert-chase";

/**
 * GET /api/compliance/tracker → what is outstanding, what is coming, who to chase.
 *
 * Shares the compliance cache with /api/compliance, so opening Michael's
 * tracker after the compliance page costs nothing.
 *
 * Read-only and unable to send by construction — see lib/compliance-tracker.
 * The queue is a list, not an outbox. Chase the Agent is its own route
 * (/api/compliance/chase).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Every chase on each certificate, by hand and automatic (lib/cert-chase,
 * ticket 11c8acc9, 11 Nov 2026), keyed propertyId:cert. It replaces the old
 * send log the Agent emailed column read, which only ever knew the automatic
 * run. Null, not an empty map, when it cannot be read - "nobody has been
 * chased" and "we could not look" are different answers and he would act on
 * the first.
 */
async function chaseLog() {
  try {
    return await chaseBriefs();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  /* Michael's back-office tracker across the whole book, and the chase log of
     who was emailed when (Rig run 2, P-008). The office and owners; an agent's
     own homes are on /compliance. It answered anybody signed in. */
  if (!(await requireCapability(req, "see:agent-compliance"))) {
    return NextResponse.json({ ok: false, error: "The tracker is the compliance desk's. Your homes are on Compliance." }, { status: 403 });
  }
  try {
    /* Live: never a stand-in (Rig run 2, P-018). currentTracker refuses on
       the real site without REX; on a laptop it says it is not live. */
    const [t, chases, settings] = await Promise.all([currentTracker(), chaseLog(), chaseSettings().catch(() => null)]);
    return NextResponse.json({
      ok: true,
      live: t.live,
      ...(t.reason ? { reason: t.reason } : {}),
      ...(t.ageMs != null ? { ageMs: t.ageMs } : {}),
      ...(t.stale ? { stale: true } : {}),
      ...t.tracker,
      queue: buildQueue(t.tracker, settings ?? undefined),
      chases,
    });
  } catch (e) {
    const offline = e instanceof Error && /REX isn't connected/.test(e.message);
    return NextResponse.json(
      { ok: false, live: false, error: offline ? e.message : publicError(e, "Couldn't reach REX.") },
      { status: offline ? 503 : 502 }
    );
  }
}
