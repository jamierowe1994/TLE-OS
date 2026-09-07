import "server-only";
import { logEvent, markComplianceTold, type Move, type WorksOrder } from "@/lib/works-orders";
import { complianceTrigger, outcomeLine, tellCompliance } from "@/lib/works-emails";
import { invoiceSettings } from "@/lib/invoices";

/**
 * Michael's ping, in one place.
 *
 * A job can be finished, and a file can land on it, from three different
 * doors: the agent's job sheet, the contractor's own page, and the
 * walkthrough. Each of them calls this with the move it just made, so the
 * rule about when compliance hears cannot drift apart between them.
 *
 * The rule itself lives in complianceTrigger (lib/works-emails): nothing
 * while the job is open, one email when it finishes listing its documents,
 * and a ping for each document that arrives after that.
 */
export async function pingCompliance(order: WorksOrder, action: Move["action"] | "raised" | "done_request"): Promise<void> {
  const trigger = complianceTrigger(order, action);
  if (!trigger) return;
  const newest = order.files.length ? order.files[order.files.length - 1] : undefined;
  const settings = await invoiceSettings().catch(() => null);
  const told = await tellCompliance(order, trigger, settings?.complianceEmail ?? "", newest).catch(() => null);
  if (!told) return;
  if (told.sent && trigger === "done") await markComplianceTold(order.id);
  await logEvent(order.id, "TLE OS", "email", outcomeLine(told));
}
