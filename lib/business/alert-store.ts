import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * What has already been said, so it is not said again tomorrow.
 *
 * The digest is only useful if it is a list of NEW things. A run that reports
 * every disagreement on the board every morning is a subscription to the same
 * twelve problems, and the third morning is the one where it stops being read.
 *
 * ── Fail SHUT, unlike most stores in this codebase ────────────────────────
 *
 * Everywhere else here, a database wobble costs a badge and the screen carries
 * on. This one is the opposite: if the sent-log cannot be read, we do not know
 * what has already gone out, and the safe assumption is "everything" rather
 * than "nothing". Guessing nothing means re-sending the lot.
 *
 * So `alreadySent` throws rather than returning an empty set, and the caller
 * holds the digest. A missed morning is recoverable; a mailbox full of repeats
 * is how the whole feature gets muted.
 */

/** Keys already notified and not since cleared. Throws if it cannot tell. */
export async function alreadySent(): Promise<Set<string>> {
  if (!hasDb()) {
    throw new Error("No database — cannot tell what has already been sent.");
  }
  const rows = await q<{ alert_key: string }>(
    `SELECT alert_key FROM os_deal_alerts_sent WHERE cleared_at IS NULL`
  );
  return new Set(rows.map((r) => r.alert_key));
}

/** Record a batch as sent. Upsert, so re-running a day cannot double-count. */
export async function markSent(
  alerts: Array<{ key: string; dealId: string; stageKey: string; tone: string }>
): Promise<void> {
  if (!hasDb() || alerts.length === 0) return;
  for (const a of alerts) {
    await q(
      `INSERT INTO os_deal_alerts_sent (alert_key, deal_id, stage_key, tone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (alert_key) DO UPDATE
         SET sent_at = NOW(), cleared_at = NULL`,
      [a.key, a.dealId, a.stageKey, a.tone]
    );
  }
}

/**
 * Close off anything that is no longer true.
 *
 * A deposit that gets registered should stop being an open alert, so that if it
 * ever goes missing again that is news rather than a duplicate suppressed by a
 * row from three months ago. Called with the keys still live on this run;
 * everything else is cleared.
 */
export async function clearResolved(liveKeys: Set<string>): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ alert_key: string }>(
    `SELECT alert_key FROM os_deal_alerts_sent WHERE cleared_at IS NULL`
  );
  const gone = rows.map((r) => r.alert_key).filter((k) => !liveKeys.has(k));
  for (const k of gone) {
    await q(`UPDATE os_deal_alerts_sent SET cleared_at = NOW() WHERE alert_key = $1`, [k]);
  }
  return gone.length;
}
