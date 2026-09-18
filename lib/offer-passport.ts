import type { PassportData } from "@/lib/passport-shape";

/**
 * The passport answers an offer can change, and how each one reads (James,
 * 18 Sep 2026). A tenant may have rushed their passport, or life moved on -
 * a partner moving in, a guarantor found - so the offer sheet lets them put
 * it right, and the passport is updated with it.
 *
 * What changed is kept against the offer with the ORIGINAL answer, and only
 * the agent sees it: an asterisk, the answer they had before, and an eye
 * beside anything worth a second look - adverse credit that disappears just
 * before an offer is the example James gave. The tenant sees none of that.
 *
 * Pure, so the sheet, the route, the agent's email and the agent's page all
 * read one list.
 */

export type OfferFieldKey =
  | "applicantType" | "annualIncome" | "hasBritishPassport" | "shareCode" | "landlordRef"
  | "guarantor" | "adverseCredit" | "adverseCreditNote" | "smoker" | "numAdults" | "numChildren" | "pets" | "petsNote";

export type OfferPassport = Pick<PassportData, OfferFieldKey>;

export const OFFER_FIELDS: { key: OfferFieldKey; label: string }[] = [
  { key: "applicantType", label: "Working" },
  { key: "annualIncome", label: "Income" },
  { key: "hasBritishPassport", label: "British or Irish passport" },
  { key: "shareCode", label: "Share code" },
  { key: "landlordRef", label: "Landlord reference" },
  { key: "guarantor", label: "Guarantor" },
  { key: "adverseCredit", label: "Adverse credit" },
  { key: "adverseCreditNote", label: "About the credit" },
  { key: "smoker", label: "Smoker" },
  { key: "numAdults", label: "Adults moving in" },
  { key: "numChildren", label: "Children moving in" },
  { key: "pets", label: "Pets" },
  { key: "petsNote", label: "About the pets" },
];

export const labelOf = (k: string) => OFFER_FIELDS.find((f) => f.key === k)?.label ?? k;

export function offerSubset(d: Partial<PassportData> | null | undefined): OfferPassport {
  return {
    applicantType: d?.applicantType ?? "",
    annualIncome: d?.annualIncome ?? "",
    hasBritishPassport: d?.hasBritishPassport ?? null,
    shareCode: d?.shareCode ?? "",
    landlordRef: d?.landlordRef ?? null,
    guarantor: d?.guarantor ?? null,
    adverseCredit: d?.adverseCredit ?? null,
    adverseCreditNote: d?.adverseCreditNote ?? "",
    smoker: d?.smoker ?? null,
    numAdults: d?.numAdults ?? "",
    numChildren: d?.numChildren ?? "",
    pets: d?.pets ?? null,
    petsNote: d?.petsNote ?? "",
  };
}

/** One answer as a person reads it. */
export function show(k: OfferFieldKey, v: unknown): string {
  if (v === null || v === undefined || v === "") return "Not said";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (k === "annualIncome") {
    const n = Number(String(v).replace(/[£,\s]/g, ""));
    return n ? `£${n.toLocaleString("en-GB")} a year` : String(v);
  }
  return String(v);
}

export type OfferChange = { key: OfferFieldKey; label: string; from: string; to: string; watch: boolean };

/**
 * Worth a second look: a change that makes the application look better on
 * the one thing referencing will test anyway. Adverse credit or smoking
 * going from yes to no, a guarantor or landlord reference appearing, income
 * jumping by more than a fifth. Not an accusation - an eye, for the agent.
 */
function watched(k: OfferFieldKey, from: unknown, to: unknown): boolean {
  if (k === "adverseCredit" || k === "smoker") return from === true && to === false;
  if (k === "guarantor" || k === "landlordRef") return from === false && to === true;
  if (k === "annualIncome") {
    const a = Number(String(from ?? "").replace(/[£,\s]/g, ""));
    const b = Number(String(to ?? "").replace(/[£,\s]/g, ""));
    return a > 0 && b > a * 1.2;
  }
  return false;
}

const same = (a: unknown, b: unknown) => String(a ?? "").trim() === String(b ?? "").trim();

/** What differs between the passport as it was and as they sent it. */
export function diffOffer(before: OfferPassport, after: OfferPassport): OfferChange[] {
  return OFFER_FIELDS.filter((f) => !same(before[f.key], after[f.key])).map((f) => ({
    key: f.key,
    label: f.label,
    from: show(f.key, before[f.key]),
    to: show(f.key, after[f.key]),
    watch: watched(f.key, before[f.key], after[f.key]),
  }));
}
