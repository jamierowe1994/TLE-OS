/**
 * EVERY ADULT ON AN OFFER, NOT ONLY THE LEAD (James, 14 Oct 2026).
 *
 * "When we have two tenants, when they put through the offer, we don't
 * capture the details of the other tenant ... We need all the same info we
 * got on the first one, we need it for the second tenant." Howard reported it
 * on 8 Oct from Put an Offer Forward: two adults moving in, the second gave
 * no name, email, work or income, so they never reached the application or
 * Propoly, and the affordability figure was the lead's alone.
 *
 * Each other adult is asked what the lead is asked at offer stage, plus who
 * they are. The lead (or the agent) fills it in for them, or sends them their
 * own link to fill in themselves (lib/offer-people). Client-safe: the offer
 * sheet, the agent's recorder, the person's own page and the server all read
 * this one list.
 */

export type PersonAnswers = {
  name: string;
  email: string;
  mobile: string;
  dob: string;
  applicantType: string;
  workHours: string;
  zeroHours: boolean | null;
  onProbation: boolean | null;
  tradingFor: string;
  job: string;
  employer: string;
  annualIncome: string;
  hasBritishPassport: boolean | null;
  shareCode: string;
  landlordRef: boolean | null;
  guarantor: boolean | null;
  adverseCredit: boolean | null;
  adverseCreditNote: string;
  smoker: boolean | null;
};

/** How an adult's part gets done: now, by whoever is making the offer, or by them from a link. */
export type PersonMode = "fill" | "link";

/** One extra adult as the offer sheet or the recorder sends them. */
export type OtherAdult = { mode: PersonMode; answers: PersonAnswers };

export const emptyPerson = (name = ""): PersonAnswers => ({
  name,
  email: "",
  mobile: "",
  dob: "",
  applicantType: "",
  workHours: "",
  zeroHours: null,
  onProbation: null,
  tradingFor: "",
  job: "",
  employer: "",
  annualIncome: "",
  hasBritishPassport: null,
  shareCode: "",
  landlordRef: null,
  guarantor: null,
  adverseCredit: null,
  adverseCreditNote: "",
  smoker: null,
});

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const employedType = (t: string) => t === "Employed";
export const tradingType = (t: string) => t === "Self-employed" || t === "Company director";
export const incomeOf = (p: Pick<PersonAnswers, "annualIncome">) => Number(String(p.annualIncome).replace(/[£,\s]/g, "")) || 0;

/** What a filled-in part still needs, in the person's own words. Empty = done. */
export function missingFrom(p: PersonAnswers): string[] {
  const out: string[] = [];
  const words = p.name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) out.push("their full name");
  if (!EMAIL_RE.test(p.email.trim())) out.push("an email address");
  if (p.mobile.replace(/\D/g, "").length < 10) out.push("a mobile number");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) out.push("their date of birth");
  if (!p.applicantType) out.push("whether they work");
  if (employedType(p.applicantType)) {
    if (!p.workHours) out.push("full or part-time");
    if (p.zeroHours === null) out.push("whether it's a zero-hours contract");
    if (p.onProbation === null) out.push("whether they're on probation");
  }
  if (tradingType(p.applicantType) && !p.tradingFor) out.push("how long they've traded");
  if (!incomeOf(p) && (employedType(p.applicantType) || tradingType(p.applicantType))) out.push("their income");
  if (p.hasBritishPassport === null) out.push("right to rent");
  if (p.hasBritishPassport === false && p.shareCode.trim().length < 6) out.push("their share code");
  if (p.landlordRef === null) out.push("a landlord reference");
  if (p.guarantor === null) out.push("a guarantor");
  if (p.adverseCredit === null) out.push("adverse credit");
  if (p.smoker === null) out.push("whether they smoke");
  return out;
}

/** What only the link needs: who it is for. */
export function missingForLink(p: PersonAnswers): string[] {
  return p.name.trim().split(/\s+/).filter(Boolean).length < 2 ? ["their full name"] : [];
}

/** Anything sent in, made safe and the right shape. */
export function cleanPerson(raw: unknown): PersonAnswers {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string, n = 120) => (typeof r[k] === "string" ? (r[k] as string).trim().slice(0, n) : "");
  const b = (k: string) => (typeof r[k] === "boolean" ? (r[k] as boolean) : null);
  return {
    name: s("name"),
    email: s("email", 200).toLowerCase(),
    mobile: s("mobile", 40),
    dob: /^\d{4}-\d{2}-\d{2}$/.test(s("dob", 10)) ? s("dob", 10) : "",
    applicantType: s("applicantType", 40),
    workHours: s("workHours", 20),
    zeroHours: b("zeroHours"),
    onProbation: b("onProbation"),
    tradingFor: s("tradingFor", 30),
    job: s("job"),
    employer: s("employer"),
    annualIncome: s("annualIncome", 20).replace(/[^\d.]/g, ""),
    hasBritishPassport: b("hasBritishPassport"),
    shareCode: s("shareCode", 20).toUpperCase(),
    landlordRef: b("landlordRef"),
    guarantor: b("guarantor"),
    adverseCredit: b("adverseCredit"),
    adverseCreditNote: s("adverseCreditNote", 300),
    smoker: b("smoker"),
  };
}

/** One other adult on an offer, as the agent's screens show them. */
export type OfferPart = { name: string; filled: boolean; by: string | null; lines: { label: string; value: string }[]; link: string };

/** The lines the agent reads, the same everywhere. */
export function personLines(p: PersonAnswers): { label: string; value: string }[] {
  const yn = (v: boolean | null) => (v === null ? "Not said" : v ? "Yes" : "No");
  const inc = incomeOf(p);
  return [
    { label: "Email", value: p.email || "Not said" },
    { label: "Mobile", value: p.mobile || "Not said" },
    { label: "Date of birth", value: p.dob ? new Date(`${p.dob}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not said" },
    { label: "Working", value: [p.applicantType || "Not said", employedType(p.applicantType) ? p.workHours : "", tradingType(p.applicantType) && p.tradingFor ? `trading ${p.tradingFor.toLowerCase()}` : ""].filter(Boolean).join(", ") },
    ...(p.job || p.employer ? [{ label: "Job", value: [p.job, p.employer].filter(Boolean).join(" at ") }] : []),
    ...(employedType(p.applicantType) ? [{ label: "Zero-hours contract", value: yn(p.zeroHours) }, { label: "On probation", value: yn(p.onProbation) }] : []),
    { label: "Income", value: inc ? `£${inc.toLocaleString("en-GB")} a year` : "Not said" },
    { label: "Right to rent", value: p.hasBritishPassport ? "British or Irish passport" : p.shareCode ? `Share code ${p.shareCode}` : "Not given yet" },
    { label: "Landlord reference", value: yn(p.landlordRef) },
    { label: "Guarantor", value: yn(p.guarantor) },
    { label: "Adverse credit", value: p.adverseCredit ? `Yes${p.adverseCreditNote ? `: ${p.adverseCreditNote}` : ""}` : yn(p.adverseCredit) },
    { label: "Smoker", value: yn(p.smoker) },
  ];
}
