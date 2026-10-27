import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { record } from "@/lib/audit";
import { bankLine, type BankDetails } from "@/lib/bank";

/**
 * BANK DETAILS, KEPT SAFE (James, 26 Oct 2026).
 *
 * "Add bank details to the system so we can get that paid ... make sure you
 * mask them ... what I don't want to do is force people to do other things."
 * UK GDPR asks for appropriate security over a person's bank details (a
 * contractor is often a sole trader), so, without a single extra step for
 * the person typing them:
 *
 *   sealed     the account number is stored encrypted (AES-256-GCM, its own
 *              key off AUTH_SECRET, like the mailbox tokens in lib/microsoft),
 *              never as the digits. A value from before this (plain digits)
 *              still reads, and scripts/seal-bank-details seals them.
 *   masked     it never goes to a browser: every screen has the last four,
 *              and a form only changes it when somebody types a new one. The
 *              whole number goes to the accounts inbox, who pay it.
 *   logged     every change to a contractor's details is in the audit, who
 *              and when, masked.
 *   checked    a change to details a contractor already had is the classic
 *              fraud ("we've changed banks"), so it is flagged to owners and
 *              on the invoice email to accounts: ring them on a number you
 *              already had before paying. Nobody is stopped.
 */

const PREFIX = "v1:";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set: refusing to store bank details without it.");
  return scryptSync(secret, "os-bank-details", 32);
}

/** The account number as stored. Empty stays empty. */
export function sealAccount(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

/** The account number back. A value from before sealing (plain digits) is returned as it is; one that won't open is empty. */
export function openAccount(stored: string | null | undefined): string {
  const v = String(stored ?? "");
  if (!v.startsWith(PREFIX)) return v;
  try {
    const [iv, tag, enc] = v.slice(PREFIX.length).split(".");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export const isSealed = (stored: string | null | undefined) => String(stored ?? "").startsWith(PREFIX);

const masked = (b: BankDetails | null) => (b ? bankLine({ accountName: b.accountName, sortCode: b.sortCode, accountLast4: b.accountNumber.slice(-4) }) : "none");
const same = (a: BankDetails | null, b: BankDetails | null) =>
  (!a && !b) || Boolean(a && b && a.accountName === b.accountName && a.sortCode === b.sortCode && a.accountNumber === b.accountNumber);

/**
 * A contractor's details changed: into the audit, masked. `replaced` when
 * they already had details and these are different ones: that is the change
 * owners are told about.
 */
export async function noteBankChange(p: {
  contractorId: string; contractorName: string; before: BankDetails | null; after: BankDetails | null;
  by: { id?: string | null; email: string }; via: string;
}): Promise<void> {
  if (same(p.before, p.after)) return;
  const replaced = Boolean(p.before && p.after);
  await record({
    kind: "bank_details_changed",
    actorId: p.by.id ?? null,
    actorEmail: p.by.email,
    subjectId: p.contractorId,
    detail: `${replaced ? "Changed" : p.after ? "Added" : "Removed"} on ${p.contractorName} (${p.via}): ${masked(p.before)} -> ${masked(p.after)}`,
    ip: "",
  }).catch(() => undefined);
}

export interface BankChange { contractorId: string; contractorName: string; by: string; at: string; detail: string }

/** Contractors whose existing details were replaced in the last `days`, newest first. */
export async function recentBankChanges(days = 30, contractorId?: string): Promise<BankChange[]> {
  if (!hasDb()) return [];
  const rows = await q<{ subject_id: string; actor_email: string; at: Date; detail: string }>(
    `SELECT subject_id, actor_email, at, detail FROM os_audit
      WHERE kind = 'bank_details_changed' AND detail LIKE 'Changed on %' AND at > NOW() - ($1::int * INTERVAL '1 day')
        ${contractorId ? "AND subject_id = $2" : ""}
      ORDER BY at DESC LIMIT 50`,
    contractorId ? [days, contractorId] : [days]
  ).catch(() => []);
  return rows.map((r) => ({
    contractorId: r.subject_id,
    contractorName: r.detail.replace(/^Changed on (.*?) \(.*$/, "$1"),
    by: r.actor_email,
    at: new Date(r.at).toISOString(),
    detail: r.detail,
  }));
}

/**
 * Seals every account number still stored as plain digits: contractors' and
 * invoices' own. Run once after this went live; safe to run again (a sealed
 * value is left as it is). Returns how many were sealed.
 */
export async function sealExistingBankDetails(): Promise<{ contractors: number; invoices: number }> {
  if (!hasDb()) return { contractors: 0, invoices: 0 };
  let contractors = 0, invoices = 0;
  for (const r of await q<{ id: string; bank_account_number: string }>(`SELECT id, bank_account_number FROM os_contractors WHERE bank_account_number <> '' AND bank_account_number NOT LIKE 'v1:%'`)) {
    contractors += (await q(`UPDATE os_contractors SET bank_account_number = $2 WHERE id = $1 AND bank_account_number = $3 RETURNING id`, [r.id, sealAccount(r.bank_account_number), r.bank_account_number])).length;
  }
  for (const r of await q<{ id: string; invoice_bank_account: string }>(`SELECT id, invoice_bank_account FROM os_works_orders WHERE invoice_bank_account <> '' AND invoice_bank_account NOT LIKE 'v1:%'`)) {
    invoices += (await q(`UPDATE os_works_orders SET invoice_bank_account = $2 WHERE id = $1 AND invoice_bank_account = $3 RETURNING id`, [r.id, sealAccount(r.invoice_bank_account), r.invoice_bank_account])).length;
  }
  return { contractors, invoices };
}
