import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OfferDecision } from "@/lib/applications";

/**
 * THE AGENT'S ACCEPT OR DECLINE ON AN OFFER (7 Oct 2026).
 *
 * James: an offer is not an application until it is accepted - until then
 * the home is still taking viewings - and an agent must be able to decline an
 * offer as well as accept it, not only the landlord.
 *
 * Recorded in the OS only (James chose this, 7 Oct): REX is still updated by
 * hand, so a REX application accepted here says so on its file and asks the
 * agent to mark it in REX. Test offers are not kept here; their status lives
 * on the test file (lib/test-overlay).
 *
 *   ref "os:<id>"   an offer saved in the OS (os_tenant_viewing_responses)
 *   ref "rex:<id>"  a TenancyApplication in REX
 */

export type DecisionRef = `os:${string}` | `rex:${string}`;

export const isDecisionRef = (v: unknown): v is DecisionRef => typeof v === "string" && /^(os|rex):[A-Za-z0-9-]{1,64}$/.test(v);

type Row = { ref: string; decision: "accepted" | "declined"; by_name: string; by_email: string; decided_at: Date };

const toDecision = (r: Row): OfferDecision => ({ decision: r.decision, by: r.by_name || r.by_email, at: new Date(r.decided_at).toISOString() });

/** The decisions on these refs, by ref. Missing means nobody has decided. */
export async function decisionsFor(refs: string[]): Promise<Map<string, OfferDecision>> {
  const out = new Map<string, OfferDecision>();
  const want = [...new Set(refs.filter(Boolean))];
  if (!hasDb() || !want.length) return out;
  const rows = await q<Row>(`SELECT ref, decision, by_name, by_email, decided_at FROM os_offer_decisions WHERE ref = ANY($1::text[])`, [want]).catch(() => [] as Row[]);
  for (const r of rows) out.set(r.ref, toDecision(r));
  return out;
}

/** Every decision on one listing's offers. */
export async function decisionsForListing(listingId: string): Promise<Map<string, OfferDecision>> {
  const out = new Map<string, OfferDecision>();
  if (!hasDb()) return out;
  const rows = await q<Row>(`SELECT ref, decision, by_name, by_email, decided_at FROM os_offer_decisions WHERE listing_id = $1`, [listingId]).catch(() => [] as Row[]);
  for (const r of rows) out.set(r.ref, toDecision(r));
  return out;
}

/** Every REX application accepted in the OS, for the Applications board. */
export async function acceptedRexRefs(): Promise<Map<string, OfferDecision>> {
  const out = new Map<string, OfferDecision>();
  if (!hasDb()) return out;
  const rows = await q<Row>(`SELECT ref, decision, by_name, by_email, decided_at FROM os_offer_decisions WHERE ref LIKE 'rex:%'`).catch(() => [] as Row[]);
  for (const r of rows) out.set(r.ref, toDecision(r));
  return out;
}

export async function recordDecision(p: { ref: DecisionRef; listingId: string | null; decision: "accepted" | "declined"; note?: string; by: { name: string; email: string } }): Promise<void> {
  await q(
    `INSERT INTO os_offer_decisions (ref, listing_id, decision, note, by_name, by_email, decided_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (ref) DO UPDATE SET decision = EXCLUDED.decision, note = EXCLUDED.note, by_name = EXCLUDED.by_name, by_email = EXCLUDED.by_email, decided_at = NOW()`,
    [p.ref, p.listingId, p.decision, (p.note ?? "").slice(0, 1000), p.by.name, p.by.email.toLowerCase()]
  );
}

/** Undo: the offer is open again. */
export async function clearDecision(ref: DecisionRef): Promise<void> {
  await q(`DELETE FROM os_offer_decisions WHERE ref = $1`, [ref]);
}
