import { NextRequest, NextResponse } from "next/server";
import { requireCapability, whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { watchStatus } from "@/lib/business/deal-watch";
import { reviewQueue } from "@/lib/plc-store";

/**
 * GET /api/pretenancy/dashboard → what Kirstie's first screen shows.
 *
 * The board is where she works a deal; the dashboard is where she sees what
 * needs working. Three questions, answered from what the OS already holds:
 * how many deals sit at each stage (the watcher's last look), which packs
 * are with compliance and how long they have waited, and who is moving in
 * over the next fortnight. The feed itself is read by the DealFeed
 * component, not here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:pretenancy");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  /* The gate is the ACTOR's - the owner is the one browsing - but the name on
     the screen is the SUBJECT's. Viewing as Kirstie, this screen said "Good
     evening, James" while every other screen in the OS said Kirstie (14 Sep
     2026), which makes the one check James does before the pilot - look at
     her screen - quietly lie about whose screen it is. */
  const { subject } = await whoIs(req);
  const who = subject ?? me;
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, byStatus: {}, deals: 0, lastSeenAt: null, queue: [], moveIns: [] });

  const [status, queue, moveIns] = await Promise.all([
    watchStatus(),
    reviewQueue().catch(() => []),
    q<{ deal_id: string; property: string; agent_name: string | null; move_in: Date | string; status_key: string }>(
      `SELECT deal_id, property, agent_name, move_in, status_key
         FROM os_deal_states
        WHERE move_in IS NOT NULL
          AND move_in >= CURRENT_DATE
          AND move_in < CURRENT_DATE + INTERVAL '14 days'
          AND status_key NOT IN ('cancelled')
        ORDER BY move_in, property`
    ).catch(() => []),
  ]);

  return NextResponse.json({
    ok: true,
    stored: true,
    firstName: (who.name || who.email).split(" ")[0],
    byStatus: status.byStatus,
    deals: status.deals,
    lastSeenAt: status.lastSeenAt,
    queue: queue.map((c) => ({
      id: c.id,
      address: c.address,
      agentName: c.agentName,
      submittedAt: c.submittedAt,
      state: c.state,
      moveInDate: c.moveInDate ?? null,
    })),
    moveIns: moveIns.map((m) => ({
      dealId: m.deal_id,
      property: m.property,
      agentName: m.agent_name,
      moveIn: typeof m.move_in === "string" ? m.move_in.slice(0, 10) : new Date(m.move_in).toISOString().slice(0, 10),
      status: m.status_key,
    })),
  });
}
