import "server-only";
import { getTenancyRegister } from "@/lib/business/payprop-tenancy";
import { getRentReceived, getMoveIns, getArrears } from "@/lib/business/payprop-income";
import { propertyKey } from "@/lib/business/payprop-portfolio";

/**
 * Everything PayProp can say about a deal, in one place both callers read.
 *
 * ── Why this was extracted rather than copied ─────────────────────────────
 *
 * The board and the alert runner both need this join, and it is not a lookup —
 * it is four date windows and a deliberately loose address key, each with a
 * reason it is the width it is. Writing it twice would have put two copies of
 * the most fragile code in the pre-tenancy stack in two files that nobody would
 * ever diff, and they would drift. The first symptom would be a digest telling
 * Kirstie something the board on her screen disagreed with, which destroys the
 * value of both.
 *
 * So the windows live here, once, with the reasoning attached.
 *
 * ── The windows, and why each is the size it is ───────────────────────────
 *
 * TENANCY, ±60 days. The PayProp tenancy at an address is usually the SITTING
 * tenant, not this deal's. Attaching it unqualified had "DEPOSIT HELD" claiming
 * a deposit the new deal did not have yet.
 *
 * HOLDING INVOICE, −90 to +30 days. Asymmetric on purpose: holding deposits are
 * invoiced BEFORE a move-in, so the window reaches back much further than it
 * reaches forward. A previous let's holding fee must not render on this deal.
 *
 * RENT RECEIVED, from 7 days before move-in AND only while the deal can still
 * plausibly own the tenancy. The 7 days keeps out the OUTGOING tenant's rent.
 * The second half keeps out the INCOMING one's, and was missing.
 *
 * Susan, 29 Aug, on three deals the digest flagged as "open 575 days and the
 * tenancy is paying": they are deals that FELL THROUGH and were never closed.
 * So the property was let again later, and the rent arriving is the NEXT
 * tenant's — attached to a dead deal because the only test was "not before
 * move-in", which anything in the last two months passes when move-in was a
 * year and a half ago.
 *
 * Rent now attaches only when the move-in is recent enough for the reports to
 * be about this tenancy, or when PayProp holds a tenancy matching this deal's
 * move-in — which is the proof that this deal is the live one.
 *
 * RENT SCHEDULE, ±60 days. Same as the tenancy, for the same reason.
 *
 * ARREARS, started tenancies only. The one that would have done real damage —
 * see the note on the gate below.
 *
 * ── null means "not loaded", never "nothing there" ────────────────────────
 *
 * Every source here goes through cachedAsync, which returns null on a cold key
 * and computes behind. `loaded` is what tells an empty answer from an unasked
 * question, and the runner refuses to send anything at all without it.
 */

export interface MoneyForDeal {
  rlp: { status: "protected" | "without"; evidence: string } | null;
  tenancy: { startDate: string | null; depositId: string | null } | null;
  schemeSuggestion: { scheme: string; evidence: string } | null;
  holdingInvoice: { amount: number; fromDate: string | null } | null;
  rentReceived: { amount: number; on: string; paidOut: boolean } | null;
  rentSchedule: { from: string; rent: number } | null;
  arrears: { owed: number; lastPayment: string | null } | null;
}

export interface MoneyContext {
  /** PayProp's money reports answered. False = say nothing, decide nothing. */
  loaded: boolean;
  /** The two months read, for reporting coverage honestly. */
  months: [string, string];
  arrearsLoaded: boolean;
  register: Awaited<ReturnType<typeof getTenancyRegister>>;
  rentByKey: Map<string, { amount: number; on: string; paidOut: boolean }>;
  schedByKey: Map<string, { from: string; rent: number }>;
  arrearsByKey: Map<string, { owed: number; lastPayment: string | null }>;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => (new Date(a).getTime() - new Date(b).getTime()) / DAY;

/**
 * How old a move-in may be before a receipt needs corroborating.
 *
 * Inside this, rent in the reports is plausibly this tenancy's. Beyond it, the
 * property may well have been let again, and a matching PayProp tenancy is
 * required before any money is attributed to this deal.
 */
const RENT_ATTACH_MAX_AGE_DAYS = 90;

/**
 * Fetch and index everything. Started in parallel by the caller where possible;
 * safe to call on its own in a cron, where a second or two costs nothing.
 */
export async function loadMoneyContext(now = new Date()): Promise<MoneyContext> {
  const thisMonth = now.toISOString().slice(0, 7);
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);

  const [register, rentThis, rentPrev, moveInsThis, moveInsPrev, arrears] = await Promise.all([
    getTenancyRegister().catch(() => null),
    getRentReceived(thisMonth).catch(() => null),
    getRentReceived(prevMonth).catch(() => null),
    getMoveIns(thisMonth).catch(() => null),
    getMoveIns(prevMonth).catch(() => null),
    getArrears().catch(() => null),
  ]);

  /* Two months folded into one lookup, EARLIEST receipt winning: the question
     is "has rent started", not "what came in last", so a tenancy paying since
     last month should show its first payment. */
  const rentByKey = new Map<string, { amount: number; on: string; paidOut: boolean }>();
  for (const r of [...(rentPrev?.receipts ?? []), ...(rentThis?.receipts ?? [])]) {
    if (!r.propertyKey) continue;
    const cur = rentByKey.get(r.propertyKey);
    if (!cur || r.receivedOn < cur.on) {
      rentByKey.set(r.propertyKey, { amount: r.amount, on: r.receivedOn, paidOut: r.paidOut });
    }
  }

  const schedByKey = new Map<string, { from: string; rent: number }>();
  for (const p of [...(moveInsPrev?.properties ?? []), ...(moveInsThis?.properties ?? [])]) {
    if (p.propertyKey && !schedByKey.has(p.propertyKey)) {
      schedByKey.set(p.propertyKey, { from: p.from, rent: p.rent });
    }
  }

  /* ONLY STARTED TENANCIES. PayProp reports every tenant in debit, and
     payprop-income states the consequence plainly: "a balance owing on a
     tenancy that has not started yet is not a debt — it is an invoice raised
     ahead of a move-in that has not happened... every not-yet-moved-in tenant
     reads as a late payer."

     A pre-tenancy board is almost entirely tenancies that have not started, so
     carrying those would paint nearly all of it as in arrears and send somebody
     chasing rent that is not due. */
  const asAt = now.toISOString().slice(0, 10);
  const arrearsByKey = new Map<string, { owed: number; lastPayment: string | null }>();
  for (const t of arrears?.tenants ?? []) {
    if (t.tenancyStart == null || t.tenancyStart > asAt || t.owed <= 0) continue;
    const k = propertyKey(t.property);
    /* Worst debt wins a contested key rather than the last row written — an
       ambiguous address must not quietly under-report what is owed. */
    if (k && (arrearsByKey.get(k)?.owed ?? 0) < t.owed) {
      arrearsByKey.set(k, { owed: t.owed, lastPayment: t.lastPayment });
    }
  }

  return {
    loaded: Boolean(rentThis || rentPrev),
    months: [prevMonth, thisMonth],
    arrearsLoaded: arrears != null,
    register,
    rentByKey,
    schedByKey,
    arrearsByKey,
  };
}

/**
 * The join, for one deal.
 *
 * @param propertyName the deal's address, as Propoly holds it
 * @param startDate    the claimed move-in; several windows are measured off it,
 *   and where it is missing the safe answer is to attach nothing rather than
 *   guess which tenancy a payment belonged to.
 */
export function moneyForDeal(
  ctx: MoneyContext,
  propertyName: string,
  startDate: string | null,
  now = new Date()
): MoneyForDeal {
  const key = propertyKey(propertyName);
  const reg = ctx.register;

  const tenancyRaw = key ? reg?.tenancyByKey[key] : undefined;
  const tenancy =
    tenancyRaw?.startDate != null && startDate != null &&
    Math.abs(days(tenancyRaw.startDate, startDate)) <= 60
      ? { startDate: tenancyRaw.startDate, depositId: tenancyRaw.depositId }
      : null;

  const holdingRaw = key ? reg?.holdingByKey[key] : undefined;
  const holdingDelta =
    holdingRaw?.fromDate != null && startDate != null
      ? days(holdingRaw.fromDate, startDate)
      : null;
  const holdingInvoice =
    holdingDelta != null && holdingDelta >= -90 && holdingDelta <= 30
      ? { amount: holdingRaw!.amount, fromDate: holdingRaw!.fromDate }
      : null;

  /* Two tests, not one. "Not before move-in" alone let a later tenant's rent
     land on a deal that fell through eighteen months ago. */
  const moveInAge =
    startDate != null ? days(now.toISOString().slice(0, 10), startDate) : null;
  const couldStillBeThisTenancy =
    moveInAge != null && (moveInAge <= RENT_ATTACH_MAX_AGE_DAYS || tenancy != null);
  const rentRaw = key ? ctx.rentByKey.get(key) : undefined;
  const rentReceived =
    rentRaw && startDate != null && couldStillBeThisTenancy && days(rentRaw.on, startDate) >= -7
      ? rentRaw
      : null;

  const schedRaw = key ? ctx.schedByKey.get(key) : undefined;
  const rentSchedule =
    schedRaw && startDate != null && Math.abs(days(schedRaw.from, startDate)) <= 60
      ? schedRaw
      : null;

  const rlpHit = key ? reg?.rlpByKey[key] : undefined;

  return {
    /* disabledOnly evidence is excluded outright: a dead payment instruction is
       not a statement about cover. */
    rlp: rlpHit && !rlpHit.disabledOnly ? { status: rlpHit.status, evidence: rlpHit.evidence } : null,
    tenancy,
    schemeSuggestion: (key ? reg?.schemeByKey[key] : undefined) ?? null,
    holdingInvoice,
    rentReceived,
    rentSchedule,
    arrears: (key ? ctx.arrearsByKey.get(key) : undefined) ?? null,
  };
}
