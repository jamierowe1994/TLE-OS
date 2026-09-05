import "server-only";
import { hasDb, q } from "@/lib/db";
import { payPropAccounts, payPropGetAll, type PayPropAccountId } from "@/lib/business/payprop";
import { readCache, writeCache } from "@/lib/business/integration-cache";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { normaliseEmail } from "@/lib/users";
import type { BusinessDeal } from "@/lib/business/propoly-deals";

/**
 * The holding fee and the deposit, seen in PayProp and matched to the deal.
 *
 * ── Why the invoice route was wrong ───────────────────────────────────────
 *
 * The watcher first looked for a "Holding deposit" invoice. There never is
 * one: the fee lands in PayProp as money with no invoice behind it, sitting
 * as a credit on the tenant until something is raised against it. So it is
 * invisible to export/invoices and to all-payments (which lists allocated
 * money). Where it IS visible is the tenant: a credit balance on
 * report/tenant/balances, and the tenant's last_payment. James, 5 Sep:
 * "match the application to the name of the payment and then any reference
 * ... and when it gets reconciled, we should recheck it."
 *
 * ── The match, in order of trust ──────────────────────────────────────────
 *
 *   email      the Propoly deal's tenant email equals the PayProp tenant's
 *   reference  the tenant's PayProp reference, or a payment's reference,
 *              carries the deal's standing-order reference
 *   name       the same person spelt PayProp's way ("Darling, Graeme") and
 *              Propoly's way ("Graeme Darling")
 *
 * Amount then says WHICH money it is: within a pound of the holding fee, or
 * of the deposit. A tenant with the right name and the wrong amount is not a
 * match; the rent is the existing reader's business.
 *
 * ── Two states, then a third ──────────────────────────────────────────────
 *
 *   paid        the tenant's balance or last payment shows the money in,
 *               before PayProp has reconciled it against anything
 *   reconciled  all-payments shows an incoming transaction of that amount
 *               from that tenant, with its reconciliation date
 *   held        deposit only: PayProp's deposit_balance for the tenant is at
 *               least the deposit, so it is registered with the scheme
 *
 * Every read is cached durably and shared with the rest of the OS's PayProp
 * work; nothing here is written to PayProp.
 */

export type MoneyKind = "holding" | "deposit";
export type MoneyStatus = "paid" | "reconciled" | "held";

export interface MoneyFact {
  kind: MoneyKind;
  status: MoneyStatus;
  amount: number;
  /** ISO date the money was seen, paid or reconciled. */
  on: string | null;
  matchedBy: "email" | "reference" | "name";
  tenantName: string;
  /** PayProp's deposit id when held. */
  depositId: string | null;
  note: string;
}

/* ───────────────────────────── PayProp reads ───────────────────────────── */

interface PpTenant {
  id: string;
  name: string;
  email: string | null;
  reference: string | null;
  account: PayPropAccountId;
}
interface PpBalance {
  tenantId: string;
  balance: number;
  depositBalance: number;
  depositId: string | null;
  lastPayment: { amount: number; on: string } | null;
  property: string | null;
}
interface PpIncoming {
  id: string;
  tenantId: string | null;
  tenantName: string;
  amount: number;
  property: string | null;
  bankDate: string | null;
  reconciled: string | null;
  references: string[];
}

const TENANTS_TTL = 30 * 60_000;
const BALANCES_TTL = 15 * 60_000;
const INCOMING_TTL = 30 * 60_000;
const money = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function cached<T>(key: string, ttl: number, compute: () => Promise<T>): Promise<T | null> {
  const held = await readCache<T>(key).catch(() => null);
  if (held && Date.now() - held.at < ttl) return held.data;
  try {
    const data = await compute();
    await writeCache(key, data);
    return data;
  } catch {
    return held?.data ?? null;
  }
}

async function tenantsFor(account: PayPropAccountId): Promise<PpTenant[]> {
  const rows =
    (await cached(`payprop:tenants:v1:${account}`, TENANTS_TTL, () => payPropGetAll<Record<string, unknown>>(account, "export/tenants"))) ?? [];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    name: str(r.display_name) ?? [str(r.last_name), str(r.first_name)].filter(Boolean).join(", "),
    email: str(r.email_address) ? normaliseEmail(String(r.email_address)) : null,
    reference: str(r.reference),
    account,
  })).filter((t) => t.id);
}

async function balancesFor(account: PayPropAccountId): Promise<Map<string, PpBalance>> {
  const rows =
    (await cached(`payprop:tenant-balances:v1:${account}`, BALANCES_TTL, () =>
      payPropGetAll<Record<string, unknown>>(account, "report/tenant/balances")
    )) ?? [];
  const out = new Map<string, PpBalance>();
  for (const r of rows) {
    const tenant = r.tenant as Record<string, unknown> | undefined;
    const id = str(tenant?.id);
    if (!id) continue;
    const lp = r.last_payment as Record<string, unknown> | undefined;
    out.set(id, {
      tenantId: id,
      balance: money(r.balance),
      depositBalance: money(r.deposit_balance),
      depositId: str(r.deposit_id),
      lastPayment: lp && str(lp.date) ? { amount: money(lp.amount), on: String(lp.date) } : null,
      property: str((r.property as Record<string, unknown> | undefined)?.name),
    });
  }
  return out;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function incomingFor(account: PayPropAccountId): Promise<PpIncoming[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  const rows =
    (await cached(`payprop:incoming:v1:${account}`, INCOMING_TTL, () =>
      payPropGetAll<Record<string, unknown>>(account, "report/all-payments", { from_date: ymd(from), to_date: ymd(to) })
    )) ?? [];
  const byId = new Map<string, PpIncoming>();
  for (const r of rows) {
    const inc = r.incoming_transaction as Record<string, unknown> | undefined;
    const id = str(inc?.id);
    if (!id) continue;
    const cur = byId.get(id) ?? {
      id,
      tenantId: str((inc?.tenant as Record<string, unknown> | undefined)?.id),
      tenantName: str((inc?.tenant as Record<string, unknown> | undefined)?.name) ?? "",
      amount: money(inc?.amount),
      property: str((inc?.property as Record<string, unknown> | undefined)?.name),
      bankDate: str((inc?.bank_statement as Record<string, unknown> | undefined)?.date),
      reconciled: str(inc?.reconciliation_date),
      references: [],
    };
    for (const k of ["reference", "description"]) {
      const v = str(r[k]);
      if (v && !cur.references.includes(v)) cur.references.push(v);
    }
    byId.set(id, cur);
  }
  return [...byId.values()];
}

/* ─────────────────────────────── matching ──────────────────────────────── */

const nameTokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z\s,]/g, " ")
      .split(/[\s,]+/)
      .filter((w) => w.length > 1)
  );

/** "Darling, Graeme" and "Graeme Darling" are the same person. */
function sameName(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.size < 2 || y.size < 2) return false;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared >= 2;
}

const near = (a: number, target: number) => target > 0 && Math.abs(a - target) <= 1;

interface Sources {
  tenants: PpTenant[];
  balances: Map<string, PpBalance>;
  incoming: PpIncoming[];
}

let sourcesHeld: { at: number; data: Sources } | null = null;

/** Every read, once per few minutes for the whole book. */
export async function loadMoneySources(): Promise<Sources | null> {
  if (sourcesHeld && Date.now() - sourcesHeld.at < 5 * 60_000) return sourcesHeld.data;
  const accounts = payPropAccounts();
  if (!accounts.length) return null;
  const tenants: PpTenant[] = [];
  const balances = new Map<string, PpBalance>();
  const incoming: PpIncoming[] = [];
  for (const a of accounts) {
    tenants.push(...(await tenantsFor(a)));
    for (const [k, v] of await balancesFor(a)) balances.set(k, v);
    incoming.push(...(await incomingFor(a)));
  }
  const data = { tenants, balances, incoming };
  sourcesHeld = { at: Date.now(), data };
  return data;
}

/** The PayProp tenants who are this deal's tenants, and how we knew. */
function tenantsOnDeal(deal: BusinessDeal, src: Sources): Array<{ t: PpTenant; by: MoneyFact["matchedBy"] }> {
  const out: Array<{ t: PpTenant; by: MoneyFact["matchedBy"] }> = [];
  const ref = deal.app.propoly?.standingOrderRef?.trim().toLowerCase() ?? "";
  const pk = propertyKey(deal.app.propertyName);
  for (const dt of deal.app.tenants) {
    const email = dt.email ? normaliseEmail(dt.email) : null;
    let hit = email ? src.tenants.find((t) => t.email === email) : undefined;
    let by: MoneyFact["matchedBy"] = "email";
    if (!hit && ref) {
      hit = src.tenants.find((t) => t.reference && t.reference.toLowerCase().includes(ref));
      by = "reference";
    }
    if (!hit) {
      /* Name, but only where PayProp's property agrees, so two Smiths on two
         streets never swap. */
      hit = src.tenants.find((t) => {
        if (!sameName(t.name, dt.name)) return false;
        const b = src.balances.get(t.id);
        return !b?.property || !pk || propertyKey(b.property) === pk;
      });
      by = "name";
    }
    if (hit && !out.some((o) => o.t.id === hit!.id)) out.push({ t: hit, by });
  }
  return out;
}

export function matchDealMoney(deal: BusinessDeal, src: Sources): { holding: MoneyFact | null; deposit: MoneyFact | null } {
  const people = tenantsOnDeal(deal, src);
  if (!people.length) return { holding: null, deposit: null };
  const holdingTarget = deal.app.propoly?.holdingFee ?? 0;
  const depositTarget = deal.app.propoly?.depositReplacement ? 0 : (deal.app.propoly?.deposit ?? 0);
  const ref = deal.app.propoly?.standingOrderRef?.trim().toLowerCase() ?? "";

  let holding: MoneyFact | null = null;
  let deposit: MoneyFact | null = null;

  for (const { t, by } of people) {
    const bal = src.balances.get(t.id) ?? null;
    const mine = src.incoming.filter(
      (i) => i.tenantId === t.id || (ref && i.references.some((r) => r.toLowerCase().includes(ref)))
    );

    /* Reconciled wins over paid, and held wins over both for the deposit. */
    if (holdingTarget) {
      const rec = mine.find((i) => near(i.amount, holdingTarget) && i.reconciled);
      if (rec && (!holding || holding.status !== "reconciled")) {
        holding = { kind: "holding", status: "reconciled", amount: rec.amount, on: rec.reconciled, matchedBy: by, tenantName: t.name, depositId: null, note: `Reconciled ${rec.reconciled} against ${rec.property ?? "the property"}.` };
      } else if (!holding && bal) {
        if (bal.lastPayment && near(bal.lastPayment.amount, holdingTarget)) {
          holding = { kind: "holding", status: "paid", amount: bal.lastPayment.amount, on: bal.lastPayment.on, matchedBy: by, tenantName: t.name, depositId: null, note: "Paid, not yet reconciled: sits as a credit on the tenant." };
        } else if (bal.balance >= holdingTarget - 1 && bal.balance > 0) {
          holding = { kind: "holding", status: "paid", amount: holdingTarget, on: bal.lastPayment?.on ?? null, matchedBy: by, tenantName: t.name, depositId: null, note: `The tenant is £${Math.round(bal.balance)} in credit, enough for the holding fee.` };
        }
      }
    }

    if (depositTarget) {
      if (bal && bal.depositBalance >= depositTarget - 1) {
        deposit = { kind: "deposit", status: "held", amount: bal.depositBalance, on: null, matchedBy: by, tenantName: t.name, depositId: bal.depositId, note: `Held by PayProp${bal.depositId ? ` as ${bal.depositId}` : ""}.` };
      } else {
        const rec = mine.find((i) => near(i.amount, depositTarget) && i.reconciled);
        if (rec && (!deposit || deposit.status === "paid")) {
          deposit = { kind: "deposit", status: "reconciled", amount: rec.amount, on: rec.reconciled, matchedBy: by, tenantName: t.name, depositId: null, note: `Reconciled ${rec.reconciled}.` };
        } else if (!deposit && bal?.lastPayment && near(bal.lastPayment.amount, depositTarget)) {
          deposit = { kind: "deposit", status: "paid", amount: bal.lastPayment.amount, on: bal.lastPayment.on, matchedBy: by, tenantName: t.name, depositId: null, note: "Paid, not yet reconciled." };
        }
      }
    }
  }
  return { holding, deposit };
}

/* ─────────────────────────────── the store ─────────────────────────────── */

export interface DealMoneyRow {
  dealId: string;
  kind: MoneyKind;
  status: MoneyStatus;
  amount: number;
  on: string | null;
  matchedBy: string;
  tenantName: string;
  depositId: string | null;
  note: string;
  firstSeen: string;
  updatedAt: string;
}

interface Row extends Record<string, unknown> {
  deal_id: string;
  kind: string;
  status: string;
  amount: string | number;
  on_date: string | Date | null;
  matched_by: string;
  tenant_name: string;
  deposit_id: string | null;
  note: string;
  first_seen: string | Date;
  updated_at: string | Date;
}

const rowTo = (r: Row): DealMoneyRow => ({
  dealId: r.deal_id,
  kind: r.kind as MoneyKind,
  status: r.status as MoneyStatus,
  amount: Number(r.amount),
  on: r.on_date ? new Date(r.on_date).toISOString().slice(0, 10) : null,
  matchedBy: r.matched_by,
  tenantName: r.tenant_name,
  depositId: r.deposit_id,
  note: r.note,
  firstSeen: new Date(r.first_seen).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function dealMoneyFor(dealIds: string[]): Promise<Map<string, { holding: DealMoneyRow | null; deposit: DealMoneyRow | null }>> {
  const out = new Map<string, { holding: DealMoneyRow | null; deposit: DealMoneyRow | null }>();
  if (!hasDb() || !dealIds.length) return out;
  const rows = await q<Row>(`SELECT * FROM os_deal_money WHERE deal_id = ANY($1::text[])`, [dealIds]);
  for (const r of rows) {
    const cur = out.get(r.deal_id) ?? { holding: null, deposit: null };
    cur[r.kind as MoneyKind] = rowTo(r);
    out.set(r.deal_id, cur);
  }
  return out;
}

export async function saveDealMoney(dealId: string, f: MoneyFact): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_deal_money (deal_id, kind, status, amount, on_date, matched_by, tenant_name, deposit_id, note, first_seen, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (deal_id, kind) DO UPDATE SET
       status = EXCLUDED.status, amount = EXCLUDED.amount, on_date = EXCLUDED.on_date, matched_by = EXCLUDED.matched_by,
       tenant_name = EXCLUDED.tenant_name, deposit_id = EXCLUDED.deposit_id, note = EXCLUDED.note, updated_at = NOW()`,
    [dealId, f.kind, f.status, f.amount, f.on, f.matchedBy, f.tenantName, f.depositId, f.note]
  );
}

/** Rank so a recheck only ever moves forward: paid → reconciled → held. */
export const MONEY_RANK: Record<MoneyStatus, number> = { paid: 1, reconciled: 2, held: 3 };
