import "server-only";
import { londonToday } from "@/lib/london-clock";
import { payPropGetAll, type PayPropAccountId } from "@/lib/business/payprop";

/*
 * THE RENT ITSELF (9 Oct 2026). A PayProp property's monthly_payment_required
 * is a setting nobody keeps up: 6 Ruskin Place read £1,000 there while its
 * Rent invoice bills £1,200, and 80 of the 123 homes taking their rent from
 * PayProp were off. The Rent invoice is what the tenant is actually charged.
 *
 * One walk of export/invoices per agency, shared by the tenancy register and
 * the portfolio book (both refresh hourly) so PayProp is asked once, not twice.
 */

const FRESH_MS = 20 * 60_000;
const walks = new Map<PayPropAccountId, { at: number; rows: Promise<Array<Record<string, unknown>>> }>();

/** Every recurring invoice on the agency. A failed walk is not kept. */
export function payPropInvoices(account: PayPropAccountId): Promise<Array<Record<string, unknown>>> {
  const held = walks.get(account);
  if (held && Date.now() - held.at < FRESH_MS) return held.rows;
  const rows = payPropGetAll<Record<string, unknown>>(account, "export/invoices");
  walks.set(account, { at: Date.now(), rows });
  rows.catch(() => {
    if (walks.get(account)?.rows === rows) walks.delete(account);
  });
  return rows;
}

/** An invoice's frequency_code as months: what one bill is worth per month. */
const MONTHS_PER: Record<string, number> = {
  M: 1,
  W: 52 / 12,
  "2W": 26 / 12,
  "4W": 13 / 12,
  Q: 1 / 3,
  "6M": 1 / 6,
  A: 1 / 12,
};

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export type InvoicedRent = { monthly: number; name: string | null; firstLine: string | null; postcode: string | null };

/*
 * RENT FILED UNDER ANOTHER NAME (22 Oct 2026). Some homes' rent is raised in
 * PayProp under "Other" or "Reimbursement" with the rent in the description:
 * 26 South Avenue, Carluke bills Mears Group £484.66 as "Other - Rent- 26
 * South Avenue", Kings Court 2A £600 the same way, 4 Riverside Crescent £375
 * as "Reimbursement - Monthly rent". Read as Rent only, those homes fell back
 * to PayProp's monthly_payment_required setting (£625 at South Avenue). The
 * same categories carry the management fee ("Experts Managed Service"), car
 * parking and the like, so the description has to say rent and not a fee.
 */
const RENT_WORDS = /\brent\b/i;
const NOT_RENT = /managed service|management|car ?park|parking|\bfee\b|deposit|holding/i;

/** "Rent", or another category whose description is plainly the rent. Null when it is not rent. */
export function rentCategory(inv: Record<string, unknown>): "Rent" | string | null {
  const cat = str((inv.category as Record<string, unknown> | undefined)?.name);
  if (!cat) return null;
  if (/^rent$/i.test(cat)) return "Rent";
  const what = str(inv.description) ?? "";
  return /^(other|reimbursement)$/i.test(cat) && RENT_WORDS.test(what) && !NOT_RENT.test(what) ? cat : null;
}

type Billed = { pid: string; tenant: string | null; monthly: number; from: string | null; to: string | null; category: string; inv: Record<string, unknown> };

/** Every rent invoice as a month's worth, with its dates. A frequency we don't know is left out rather than guessed. */
function billed(invoices: Array<Record<string, unknown>>): Billed[] {
  const out: Billed[] = [];
  for (const inv of invoices) {
    const category = rentCategory(inv);
    if (!category) continue;
    const prop = inv.property as Record<string, unknown> | undefined;
    const pid = str(prop?.id) ?? str(inv.property_id);
    const perMonth = MONTHS_PER[str(inv.frequency_code) ?? ""];
    const amount = Number(inv.gross_amount);
    if (!pid || !perMonth || !Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      pid,
      tenant: str((inv.tenant as Record<string, unknown> | undefined)?.id),
      monthly: amount * perMonth,
      from: str(inv.from_date)?.slice(0, 10) ?? null,
      to: str(inv.to_date)?.slice(0, 10) ?? null,
      category,
      inv,
    });
  }
  return out;
}
const inForce = (b: Billed, today: string) => !(b.from && b.from > today) && !(b.to && b.to < today);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The rent being billed today, a month's worth, by PayProp property id. Only
 * rent invoices in force today count (a re-let's next invoice is listed
 * before its start), turned into a month by their frequency, and two on one
 * property (joint tenants billed apart) add up. A frequency we don't know
 * adds nothing rather than a guess.
 */
export function rentByProperty(invoices: Array<Record<string, unknown>>, today = londonToday()): Record<string, InvoicedRent> {
  const out: Record<string, InvoicedRent> = {};
  for (const b of billed(invoices)) {
    if (!inForce(b, today)) continue;
    const prop = b.inv.property as Record<string, unknown> | undefined;
    const addr = prop?.address as Record<string, unknown> | undefined;
    const cur = out[b.pid];
    out[b.pid] = {
      monthly: round2((cur?.monthly ?? 0) + b.monthly),
      name: cur?.name ?? str(prop?.name),
      firstLine: cur?.firstLine ?? str(addr?.first_line),
      postcode: cur?.postcode ?? str(addr?.postal_code),
    };
  }
  return out;
}

export type HomeRents = {
  /** By PayProp property id: the rent billed today, and the category when PayProp filed it as something other than Rent. */
  now: Record<string, { monthly: number; filedAs: string | null }>;
  /** By "property id|tenant id": each tenant's own rent today (the rent box's per-tenant line). */
  byTenant: Record<string, number>;
  /** By PayProp property id, only where nothing is billed today: the next tenancy's rent and the day it starts. */
  next: Record<string, { monthly: number; from: string }>;
};

/** The rents the rent box and the book need, from one walk of export/invoices. */
export function homeRents(invoices: Array<Record<string, unknown>>, today = londonToday()): HomeRents {
  const now: HomeRents["now"] = {};
  const byTenant: HomeRents["byTenant"] = {};
  const next: HomeRents["next"] = {};
  const all = billed(invoices);
  for (const b of all) {
    if (!inForce(b, today)) continue;
    const cur = now[b.pid];
    now[b.pid] = { monthly: round2((cur?.monthly ?? 0) + b.monthly), filedAs: b.category === "Rent" ? cur?.filedAs ?? null : b.category };
    if (b.tenant) byTenant[`${b.pid}|${b.tenant}`] = round2((byTenant[`${b.pid}|${b.tenant}`] ?? 0) + b.monthly);
  }
  for (const b of all) {
    if (now[b.pid] || !b.from || b.from <= today) continue;
    const held = next[b.pid];
    if (!held || b.from < held.from) next[b.pid] = { monthly: round2(b.monthly), from: b.from };
    else if (b.from === held.from) held.monthly = round2(held.monthly + b.monthly);
  }
  return { now, byTenant, next };
}
