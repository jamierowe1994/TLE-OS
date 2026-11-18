import "server-only";
import { hasDb, q } from "@/lib/db";
import { PRE_KIND } from "@/lib/pre-send";
import type { Notice } from "@/lib/notices";

/**
 * Nudges on the landlord decks, in the agent's own bell (James, 18 Nov 2026:
 * 11 of 18 decks sent in November had not been opened, and nothing told the
 * agent; the appraisal only said "not opened yet" to whoever looked).
 *
 *   Valuation not opened   two days after the valuation went, still unopened:
 *                          ring them. Gone after a fortnight, once opened, or
 *                          once the home is won.
 *   Valuation opened       the landlord has just opened it: a good time to call.
 *                          Three days, then gone.
 *   Pre-appraisal unopened a day after it went, the visit still ahead and the
 *                          landlord has not looked: mention it when confirming.
 *
 * Only the deck's own author hears, and only about the latest deck of each
 * kind for a visit (a resent deck replaces the one before). Lost, cancelled
 * and archived appraisals stay quiet. Nothing here goes to a landlord.
 *
 * Behind the `decknudge` switch (Admin > Switches), read by the caller.
 */

const DAY = 86400000;

type Row = {
  token: string;
  appraisal_id: string;
  address: string;
  recipient: string | null;
  at: Date;
  opens: number;
};

const firstName = (name: string | null) => (name || "").trim().split(/\s+/)[0] || "The landlord";
const street = (address: string) => (address || "").split(",")[0].trim() || address || "the home";
const ago = (at: Date) => {
  const days = Math.floor((Date.now() - at.getTime()) / DAY);
  return days <= 1 ? "a day" : `${days} days`;
};

/* The appraisal is still being worked. */
const LIVE = `a.stage <> 'lost' AND a.cancelled_at IS NULL AND a.archived_at IS NULL`;

type Query = <R extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/** `query` is the OS's own q; a read-only client can stand in to check live. */
export async function deckNudgesFor(me: { id: string }, query: Query = q): Promise<Notice[]> {
  if (!me.id || (query === q && !hasDb())) return [];
  const out: Notice[] = [];

  /* The latest valuation deck per visit, by this agent, sent (terms_sent_at is
     stamped by Prepare and send) two to fourteen days ago and never opened. */
  const unopened = await query<Row>(
    `SELECT * FROM (
       SELECT DISTINCT ON (p.ref) p.token, a.id AS appraisal_id, a.address, p.deck->>'recipientName' AS recipient,
              GREATEST(p.created_at, a.terms_sent_at) AS at, p.opens, p.first_opened_at
         FROM os_presentations p
         JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
        WHERE p.author_id = $1 AND p.kind = 'post-appraisal' AND a.terms_sent_at IS NOT NULL AND ${LIVE}
          /* Won, or terms signed and taking on: the landlord said yes, nothing to chase. */
          AND a.stage NOT IN ('won', 'takeon', 'aml')
        ORDER BY p.ref, p.created_at DESC
     ) d
     WHERE d.first_opened_at IS NULL AND d.at < NOW() - INTERVAL '2 days' AND d.at > NOW() - INTERVAL '14 days'`,
    [me.id]
  ).catch(() => []);
  for (const r of unopened) {
    const due = new Date(new Date(r.at).getTime() + 2 * DAY);
    out.push({
      id: `deck-unopened:${r.token}`,
      kind: "chase",
      at: due.toISOString(),
      title: `${firstName(r.recipient)} hasn't opened your valuation`,
      body: `${street(r.address)} - sent ${ago(new Date(r.at))} ago and not opened yet. Worth a call to walk them through it.`,
      href: `/market-appraisals/${encodeURIComponent(r.appraisal_id)}`,
      tone: "warn",
      cta: "Open",
    });
  }

  /* Just opened: the landlord is looking at it now, or was. */
  const opened = await query<Row & { first_opened_at: Date }>(
    `SELECT p.token, a.id AS appraisal_id, a.address, p.deck->>'recipientName' AS recipient,
            p.first_opened_at AS at, p.opens, p.first_opened_at
       FROM os_presentations p
       JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
      WHERE p.author_id = $1 AND p.kind = 'post-appraisal' AND ${LIVE}
        AND p.first_opened_at > NOW() - INTERVAL '3 days'`,
    [me.id]
  ).catch(() => []);
  for (const r of opened) {
    out.push({
      id: `deck-opened:${r.token}`,
      kind: "chase",
      at: new Date(r.at).toISOString(),
      title: `${firstName(r.recipient)} opened your valuation`,
      body: `${street(r.address)}${Number(r.opens) > 1 ? ` - opened ${r.opens} times` : ""}. A good time to call while it's fresh.`,
      href: `/market-appraisals/${encodeURIComponent(r.appraisal_id)}`,
      tone: "ok",
      cta: "Open",
    });
  }

  /* The pre-appraisal: emailed a day or more ago, the visit still to come,
     and the landlord hasn't looked. */
  const pre = await query<Row>(
    `SELECT * FROM (
       SELECT DISTINCT ON (p.ref) p.token, a.id AS appraisal_id, a.address, p.deck->>'recipientName' AS recipient,
              s.sent_at AS at, p.opens, p.first_opened_at, a.appointment_at
         FROM os_presentations p
         JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
         JOIN LATERAL (
           SELECT max(x.sent_at) AS sent_at FROM os_scheduled_sends x
            WHERE x.kind = $2 AND x.state = 'sent' AND x.ref IN (a.id, a.lead_id, p.ref)
         ) s ON s.sent_at IS NOT NULL
        WHERE p.author_id = $1 AND p.kind = 'pre-appraisal' AND ${LIVE}
        ORDER BY p.ref, p.created_at DESC
     ) d
     WHERE d.first_opened_at IS NULL AND d.at < NOW() - INTERVAL '1 day' AND d.appointment_at > NOW()`,
    [me.id, PRE_KIND]
  ).catch(() => []);
  for (const r of pre) {
    out.push({
      id: `pre-unopened:${r.token}`,
      kind: "chase",
      at: new Date(new Date(r.at).getTime() + DAY).toISOString(),
      title: `${firstName(r.recipient)} hasn't opened the pre-appraisal`,
      body: `${street(r.address)} - mention it when you confirm the visit, so they come to it having seen what we'll cover.`,
      href: `/market-appraisals/${encodeURIComponent(r.appraisal_id)}`,
      tone: "warn",
      cta: "Open",
    });
  }

  return out;
}
