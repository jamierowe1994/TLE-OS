/* A tenant's passport answers, grouped the way an agent reads a file: shared by
   the list (PassportAnswers) and the new-look stage (PassportStage). */
import { isEmployed, isTrading, otherAdultCount, otherCredit, otherName, type PassportData, type PassportRules } from "@/lib/passport-shape";

export type SentIn = { id: string; kind: string; name: string; r2Key: string; uploadedAt: string };
/** One of the agent's own questions on the passport, and the tenant's answer (null when not answered). */
export type CustomAnswer = { label: string; value: string | null };
export type Answer = { ok?: boolean; error?: string; name?: string; email?: string; submittedAt?: string | null; updatedAt?: string; householdIncome?: number | null; data?: PassportData; rules?: PassportRules; documents?: SentIn[]; custom?: CustomAnswer[] };

const yn = (b: boolean | null | undefined) => (b == null ? null : b ? "Yes" : "No");
const money = (s: string | number | null | undefined) => {
  const n = Number(String(s ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? `£${Math.round(n).toLocaleString("en-GB")}` : null;
};
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const dob = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : s || null);
const month = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? new Date(`${s}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : s || null);

export function groups(d: PassportData, household: number | null, rules: PassportRules, custom: CustomAnswer[] = []): { title: string; rows: [string, string | null][] }[] {
  /* Each adult's credit under their own name (Rhiannon, 14 Oct 2026). A
     passport from before the others were asked shows "Not answered". */
  const others = otherAdultCount(d);
  const leadFirst = d.legalName.trim().split(/\s+/)[0] || "lead tenant";
  const othersCredit: [string, string | null][] = Array.from({ length: others }, (_, k) => {
    const c = otherCredit(d, k);
    return [`Adverse credit, ${otherName(d, k) || `adult ${k + 2}`}`, c.credit ? `Yes${c.note.trim() ? `: ${c.note.trim()}` : ""}` : yn(c.credit)];
  });
  return [
    {
      title: "Who they are",
      rows: [
        ["Legal name", d.legalName || null],
        ["Known as", d.knownAs || null],
        ["Date of birth", dob(d.dob)],
        /* Never on a Scottish passport (Lianna Denholm, 15 Oct 2026). */
        ...(rules.noNationality ? [] : ([["Nationality", d.nationality || null]] as [string, string | null][])),
        ["Email", d.email || null],
        ["Mobile", d.mobile || null],
      ],
    },
    /* England only: never on a Scottish passport (James, 15 Oct 2026). */
    ...(rules.noRightToRent
      ? []
      : [
          {
            title: "Right to rent",
            rows: [
              ["British or Irish passport", yn(d.hasBritishPassport)],
              ...(d.hasBritishPassport === false ? ([["Share code", d.shareCode || null]] as [string, string | null][]) : []),
            ] as [string, string | null][],
          },
        ]),
    {
      title: "Work and money",
      rows: [
        ["What they do", d.applicantType || null],
        /* Only the questions the passport asked them, by what they do. */
        ...(isEmployed(d)
          ? ([
              ["Hours", d.workHours || null],
              ["Zero-hours contract", yn(d.zeroHours)],
              ["On probation", yn(d.onProbation)],
            ] as [string, string | null][])
          : []),
        ...(isTrading(d) ? ([["Trading for", d.tradingFor || null]] as [string, string | null][]) : []),
        ["Their income, a year", money(d.annualIncome)],
        ["Household income, a year", money(household)],
        ["Savings", money(d.savings)],
      ],
    },
    {
      title: "Who is moving in",
      rows: [
        ["Adults", d.numAdults || null],
        ["Children", d.numChildren || null],
        ["Other adults' incomes", d.coOccupantIncomes || null],
      ],
    },
    {
      title: "Where they live now",
      rows: [
        ["Current address", d.currentAddress || null],
        ["Moved in", month(d.movedIn)],
        ["Three years there", yn(d.livedThreeYears)],
        ...(d.livedThreeYears === false ? ([["Previous address", d.previousAddress || null]] as [string, string | null][]) : []),
        ["Rented in the last 12 months", yn(d.rentedLast12Months)],
        ["Rent paid on time", yn(d.rentOnTime)],
        ["Landlord reference", yn(d.landlordRef)],
      ],
    },
    {
      title: "Everything else",
      rows: [
        [others ? `Adverse credit, ${leadFirst}` : "Adverse credit", yn(d.adverseCredit)],
        ...(d.adverseCredit ? ([["About it", d.adverseCreditNote || null]] as [string, string | null][]) : []),
        ...othersCredit,
        ["Guarantor available", yn(d.guarantor)],
        ["Pets", d.pets ? d.petsNote || "Yes" : yn(d.pets)],
        ["Smoker", yn(d.smoker)],
      ],
    },
    /* The agent's own questions (29 Oct 2026), after everything the passport always asks. */
    ...(custom.length ? [{ title: "Extra questions", rows: custom.map((c) => [c.label, c.value] as [string, string | null]) }] : []),
  ];
}
