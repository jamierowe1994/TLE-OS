import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Which certificate chases have already gone out.
 *
 * The tracker chases by BAND — 30, 14, 7 days — rather than on an exact day,
 * so that a run missed for a week does not mean a certificate silently never
 * gets chased. This is the other half of that design: without a record of what
 * has been sent, the same band would go out every single morning until the
 * certificate crossed into the next one, which is three weeks of identical
 * emails to a landlord and the fastest way to make a chase unreadable.
 *
 * ── Fails SHUT, like the pre-tenancy log ──────────────────────────────────
 *
 * If we cannot read what has been sent, the safe assumption is "everything".
 * Guessing "nothing" re-sends the lot. A missed morning is recoverable; a
 * landlord receiving the same reminder five days running is not, because the
 * next real one goes in the bin with the rest.
 */

/** Keys already chased. Throws rather than guessing. */
export async function chasesSent(): Promise<Set<string>> {
  if (!hasDb()) {
    throw new Error("No database — cannot tell which chases have already gone.");
  }
  const rows = await q<{ chase_key: string }>(
    `SELECT chase_key FROM os_compliance_chases_sent`
  );
  return new Set(rows.map((r) => r.chase_key));
}

/**
 * Record a batch as chased.
 *
 * `sentTo` is stored because a chase is a claim about a legal obligation, and
 * "we told somebody on this date" is the part worth being able to prove. It is
 * the address, not the message: the wording lives in the catalogue and can
 * change, but who was told and when cannot be reconstructed later.
 */
export async function markChased(
  rows: Array<{ key: string; propertyId: string; cert: string; band: number; to: string }>
): Promise<void> {
  if (!hasDb() || rows.length === 0) return;
  for (const r of rows) {
    await q(
      `INSERT INTO os_compliance_chases_sent (chase_key, property_id, cert, band, sent_to)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (chase_key) DO NOTHING`,
      [r.key, r.propertyId, r.cert, r.band, r.to]
    );
  }
}
