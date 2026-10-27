import "server-only";
import { hasDb, q } from "@/lib/db";
import { contractorBank } from "@/lib/works-orders";
import type { WorksOrder } from "@/lib/works-orders";
import type { BankDetails } from "@/lib/bank";
import { openAccount, sealAccount } from "@/lib/bank-vault";

/**
 * Where an invoice is to be paid (Stuart Roper, 26 Oct 2026: "I've uploaded
 * an invoice, but there's nowhere to put the contractor's bank details").
 *
 * The details given with the invoice are kept on the job, so the payment
 * goes where that invoice said even if the contractor's record changes
 * later. An invoice that came in another way (the contractor's own link, Log
 * the invoice on the job) has none of its own, and the contractor's record is
 * used. Paid back to an agent who paid out of their own pocket, there is no
 * contractor account to give at all.
 */

export async function setOrderBank(orderId: string, bank: BankDetails | null): Promise<void> {
  await q(
    `UPDATE os_works_orders SET invoice_bank_name = $2, invoice_bank_sort = $3, invoice_bank_account = $4 WHERE id = $1`,
    [orderId, bank?.accountName ?? "", bank?.sortCode ?? "", sealAccount(bank?.accountNumber ?? "")]
  );
}

/** The bank details accounts pay this invoice to, whole, or null when there are none. */
export async function bankForInvoice(o: WorksOrder): Promise<(BankDetails & { from: "invoice" | "record" }) | null> {
  if (!hasDb() || o.payee === "agent") return null;
  const [r] = await q<{ invoice_bank_name: string; invoice_bank_sort: string; invoice_bank_account: string }>(
    `SELECT invoice_bank_name, invoice_bank_sort, invoice_bank_account FROM os_works_orders WHERE id = $1`,
    [o.id]
  ).catch(() => []);
  const own = openAccount(r?.invoice_bank_account);
  if (r && own) return { accountName: r.invoice_bank_name, sortCode: r.invoice_bank_sort, accountNumber: own, from: "invoice" };
  const held = o.contractorId ? await contractorBank(o.contractorId).catch(() => null) : null;
  return held ? { ...held, from: "record" } : null;
}
