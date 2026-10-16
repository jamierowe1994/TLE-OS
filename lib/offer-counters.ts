import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * THE BACK-AND-FORTH ON AN OFFER (James, 16 Oct 2026).
 *
 * "If the tenant offers 1,000 and the landlord counters at 1,050, then they
 * agree on 1,050, and that's the deal." Each counter is one row in
 * os_offer_counters, oldest first. The newest is the figure on the table;
 * Accept takes that figure (and its move-in date, if the counter changed it)
 * as the agreed one, so Applications and the push to Propoly carry what was
 * agreed, not what was first offered.
 *
 * The agent keys each round in for whichever side made it - landlords are
 * mostly agreed with on a call. Nothing is sent to anyone from here.
 *
 *   ref "os:<id>" | "rex:<appId>" | "test:<appId>"   as os_offer_decisions
 */

export type CounterSide = "landlord" | "tenant";

export type OfferCounter = {
  id: string;
  side: CounterSide;
  amount: number;
  moveIn: string | null;
  note: string | null;
  by: string;
  at: string;
};

export const isCounterRef = (v: unknown): v is string => typeof v === "string" && /^(os|rex|test):[A-Za-z0-9-]{1,64}$/.test(v);

type Row = { id: string; ref: string; side: CounterSide; amount: string | number; move_in: string | null; note: string; by_name: string; by_email: string; created_at: Date };

const toCounter = (r: Row): OfferCounter => ({
  id: r.id,
  side: r.side,
  amount: Number(r.amount),
  moveIn: r.move_in || null,
  note: r.note?.trim() || null,
  by: r.by_name || r.by_email,
  at: new Date(r.created_at).toISOString(),
});

/** Every counter on these offers, by ref, oldest first. Missing means none. */
export async function countersFor(refs: string[]): Promise<Map<string, OfferCounter[]>> {
  const out = new Map<string, OfferCounter[]>();
  const want = [...new Set(refs.filter(Boolean))];
  if (!hasDb() || !want.length) return out;
  const rows = await q<Row>(
    `SELECT id, ref, side, amount, move_in, note, by_name, by_email, created_at FROM os_offer_counters
      WHERE ref = ANY($1::text[]) ORDER BY created_at ASC`,
    [want]
  ).catch(() => [] as Row[]);
  for (const r of rows) {
    const list = out.get(r.ref) ?? [];
    list.push(toCounter(r));
    out.set(r.ref, list);
  }
  return out;
}

/** The figure on the table now: the newest counter, or null if nobody has countered. */
export async function latestCounter(ref: string): Promise<OfferCounter | null> {
  const list = (await countersFor([ref])).get(ref) ?? [];
  return list[list.length - 1] ?? null;
}

export async function addCounter(p: {
  ref: string;
  listingId: string | null;
  side: CounterSide;
  amount: number;
  moveIn: string | null;
  note: string | null;
  by: { name: string; email: string };
}): Promise<OfferCounter> {
  const id = randomUUID();
  const rows = await q<Row>(
    `INSERT INTO os_offer_counters (id, ref, listing_id, side, amount, move_in, note, by_name, by_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, ref, side, amount, move_in, note, by_name, by_email, created_at`,
    [id, p.ref, p.listingId, p.side, p.amount, p.moveIn, (p.note ?? "").slice(0, 1000), p.by.name, p.by.email.toLowerCase()]
  );
  return toCounter(rows[0]);
}

/** Take back the newest counter (keyed in wrong). Only the newest, so the history stays true. */
export async function removeLatestCounter(ref: string, id: string): Promise<boolean> {
  const last = await latestCounter(ref);
  if (!last || last.id !== id) return false;
  await q(`DELETE FROM os_offer_counters WHERE id = $1 AND ref = $2`, [id, ref]);
  return true;
}

/**
 * An OS offer accepted at a countered figure: the offer itself now says the
 * agreed rent and move-in (Applications, the hand-over and Propoly all read
 * payload.amount / payload.moveIn), and keeps what was first offered in
 * offeredAmount / offeredMoveIn. Undo puts the first offer back.
 */
export async function settleOsOffer(offerId: string, agreed: OfferCounter): Promise<void> {
  await q(
    `UPDATE os_tenant_viewing_responses
        SET payload = payload
          || jsonb_build_object('offeredAmount', COALESCE(payload->'offeredAmount', payload->'amount'))
          || jsonb_build_object('offeredMoveIn', COALESCE(payload->'offeredMoveIn', payload->'moveIn'))
          || jsonb_build_object('amount', $2::numeric)
          || CASE WHEN $3::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('moveIn', $3::text) END
      WHERE id = $1 AND kind = 'offer'`,
    [offerId, agreed.amount, agreed.moveIn]
  );
}

/** Undo an accept: the offer says what was first offered again. */
export async function unsettleOsOffer(offerId: string): Promise<void> {
  await q(
    `UPDATE os_tenant_viewing_responses
        SET payload = (payload
          || CASE WHEN payload ? 'offeredAmount' AND payload->'offeredAmount' <> 'null'::jsonb THEN jsonb_build_object('amount', payload->'offeredAmount') ELSE '{}'::jsonb END
          || CASE WHEN payload ? 'offeredMoveIn' AND payload->'offeredMoveIn' <> 'null'::jsonb THEN jsonb_build_object('moveIn', payload->'offeredMoveIn') ELSE '{}'::jsonb END)
          - 'offeredAmount' - 'offeredMoveIn'
      WHERE id = $1 AND kind = 'offer'`,
    [offerId]
  );
}

/** The agreed rent on REX applications accepted here at a countered figure, by application id. */
export async function agreedOnRexApps(appIds: string[]): Promise<Map<string, OfferCounter>> {
  const out = new Map<string, OfferCounter>();
  if (!hasDb() || !appIds.length) return out;
  const refs = appIds.map((id) => `rex:${id}`);
  const accepted = await q<{ ref: string }>(`SELECT ref FROM os_offer_decisions WHERE decision = 'accepted' AND ref = ANY($1::text[])`, [refs]).catch(() => []);
  if (!accepted.length) return out;
  const counters = await countersFor(accepted.map((r) => r.ref));
  for (const [ref, list] of counters) {
    const last = list[list.length - 1];
    if (last) out.set(ref.slice(4), last);
  }
  return out;
}
