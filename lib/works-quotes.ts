import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * A quote asked of one contractor, on one job.
 *
 * Sean McMahon, 21 Oct 2026: he asked Forth Property Management for a quote,
 * they said it was too far, he put All Trade on the job instead - and there
 * was no way to send All Trade the request. A job had one contractor and one
 * link, so asking a second firm meant overwriting the first.
 *
 * Now every contractor asked is a row of their own, with their own link:
 *
 *   asked      the request went (sends counts every resend)
 *   quoted     their price is in, from their link or keyed in off their reply
 *   declined   they can't do it, and why
 *   accepted   theirs was taken: they go on the job and its quote is theirs
 *   closed     another was taken; they were told, politely
 *
 * Their link opens a price-only page (no tenants, no way in) and nothing on
 * the job itself, so a firm that was turned down cannot act on the job.
 */

export type QuoteAskState = "asked" | "quoted" | "declined" | "accepted" | "closed";

export interface QuoteAsk {
  id: string;
  orderId: string;
  contractorId: string;
  contractorName: string;
  token: string;
  askedAt: string;
  askedBy: string;
  /** How many times the request has gone: 1, then one more per resend. */
  sends: number;
  lastSentAt: string;
  quotePence: number | null;
  quoteNote: string;
  quotedAt: string | null;
  quotedBy: string;
  declinedAt: string | null;
  declineNote: string;
  outcome: "accepted" | "closed" | null;
  outcomeAt: string | null;
  state: QuoteAskState;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function toAsk(r: Row): QuoteAsk {
  const outcome = r.outcome === "accepted" || r.outcome === "closed" ? r.outcome : null;
  const quotePence = r.quote_pence == null ? null : Number(r.quote_pence);
  const declinedAt = iso(r.declined_at);
  return {
    id: s(r.id), orderId: s(r.order_id), contractorId: s(r.contractor_id), contractorName: s(r.contractor_name), token: s(r.token),
    askedAt: iso(r.asked_at)!, askedBy: s(r.asked_by), sends: Number(r.sends ?? 1), lastSentAt: iso(r.last_sent_at)!,
    quotePence, quoteNote: s(r.quote_note), quotedAt: iso(r.quoted_at), quotedBy: s(r.quoted_by),
    declinedAt, declineNote: s(r.decline_note), outcome, outcomeAt: iso(r.outcome_at),
    state: outcome ?? (declinedAt ? "declined" : quotePence != null ? "quoted" : "asked"),
  };
}

/** Still in the running: asked or quoted, not declined, nothing decided. */
export const isLive = (a: QuoteAsk) => a.state === "asked" || a.state === "quoted";

export async function asksFor(orderId: string): Promise<QuoteAsk[]> {
  if (!hasDb()) return [];
  return (await q<Row>(`SELECT * FROM os_works_quote_asks WHERE order_id = $1 ORDER BY asked_at, contractor_name`, [orderId]).catch(() => [])).map(toAsk);
}

export async function askById(id: string): Promise<QuoteAsk | null> {
  if (!hasDb()) return null;
  const [r] = await q<Row>(`SELECT * FROM os_works_quote_asks WHERE id = $1`, [id]);
  return r ? toAsk(r) : null;
}

/** The contractor's own link. Same guard as the job's links (Rig run 4, P-048). */
export async function askByToken(token: string): Promise<QuoteAsk | null> {
  if (!hasDb() || !token || token.length > 200 || /[\u0000-\u001f]/.test(token)) return null;
  const [r] = await q<Row>(`SELECT * FROM os_works_quote_asks WHERE token = $1`, [token]);
  return r ? toAsk(r) : null;
}

/**
 * Ask these contractors. One already asked is asked again (a resend), and one
 * who said no is back in the running - asking them is the agent's say-so.
 * Returns every row touched, in the order given.
 */
export async function upsertAsks(orderId: string, contractors: { id: string; name: string }[], by: string): Promise<QuoteAsk[]> {
  const out: QuoteAsk[] = [];
  for (const c of contractors) {
    const [r] = await q<Row>(
      `INSERT INTO os_works_quote_asks (id, order_id, contractor_id, contractor_name, token, asked_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (order_id, contractor_id) DO UPDATE SET
         sends = os_works_quote_asks.sends + 1, last_sent_at = NOW(), contractor_name = EXCLUDED.contractor_name,
         declined_at = NULL, decline_note = '',
         outcome = CASE WHEN os_works_quote_asks.outcome = 'closed' THEN NULL ELSE os_works_quote_asks.outcome END,
         outcome_at = CASE WHEN os_works_quote_asks.outcome = 'closed' THEN NULL ELSE os_works_quote_asks.outcome_at END
       RETURNING *`,
      [uid(), orderId, c.id, c.name, randomBytes(16).toString("base64url"), by]
    );
    out.push(toAsk(r));
  }
  return out;
}

export async function resendAsk(id: string): Promise<QuoteAsk> {
  const [r] = await q<Row>(`UPDATE os_works_quote_asks SET sends = sends + 1, last_sent_at = NOW() WHERE id = $1 RETURNING *`, [id]);
  if (!r) throw new Error("No such quote request.");
  return toAsk(r);
}

export async function recordAskQuote(id: string, pence: number, note: string, by: string): Promise<QuoteAsk> {
  const [r] = await q<Row>(
    `UPDATE os_works_quote_asks SET quote_pence = $2, quote_note = $3, quoted_at = NOW(), quoted_by = $4, declined_at = NULL, decline_note = '' WHERE id = $1 RETURNING *`,
    [id, Math.round(pence), note.trim().slice(0, 2000), by]
  );
  if (!r) throw new Error("No such quote request.");
  return toAsk(r);
}

export async function declineAsk(id: string, note: string): Promise<QuoteAsk> {
  const [r] = await q<Row>(`UPDATE os_works_quote_asks SET declined_at = NOW(), decline_note = $2 WHERE id = $1 RETURNING *`, [id, note.trim().slice(0, 2000)]);
  if (!r) throw new Error("No such quote request.");
  return toAsk(r);
}

/** Theirs is taken; every other one still in the running is closed. Returns the closed ones. */
export async function acceptAsk(id: string, orderId: string): Promise<QuoteAsk[]> {
  await q(`UPDATE os_works_quote_asks SET outcome = 'accepted', outcome_at = NOW() WHERE id = $1`, [id]);
  return (
    await q<Row>(
      `UPDATE os_works_quote_asks SET outcome = 'closed', outcome_at = NOW()
        WHERE order_id = $1 AND id <> $2 AND outcome IS NULL AND declined_at IS NULL RETURNING *`,
      [orderId, id]
    )
  ).map(toAsk);
}
