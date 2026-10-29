import "server-only";
import { hasDb, q } from "@/lib/db";
import { getOrder, logEvent } from "@/lib/works-orders";
import { emailsForMove, outcomeLine } from "@/lib/works-emails";
import { agentFor } from "@/lib/works-agent";
import { runContractorChases, workingHours } from "@/lib/works-chase";

/**
 * The day after a booked visit, the contractor gets "all done?" with the
 * page to mark it done and drop in photos and the invoice. Once per job.
 *
 * And the contractor reminders that have come due (lib/works-chase, Sean
 * McMahon, 26 Oct 2026), on this same hourly tick rather than a cron of their own.
 *
 * Both only in working hours, weekdays 8am to 6pm in London (James, 29 Oct
 * 2026): #1019's "All done?" reached the contractor at 7:06am.
 */
export async function worksSweep(): Promise<{ doneRequests: number; chases?: Awaited<ReturnType<typeof runContractorChases>> | { error: string } }> {
  if (!hasDb()) return { doneRequests: 0 };
  /* Out of hours the job waits for the next working-hours tick; the chases
     keep their own hours. */
  const rows = !workingHours() ? [] : await q<{ id: string }>(
    `SELECT id FROM os_works_orders
      WHERE NOT rehearsal AND status = 'scheduled' AND completed_at IS NULL AND done_request_at IS NULL
        AND contractor_id IS NOT NULL AND scheduled_at < NOW() - interval '18 hours'
      LIMIT 50`
  );
  let sent = 0;
  for (const r of rows) {
    const found = await getOrder(r.id);
    if (!found) continue;
    const me = await agentFor(found.order);
    if (!me) {
      /* Nobody on our side to send it as: said once on the job, not tried every hour. */
      await logEvent(r.id, "TLE OS", "email", "The contractor was not emailed \"All done?\": nobody on the job to send it from. Ask them yourself.");
      await q(`UPDATE os_works_orders SET done_request_at = NOW() WHERE id = $1`, [r.id]);
      continue;
    }
    const outcomes = await emailsForMove(found.order, "done_request", me).catch(() => []);
    for (const e of outcomes) await logEvent(r.id, "TLE OS", "email", outcomeLine(e));
    await q(`UPDATE os_works_orders SET done_request_at = NOW() WHERE id = $1`, [r.id]);
    if (outcomes.some((e) => e.sent)) sent += 1;
  }
  const chases = await runContractorChases().catch((e) => ({ error: e instanceof Error ? e.message : "failed" }));
  return { doneRequests: sent, chases };
}
