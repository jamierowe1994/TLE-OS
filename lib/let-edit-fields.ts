/**
 * THE FIGURES ON A LET THAT AN AGENT CAN PUT RIGHT (James, 1 Nov 2026).
 *
 * "About 40% of the tickets are I can't change this field, or the details
 * didn't pull through." Lianna, 12 South Chesters View (ticket b51f4b39):
 * "I have amended move in date and deposit but it's not saving. Should be
 * 10th November and deposit of 1542."
 *
 * Each of these is shown on the let from the application or the Propoly deal,
 * and can now be changed on the let itself with Edit. What is saved is the
 * OS's own value (lib/let-edits), read in preference everywhere the let's
 * figures are shown. Nothing is ever written back to the application's old
 * home or to Propoly - Propoly can't take a change to a deal anyway - so where
 * Propoly holds something different the let says so.
 *
 * Shared by the page and the server: no server-only imports here.
 */

export const LET_FIELDS = ["moveIn", "deposit", "rent", "holdingFee", "termMonths"] as const;
export type LetField = (typeof LET_FIELDS)[number];

export const LET_FIELD_LABEL: Record<LetField, string> = {
  moveIn: "Move-in",
  deposit: "Deposit",
  rent: "Rent",
  holdingFee: "Holding fee",
  termMonths: "Tenancy length",
};

/** How the field is typed and read: a date, pounds, or a count of months. */
export const LET_FIELD_KIND: Record<LetField, "date" | "money" | "months"> = {
  moveIn: "date",
  deposit: "money",
  rent: "money",
  holdingFee: "money",
  termMonths: "months",
};

export const isLetField = (v: unknown): v is LetField => typeof v === "string" && (LET_FIELDS as readonly string[]).includes(v);

/** One field as the OS now holds it. `value` null: put back to what the let was read from. */
export interface LetEditNow {
  value: string | null;
  by: string;
  at: string;
}

/** A change, for the record's history. */
export interface LetEditEvent {
  id: string;
  field: string;
  value: string | null;
  was: string | null;
  by: string;
  at: string;
}

/**
 * A value as stored: "2026-11-10" for a date, "1542" or "1542.50" for pounds,
 * "12" for months. Null for an empty box. `false` when it can't be read.
 */
export function cleanLetValue(field: LetField, raw: unknown): string | null | false {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/^£/, "").replace(/,/g, "");
  if (!s) return null;
  const kind = LET_FIELD_KIND[field];
  if (kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== s ? false : s;
  }
  if (kind === "months") {
    if (!/^\d{1,3}$/.test(s)) return false;
    const n = Number(s);
    return n >= 1 && n <= 120 ? String(n) : false;
  }
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return false;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return false;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** What was wrong with a box, in words for the agent. */
export function letValueProblem(field: LetField): string {
  const kind = LET_FIELD_KIND[field];
  if (kind === "date") return "That move-in date doesn't look right.";
  if (kind === "months") return "The tenancy length is a number of months, 1 to 120.";
  return `The ${LET_FIELD_LABEL[field].toLowerCase()} is an amount in pounds, like 1542.`;
}

/** The same value from either side, for "does Propoly still have something else?". */
export function sameLetValue(field: LetField, a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const norm = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return null;
    if (LET_FIELD_KIND[field] === "date") return String(v).slice(0, 10);
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  };
  return norm(a) === norm(b);
}

/** A stored value as a number (pounds or months), or null. */
export const letNumber = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "10 Nov 2026", "£1,542", "12 months": how a stored value reads. */
export function sayLetValue(field: LetField, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "nothing";
  const kind = LET_FIELD_KIND[field];
  if (kind === "date") {
    const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.valueOf()) ? String(v) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (kind === "months") return `${n} ${n === 1 ? "month" : "months"}`;
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** A tenant's details changed on the let, in the same history (lib/let-people keys). */
export const tenantField = (key: string, part: "name" | "email" | "phone") => `tenant:${key}:${part}`;
