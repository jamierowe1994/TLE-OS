import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * DISCARD A DUPLICATE OFFER (James, 29 Oct 2026).
 *
 * Sean, on 68 Main Street, with two offers from the same tenant: declining
 * the second "is going to send him an email saying his offer's declined. So
 * it's just going to leave it there in perpetuity." James: "you need a button
 * that will allow you to discard it."
 *
 * Discard takes an offer off the listing's Offers and tells nobody: no email
 * to the tenant, the landlord or anyone else. It is only offered on an offer
 * that is a second one from the same person (the Offers route works that
 * out), never on an accepted one. Nothing is deleted - the offer itself and
 * any REX application stay as they are - this row only hides it, and the
 * listing's Activity says who discarded it and when.
 *
 *   ref           "os:<id>" or "rex:<id>", as os_offer_decisions
 *   duplicate_of  the offer it repeats, the one that stays
 */

export type Discard = { ref: string; listingId: string; name: string; duplicateOf: string | null; by: string; at: string };

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_offer_discards (
      ref          TEXT PRIMARY KEY,
      listing_id   TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      duplicate_of TEXT,
      by_name      TEXT NOT NULL DEFAULT '',
      by_email     TEXT NOT NULL DEFAULT '',
      discarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_offer_discards_listing ON os_offer_discards (listing_id)`))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q<T>(text, params);
}

type Row = { ref: string; listing_id: string; name: string; duplicate_of: string | null; by_name: string; by_email: string; discarded_at: Date };

const toDiscard = (r: Row): Discard => ({ ref: r.ref, listingId: r.listing_id, name: r.name, duplicateOf: r.duplicate_of, by: r.by_name || r.by_email, at: new Date(r.discarded_at).toISOString() });

/** The offers discarded on one listing, newest first. */
export async function discardsForListing(listingId: string): Promise<Discard[]> {
  if (!hasDb()) return [];
  const rows = await tq<Row>(`SELECT * FROM os_offer_discards WHERE listing_id = $1 ORDER BY discarded_at DESC`, [listingId]).catch(() => [] as Row[]);
  return rows.map(toDiscard);
}

/** The refs among these that have been discarded, for the boards that count offers. */
export async function discardedRefs(refs: string[]): Promise<Set<string>> {
  const want = [...new Set(refs.filter(Boolean))];
  if (!hasDb() || !want.length) return new Set();
  const rows = await tq<{ ref: string }>(`SELECT ref FROM os_offer_discards WHERE ref = ANY($1::text[])`, [want]).catch(() => []);
  return new Set(rows.map((r) => r.ref));
}

export async function recordDiscard(p: { ref: string; listingId: string; name: string; duplicateOf: string | null; by: { name: string; email: string } }): Promise<void> {
  await tq(
    `INSERT INTO os_offer_discards (ref, listing_id, name, duplicate_of, by_name, by_email, discarded_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (ref) DO NOTHING`,
    [p.ref, p.listingId, p.name.slice(0, 200), p.duplicateOf, p.by.name, p.by.email.toLowerCase()]
  );
}
