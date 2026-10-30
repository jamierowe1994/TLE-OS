import "server-only";
import { hasDb, q } from "@/lib/db";
import { decisionsFor } from "@/lib/offer-decisions";
import type { OfferDecision } from "@/lib/applications";

/**
 * ONE OFFER PER PERSON PER HOME (James, 29 Oct 2026).
 *
 * Sean, on 68 Main Street: "this is a duplicate offer from the same person.
 * So if I decline it, he'll think, oh, I've been declined." James: "no tenant
 * should be able to apply twice ... if they've already applied, it should
 * merge them into one." The live book had it already: April Pearce twice on
 * Chequers Court (25 Oct) and Bailey Cookson twice on 10 Thornton Road
 * (29 Oct), one of each declined, so a tenant whose offer was going ahead was
 * also told no.
 *
 * So a second offer from the same person on the same listing - same email,
 * or same phone number - joins the one already there instead of making a new
 * row:
 *
 *   still open      the newest answers stand (it is what they mean now)
 *   accepted        the answers stay as accepted; the new figures are noted
 *   declined        stays declined - the agent said no - and the agent is
 *                   told it is a repeat, not a fresh offer
 *
 * Every time they sent it is kept on the offer, oldest first, in
 * payload.history, so the Offers tab can say "offered 3 times".
 */

export type OfferTry = { at: string; amount: number | null; moveIn: string | null; via: string };

export type PriorOffer = {
  id: string;
  name: string;
  createdAt: string;
  decision: OfferDecision | null;
  payload: Record<string, unknown>;
};

/** A phone number as the last ten digits, so 07700 900123 and +44 7700 900123 meet. */
export function phoneKey(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/** Who somebody is, for telling a repeat: their email and their phone. */
export function personKeys(email: unknown, phone: unknown): string[] {
  const e = String(email ?? "").trim().toLowerCase();
  const p = phoneKey(phone);
  return [e && e.includes("@") ? `e:${e}` : "", p ? `p:${p}` : ""].filter(Boolean);
}

/** Every phone an offer's payload carries for its lead: the passport's, or the form's lead applicant's. */
export function offerPhones(payload: Record<string, unknown> | null | undefined): string[] {
  const p = (payload ?? {}) as { passport?: { mobile?: string; phone?: string } | null; applicants?: { phone?: string; isPrimary?: boolean }[] };
  const lead = p.applicants?.find((a) => a?.isPrimary) ?? p.applicants?.[0];
  return [p.passport?.mobile, p.passport?.phone, lead?.phone].map(phoneKey).filter(Boolean);
}

const via = (p: Record<string, unknown>): string => {
  const x = p as { via?: string; source?: string; recordedBy?: { name?: string } };
  return x.recordedBy?.name ? `Put forward by ${x.recordedBy.name}` : x.via || (x.source === "viewing-feedback" ? "Viewing feedback" : x.source === "application-form" ? "Application form" : "Tenant area");
};

const tryOf = (at: string, p: Record<string, unknown>): OfferTry => ({
  at,
  amount: typeof p.amount === "number" ? p.amount : null,
  moveIn: typeof p.moveIn === "string" && p.moveIn ? p.moveIn : null,
  via: via(p),
});

/** The tries on an offer, oldest first; one for an offer that was only ever sent once. */
export function offerHistory(createdAt: string, payload: Record<string, unknown>): OfferTry[] {
  const h = (payload as { history?: OfferTry[] }).history;
  return Array.isArray(h) && h.length ? h : [tryOf(createdAt, payload)];
}

/**
 * This person's offer already on this listing, if they have one. Matched on
 * email first, then on any phone number, across every offer on the home -
 * a handful at most, so it is read whole and matched here.
 */
export async function priorOffer(listingId: string | number, email: string, phones: unknown[] = []): Promise<PriorOffer | null> {
  if (!hasDb() || !String(listingId)) return null;
  const rows = await q<{ id: string; email: string; name: string; payload: Record<string, unknown>; created_at: Date }>(
    `SELECT id, email, name, payload, created_at FROM os_tenant_viewing_responses
      WHERE kind = 'offer' AND listing_id = $1 ORDER BY created_at ASC`,
    [String(listingId)]
  ).catch(() => []);
  if (!rows.length) return null;
  const e = email.trim().toLowerCase();
  const want = new Set(phones.map(phoneKey).filter(Boolean));
  const hit =
    (e ? rows.find((r) => r.email.trim().toLowerCase() === e) : undefined) ??
    (want.size ? rows.find((r) => offerPhones(r.payload).some((p) => want.has(p))) : undefined);
  if (!hit) return null;
  const decided = await decisionsFor([`os:${hit.id}`]).catch(() => new Map<string, OfferDecision>());
  return { id: hit.id, name: hit.name, createdAt: new Date(hit.created_at).toISOString(), decision: decided.get(`os:${hit.id}`) ?? null, payload: hit.payload ?? {} };
}

/**
 * Join a repeat to the offer already there. An open offer takes the newest
 * answers; a decided one keeps what was decided on. Either way the try is
 * added to its history and nothing new appears on the listing.
 */
export async function foldRepeat(prior: PriorOffer, next: { name: string; email: string; payload: Record<string, unknown>; sentTo: string | null; outcome: string }): Promise<void> {
  const now = new Date().toISOString();
  const history = [...offerHistory(prior.createdAt, prior.payload), tryOf(now, next.payload)];
  const payload = prior.decision
    ? { ...prior.payload, history, againAt: now }
    : { ...next.payload, history, againAt: now, firstOffered: (prior.payload as { firstOffered?: unknown }).firstOffered ?? prior.payload.amount ?? null };
  await q(
    `UPDATE os_tenant_viewing_responses
        SET payload = $2::jsonb, name = CASE WHEN $3 = '' THEN name ELSE $3 END, sent_to = COALESCE($4, sent_to), outcome = $5
      WHERE id = $1`,
    [prior.id, JSON.stringify(payload), prior.decision ? "" : next.name.trim(), next.sentTo, next.outcome.slice(0, 300)]
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** The line that opens the agent's email when an offer is a repeat. */
export function repeatLine(prior: PriorOffer): string {
  const tries = offerHistory(prior.createdAt, prior.payload).length + 1;
  const first = `They first offered on ${day(prior.createdAt)}, so this is their ${tries === 2 ? "second" : tries === 3 ? "third" : `${tries}th`} offer on this home.`;
  if (prior.decision?.decision === "declined") {
    return `${first} Their offer was declined by ${prior.decision.by} on ${day(prior.decision.at)}. It stays declined and nothing has gone to them; the new figures are added to that offer, not kept as a new one.`;
  }
  if (prior.decision?.decision === "accepted") {
    return `${first} Their offer was already accepted on ${day(prior.decision.at)}, so it is unchanged; the new figures are noted on it.`;
  }
  return `${first} It has replaced their earlier offer rather than sitting beside it.`;
}
