import "server-only";
import { hasDb, q } from "@/lib/db";
import { openAccount, sealAccount } from "@/lib/bank-vault";
import { record } from "@/lib/audit";

/**
 * A LANDLORD'S BANK ACCOUNT, KEPT (James, 5 Nov 2026: "we need to be able to
 * save their account details because it's going to be really, really
 * important").
 *
 * Given on their Terms of Business (November 2026 on), where it is printed on
 * the signed copy. Kept here too, one row a landlord by email, so their next
 * contract offers it back ("the account ending 1234?") rather than asking
 * again. The account number is sealed (lib/bank-vault) and never leaves the
 * server except into the contract DocuSeal seals; screens get the last four.
 * Every change is in the audit, masked. Never written to PayProp or REX.
 */

export interface BankOnFile {
  bankName: string;
  accountName: string;
  sortCode: string;
  last4: string;
  updatedAt: string;
}

const key = (email: string) => email.trim().toLowerCase();

export async function bankOnFile(email: string): Promise<BankOnFile | null> {
  if (!hasDb() || !key(email)) return null;
  const rows = await q<{ bank_name: string; account_name: string; sort_code: string; account_last4: string; updated_at: Date }>(
    `SELECT bank_name, account_name, sort_code, account_last4, updated_at FROM os_landlord_bank WHERE email = $1`,
    [key(email)]
  ).catch(() => []);
  const r = rows[0];
  return r && r.account_last4 ? { bankName: r.bank_name, accountName: r.account_name, sortCode: r.sort_code, last4: r.account_last4, updatedAt: new Date(r.updated_at).toISOString() } : null;
}

/** The whole account number, for the contract alone. Empty when there is none. */
export async function accountNumberOnFile(email: string): Promise<string> {
  if (!hasDb() || !key(email)) return "";
  const rows = await q<{ account_number: string }>(`SELECT account_number FROM os_landlord_bank WHERE email = $1`, [key(email)]).catch(() => []);
  return openAccount(rows[0]?.account_number ?? "");
}

export async function keepBank(p: { email: string; name: string; bankName: string; accountName: string; sortCode: string; accountNumber: string; termsId: string }): Promise<void> {
  if (!hasDb() || !key(p.email) || !p.accountNumber) return;
  const before = await bankOnFile(p.email);
  const last4 = p.accountNumber.replace(/\s/g, "").slice(-4);
  await q(
    `INSERT INTO os_landlord_bank (email, name, bank_name, account_name, sort_code, account_number, account_last4, terms_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, bank_name = EXCLUDED.bank_name, account_name = EXCLUDED.account_name,
       sort_code = EXCLUDED.sort_code, account_number = EXCLUDED.account_number, account_last4 = EXCLUDED.account_last4,
       terms_id = EXCLUDED.terms_id, updated_at = NOW()`,
    [key(p.email), p.name, p.bankName, p.accountName, p.sortCode, sealAccount(p.accountNumber.replace(/\s/g, "")), last4, p.termsId]
  );
  const same = before && before.sortCode === p.sortCode && before.last4 === last4 && before.accountName === p.accountName;
  if (!same) {
    await record({
      kind: "bank_details_changed",
      actorId: null,
      actorEmail: key(p.email),
      subjectId: `landlord:${key(p.email)}`,
      /* Not "Changed on ...": that prefix is the contractors' fraud flag in the owners' bell (lib/bank-vault recentBankChanges). */
      detail: `Landlord account ${before ? "changed" : "added"}: ${p.name} (terms ${p.termsId}): ${before ? `${before.sortCode} •••• ${before.last4}` : "none"} -> ${p.sortCode} •••• ${last4}`,
      ip: "",
    }).catch(() => undefined);
  }
}
