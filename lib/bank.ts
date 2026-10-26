/**
 * UK bank details, read lightly (Stuart Roper, 26 Oct 2026: a contractor's
 * invoice came in and there was nowhere to put where to pay them).
 *
 * A sort code is six digits and an account number eight, however they are
 * typed ("12-34-56", "12 34 56"). Nothing here checks the account exists:
 * accounts key the payment and their bank does that. Shared by the forms and
 * the server, so both say the same thing about the same typing.
 *
 * The account number is shown whole only where it is being edited, and in
 * the email to accounts who pay it. Anywhere it is listed it is the last four.
 */

export interface BankDetails {
  accountName: string;
  /** Six digits, no dashes. */
  sortCode: string;
  /** Eight digits. */
  accountNumber: string;
}

export const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D+/g, "");

/** "123456" → "12-34-56". Anything that isn't six digits comes back as typed. */
export function sortCodeWords(v: string | null | undefined): string {
  const d = digits(v);
  return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : String(v ?? "").trim();
}

/** "12345678" → "ending 5678". */
export function maskedAccount(last4: string | null | undefined): string {
  const d = digits(last4).slice(-4);
  return d ? `ending ${d}` : "";
}

/**
 * The three boxes as typed, tidied and checked. All three blank is fine (no
 * details); some but not all is not, since a payment needs every one.
 */
export function readBank(input: { accountName?: string | null; sortCode?: string | null; accountNumber?: string | null }): { ok: true; bank: BankDetails | null } | { ok: false; error: string } {
  const accountName = String(input.accountName ?? "").trim().replace(/\s+/g, " ");
  const sortCode = digits(input.sortCode);
  const accountNumber = digits(input.accountNumber);
  const typedSort = String(input.sortCode ?? "").trim();
  const typedAcct = String(input.accountNumber ?? "").trim();
  if (!accountName && !typedSort && !typedAcct) return { ok: true, bank: null };
  if (typedSort && sortCode.length !== 6) return { ok: false, error: "The sort code should be six digits, like 12-34-56." };
  if (typedAcct && accountNumber.length !== 8) return { ok: false, error: "The account number should be eight digits." };
  if (!accountName) return { ok: false, error: "Add the name on the bank account too." };
  if (!sortCode) return { ok: false, error: "Add the sort code too." };
  if (!accountNumber) return { ok: false, error: "Add the account number too." };
  if (accountName.length > 70) return { ok: false, error: "The account name is too long." };
  return { ok: true, bank: { accountName, sortCode, accountNumber } };
}

/** One line for a list or a timeline: never the whole account number. */
export function bankLine(b: { accountName?: string; sortCode?: string; accountLast4?: string } | null | undefined): string {
  if (!b || (!b.accountName && !b.sortCode && !b.accountLast4)) return "";
  return [b.accountName, b.sortCode ? `sort code ${sortCodeWords(b.sortCode)}` : "", b.accountLast4 ? `account ${maskedAccount(b.accountLast4)}` : ""].filter(Boolean).join(", ");
}
