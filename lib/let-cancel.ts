import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * CANCEL THE DEAL, from the let's own page (James, 12 Oct 2026): "the ability
 * to cancel down the deal ... you have to put in a reason why ... you have to
 * type in Cancel deal to actually cancel it off".
 *
 * Recorded in the OS only. The let closes on Applications (closedReasons
 * reads this) and drops off the agent's board; Kirstie gets a line on her
 * feed to cancel it in Propoly. Nothing is written to REX or Propoly from
 * here - both stay hands-off until James says otherwise.
 */

export { CANCEL_REASONS, CANCEL_WORDS } from "@/lib/let-cancel-words";

export type LetCancellation = {
  ref: string;
  dealId: string | null;
  property: string;
  reason: string;
  note: string;
  by: string;
  at: string;
};

type Row = { ref: string; deal_id: string | null; property: string; reason: string; note: string; by_name: string; cancelled_at: Date };
const shape = (r: Row): LetCancellation => ({
  ref: r.ref,
  dealId: r.deal_id,
  property: r.property,
  reason: r.reason,
  note: r.note,
  by: r.by_name,
  at: new Date(r.cancelled_at).toISOString(),
});

export async function cancellationFor(ref: string): Promise<LetCancellation | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT * FROM os_let_cancellations WHERE ref = $1`, [ref]).catch(() => [] as Row[]);
  return rows[0] ? shape(rows[0]) : null;
}

/** Every cancellation: the board hides these lets, closedReasons closes them. */
export async function allCancellations(): Promise<LetCancellation[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_let_cancellations ORDER BY cancelled_at DESC LIMIT 2000`).catch(() => [] as Row[]);
  return rows.map(shape);
}

export async function cancelLet(c: {
  ref: string;
  dealId: string | null;
  property: string;
  reason: string;
  note: string;
  by: { name: string; email: string | null };
  agent: { name: string | null; email: string | null };
}): Promise<LetCancellation> {
  const rows = await q<Row>(
    `INSERT INTO os_let_cancellations (ref, deal_id, property, reason, note, by_name, by_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (ref) DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note
     RETURNING *`,
    [c.ref, c.dealId, c.property, c.reason, c.note, c.by.name, c.by.email]
  );
  /* Kirstie's feed: cancel it in Propoly. dealId is the Propoly deal when we
     know it, else app-<id> so the row still opens the let. */
  await q(
    `INSERT INTO os_deal_events (deal_id, property, agent_email, agent_name, event, from_status, to_status)
     VALUES ($1,$2,$3,$4,'agent_cancelled',NULL,$5)`,
    [c.dealId ?? `app-${c.ref}`, c.property, c.agent.email, c.agent.name ?? c.by.name, c.reason]
  ).catch(() => null);
  return shape(rows[0]);
}
