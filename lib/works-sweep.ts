import "server-only";
import { hasDb, q } from "@/lib/db";
import { getOrder, logEvent } from "@/lib/works-orders";
import { emailsForMove, outcomeLine } from "@/lib/works-emails";
import { agentFor } from "@/lib/works-agent";

/**
 * The day after a booked visit, the contractor gets "all done?" with the
 * page to mark it done and drop in photos and the invoice. Once per job.
 */
export async function worksSweep(): Promise<{ doneRequests: number }> {
  if (!hasDb()) return { doneRequests: 0 };
  const rows = await q<{ id: string }>(
    `SELECT id FROM os_works_orders
      WHERE status = 'scheduled' AND completed_at IS NULL AND done_request_at IS NULL
        AND contractor_id IS NOT NULL AND scheduled_at < NOW() - interval '18 hours'
      LIMIT 50`
  );
  let sent = 0;
  for (const r of rows) {
    const found = await getOrder(r.id);
    if (!found) continue;
    const me = await agentFor(found.order);
    if (!me) continue;
    const outcomes = await emailsForMove(found.order, "done_request", me).catch(() => []);
    for (const e of outcomes) await logEvent(r.id, "TLE OS", "email", outcomeLine(e));
    await q(`UPDATE os_works_orders SET done_request_at = NOW() WHERE id = $1`, [r.id]);
    if (outcomes.some((e) => e.sent)) sent += 1;
  }
  return { doneRequests: sent };
}
