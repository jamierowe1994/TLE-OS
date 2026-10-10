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

/**
 * The rent being billed today, a month's worth, by PayProp property id. Only
 * "Rent" invoices in force today count (a re-let's next invoice is listed
 * before its start), turned into a month by their frequency, and two on one
 * property (joint tenants billed apart) add up. A frequency we don't know
 * adds nothing rather than a guess.
 */
export function rentByProperty(invoices: Array<Record<string, unknown>>, today = londonToday()): Record<string, InvoicedRent> {
  const out: Record<string, InvoicedRent> = {};
  for (const inv of invoices) {
    const cat = str((inv.category as Record<string, unknown> | undefined)?.name);
    if (!cat || !/^rent$/i.test(cat)) continue;
    const prop = inv.property as Record<string, unknown> | undefined;
    const pid = str(prop?.id) ?? str(inv.property_id);
    const perMonth = MONTHS_PER[str(inv.frequency_code) ?? ""];
    const amount = Number(inv.gross_amount);
    const from = str(inv.from_date)?.slice(0, 10) ?? null;
    const to = str(inv.to_date)?.slice(0, 10) ?? null;
    if (!pid || !perMonth || !Number.isFinite(amount) || amount <= 0) continue;
    if ((from && from > today) || (to && to < today)) continue;
    const addr = prop?.address as Record<string, unknown> | undefined;
    const cur = out[pid];
    out[pid] = {
      monthly: Math.round(((cur?.monthly ?? 0) + amount * perMonth) * 100) / 100,
      name: cur?.name ?? str(prop?.name),
      firstLine: cur?.firstLine ?? str(addr?.first_line),
      postcode: cur?.postcode ?? str(addr?.postal_code),
    };
  }
  return out;
}
