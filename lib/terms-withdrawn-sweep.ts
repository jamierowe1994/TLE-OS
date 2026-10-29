import "server-only";
import { hasDb, q } from "@/lib/db";
import { retiredFor } from "@/lib/listings-cache";
import { outstandingTerms } from "@/lib/rex-esign";
import { cancelledTermIds, cancelTermsHere } from "@/lib/terms-cancelled";

/**
 * Terms out on a home the listings system has since withdrawn stop counting
 * by themselves (James, 29 Oct 2026: "when something happens on another
 * platform, we do try and read that and then adjust"). On 29 Oct there were
 * eight, 15 Egton Street among them, still on Terms to sign months after the
 * landlord went.
 *
 * Only terms sent BEFORE the listing was withdrawn: a set sent after it is
 * for the home coming back, and is left alone. Cancelled the same way as the
 * Cancel terms button (lib/terms-cancelled) - nothing in the listings system
 * is voided and nobody is emailed. Once an hour, from the deal watcher.
 */

const KEY = "sweep:terms-withdrawn";
const EVERY_MS = 60 * 60_000;

export async function cancelTermsOnWithdrawnHomes(): Promise<{ ran: boolean; cancelled: string[] }> {
  if (!hasDb()) return { ran: false, cancelled: [] };
  const last = await q<{ computed_at: Date }>(`SELECT computed_at FROM os_cache WHERE key = $1`, [KEY]).catch(() => []);
  if (last[0] && Date.now() - new Date(last[0].computed_at).getTime() < EVERY_MS) return { ran: false, cancelled: [] };
  await q(
    `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, '{}'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET computed_at = NOW()`,
    [KEY]
  );

  /* Both reads must answer: a failed read cancels nothing. */
  const [withdrawn, terms, already] = await Promise.all([retiredFor(null), outstandingTerms(), cancelledTermIds()]);
  const on = new Map(withdrawn.map((l) => [String(l.id), l.stateDate ?? null]));
  const cancelled: string[] = [];
  for (const t of terms) {
    if (t.listingId == null || !on.has(String(t.listingId))) continue;
    const id = `esign:${t.id}`;
    if (already.has(id)) continue;
    const went = on.get(String(t.listingId));
    if (!went || !t.sentAt || t.sentAt.slice(0, 10) > went) continue;
    await cancelTermsHere(id, `The home was withdrawn on ${went}`, "Automatic");
    cancelled.push(`${t.address || t.listingId}`);
  }
  return { ran: true, cancelled };
}
