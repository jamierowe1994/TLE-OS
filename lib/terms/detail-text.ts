import type { DetailField, LandlordDetails, TermsDoc } from "@/lib/terms/types";

/**
 * One landlord detail as the contract prints it, shared by the page they read
 * (components/terms/TermsPaper), the HTML DocuSeal seals (lib/terms/render-
 * html) and the boxes DocuSeal fills (lib/terms/flow), so all three say the
 * same thing. A yes or no is printed as the contract words it ("Ticked -
 * there is no gas at the property"); a date as "12 March 2027". `mask`: the
 * account number as its last four, for anything a browser shows.
 */
export function detailText(f: DetailField | undefined, value: string, opts: { mask?: boolean } = {}): string {
  const v = value.trim();
  if (!v) return "";
  if (f?.kind === "yesno") return v === "yes" ? f.printYes ?? "Yes" : v === "no" ? f.printNo ?? "No" : "";
  if (f?.kind === "date") return longDay(v);
  if (f?.key === "accountNumber" && opts.mask) return `•••• ${v.replace(/\s/g, "").slice(-4)}`;
  return v;
}

/** "2027-03-12" as "12 March 2027"; anything else as it is. */
export function longDay(ymd: string): string {
  const t = new Date(`${ymd}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : ymd;
}

/** The fields one block prints, for one landlord: a first-only block prints for the first landlord only. */
export const printsFor = (b: { first?: boolean }, i: number) => !b.first || i === 0;

/** Every detail this edition prints for landlord i (0-based), in print order. */
export function printedFor(doc: TermsDoc, i: number): Array<keyof LandlordDetails> {
  const out: Array<keyof LandlordDetails> = [];
  for (const s of doc.sections) for (const b of s.blocks) if (b.kind === "landlords" && printsFor(b, i)) out.push(...b.fields);
  return out;
}

/** The details landlord i is asked for: first-only ones for the first landlord alone, and never one that follows an answer. */
export function askedOf(doc: TermsDoc, i: number): DetailField[] {
  return doc.details.filter((f) => (!f.firstOnly || i === 0) && !f.fromAnswer);
}
