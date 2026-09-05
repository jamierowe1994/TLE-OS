import "server-only";
import type { BusinessDeal } from "@/lib/business/propoly-deals";
import type { DealMeta } from "@/lib/business/types";
import { portalStageOf } from "@/lib/business/propoly-stages";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { loadMoneyContext, moneyForDeal, type MoneyContext } from "@/lib/business/deal-money";
import { listCases } from "@/lib/plc-store";
import { dealMoneyFor, type DealMoneyRow } from "@/lib/business/deposit-match";
import type { PlcCase } from "@/lib/plc";

/**
 * Where a deal is, worked out rather than dragged.
 *
 * ── The decision (James and Kirstie, 4 Sep) ───────────────────────────────
 *
 * "There's enough systems in place with enough automation that they should
 * just move for you. The only one that would need to be done is when it goes
 * from rent payment to move day." So the Kanban is retired: seven of the
 * eight stages are read from a record, and only Move day is Kirstie's hand.
 *
 * ── The records ────────────────────────────────────────────────────────────
 *
 * Propoly's status carries the deal to referencing and, once references are
 * back, into tenancy_generation. Inside that one Propoly status three of
 * Kirstie's stages happen, and each has its own source:
 *
 *   PLC               the OS's own PLC case - approved, or not
 *   Deposit           the Flatfair tick, a PayProp deposit id, or a scheme
 *                     recorded on the file
 *   Tenancy agreement Kirstie generates it in Propoly; when she does, Propoly
 *                     moves to signing_and_move_in_monies
 *
 * Signing has no source (Propoly exposes nothing), so the deal stays at
 * Tenancy agreement until PayProp shows the first rent, which is the proof the
 * tenancy is real. Then Rent payment. Then Move day: Propoly's "complete", or
 * Kirstie's hand, whichever comes first.
 *
 * ── What happened to her old moves ─────────────────────────────────────────
 *
 * A stage she moved by hand to PLC or Deposit is now derived from the record
 * of that stage instead. Where no record exists in the OS - a PLC done by
 * email before the pack existed - the deal reads as at PLC, which is true:
 * nothing in the system says otherwise, and the fix is to record it, not to
 * drag it.
 */

export interface StageFacts {
  /** The OS's PLC case state for this deal's address, or null when none. */
  plcState: PlcCase["state"] | null;
  plcCaseId: string | null;
  /** Kirstie's tick for a PLC done by email, outside the pack. */
  plcOutside: boolean;
  /** Flatfair set up, PayProp deposit registered, or a scheme on file. */
  depositDone: boolean;
  /** First rent received in PayProp for this tenancy. */
  rentIn: boolean;
}

const NO_FACTS: StageFacts = { plcState: null, plcCaseId: null, plcOutside: false, depositDone: false, rentIn: false };

export function derivePortalStage(live: string, facts: StageFacts, meta: Pick<DealMeta, "stageOverride" | "stageBasedOn"> | null): string {
  if (live === "cancelled") return "cancelled";
  /* Move day is the one stage a person moves. The override still has to be
     based on the live status it was made against, as before: a deal Propoly
     has since moved on resets to the record. */
  if (meta?.stageOverride === "move_day" && meta.stageBasedOn === live) return "move_day";
  switch (live) {
    case "start_deal":
      return "deal_started";
    case "holding_fee":
      return "holding_fee";
    case "references":
      return "referencing";
    case "tenancy_generation":
      if (facts.plcState !== "approved" && !facts.plcOutside) return "plc";
      if (!facts.depositDone) return "deposit";
      return "tenancy_agreement";
    case "signing_and_move_in_monies":
      return facts.rentIn ? "rent_payment" : "tenancy_agreement";
    case "complete":
      return "move_day";
    default:
      return portalStageOf(live);
  }
}

/* ────────────────────────── finding the records ────────────────────────── */

/**
 * The PLC case for an address. Cases are keyed by the REX application, deals
 * by Propoly uuid, and nothing joins them but the address - so the join is
 * the same loose key PayProp matching uses (number + street). Newest wins
 * where two cases share a key.
 */
export function plcCaseForAddress(cases: PlcCase[], propertyName: string): PlcCase | null {
  const key = propertyKey(propertyName);
  if (!key) return null;
  let best: PlcCase | null = null;
  for (const c of cases) {
    if (propertyKey(c.address) !== key) continue;
    if (!best || c.createdAt > best.createdAt) best = c;
  }
  return best;
}

export function stageFactsFor(
  deal: BusinessDeal,
  meta: DealMeta | null,
  cases: PlcCase[],
  money: MoneyContext | null,
  matched?: { holding: DealMoneyRow | null; deposit: DealMoneyRow | null } | null
): StageFacts {
  const plc = plcCaseForAddress(cases, deal.app.propertyName);
  const m = money?.loaded ? moneyForDeal(money, deal.app.propertyName, deal.app.startDate) : null;
  const depositDone =
    meta?.checklist?.deposit_registered?.done === true ||
    Boolean(meta?.depositScheme) ||
    Boolean(m?.tenancy?.depositId) ||
    /* Matched in PayProp to this deal's tenant: reconciled or held counts. */
    (matched?.deposit != null && matched.deposit.status !== "paid");
  return {
    plcState: plc?.state ?? null,
    plcCaseId: plc?.id ?? null,
    plcOutside: meta?.checklist?.plc_outside?.done === true,
    depositDone,
    rentIn: Boolean(m?.rentReceived),
  };
}

/**
 * Everything the derivation needs, loaded once for a whole board. Both reads
 * are cached behind their own modules, so a second caller in the same request
 * pays nothing. Either failing degrades to "no facts", which reads as the
 * earliest stage the live status allows - never as a stage nobody reached.
 */
export async function loadStageSources(dealIds: string[] = []): Promise<{
  cases: PlcCase[];
  money: MoneyContext | null;
  matched: Map<string, { holding: DealMoneyRow | null; deposit: DealMoneyRow | null }>;
}> {
  const [cases, money, matched] = await Promise.all([
    listCases().catch(() => [] as PlcCase[]),
    loadMoneyContext().catch(() => null),
    dealMoneyFor(dealIds).catch(() => new Map()),
  ]);
  return { cases, money, matched };
}

/** One deal, from cold. For the routes that answer about a single deal. */
export async function derivedStageFor(deal: BusinessDeal, meta: DealMeta | null): Promise<string> {
  try {
    const { cases, money, matched } = await loadStageSources([deal.app.id]);
    return derivePortalStage(deal.statusKey, stageFactsFor(deal, meta, cases, money, matched.get(deal.app.id) ?? null), meta);
  } catch {
    return derivePortalStage(deal.statusKey, NO_FACTS, meta);
  }
}
