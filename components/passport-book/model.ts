import {
  isEmployed,
  isTrading,
  money,
  otherAdultCount,
  otherCredit,
  otherName,
  type PassportData,
  type PassportRules,
} from "@/lib/passport-shape";
import type { PassportQuestion } from "@/components/PassportForm";

/**
 * The passport book's steps and what each one needs (James's design, 24 Oct
 * 2026). Seven steps, each but the first earning a stamp; in Scotland the
 * Right to rent step and its stamp go (lib/passport-scotland), so six.
 *
 * Every question today's passport asks is asked here too, with the same keys
 * and the same formats, folded into the step it belongs to. What each step
 * needs is a superset of the server's own test (passportComplete), so a book
 * that reaches its last page can always be finished.
 */

export type StepId = "you" | "reach" | "move" | "work" | "rtr" | "history" | "sign";

export type Stamp = { label: string; color: string; rot: number; sq: boolean };

export type StepDef = {
  id: StepId;
  name: string;
  stamp?: Stamp;
  /** The headline, in two halves: the second is drawn faint. */
  lead: string;
  faint: string;
  lede: string;
};

export const STEPS: StepDef[] = [
  { id: "you", name: "Who you are", lead: "Let’s get to", faint: "know you.", lede: "Your legal name as it appears on your ID, so referencing matches first time." },
  { id: "reach", name: "Getting in touch", stamp: { label: "Contact", color: "var(--sage)", rot: -8, sq: false }, lead: "How can we", faint: "reach you?", lede: "We’ll use these to book viewings and send you updates. Nothing else." },
  { id: "move", name: "Your move", stamp: { label: "Moving", color: "var(--clay)", rot: 6, sq: true }, lead: "Tell us about", faint: "your move.", lede: "So we only show you homes that work for you." },
  { id: "work", name: "Work and income", stamp: { label: "Income", color: "#3f4f37", rot: -4, sq: true }, lead: "What you", faint: "do for work.", lede: "Landlords ask about income first. A rough figure is fine for now; we check it properly later." },
  { id: "rtr", name: "Right to rent", stamp: { label: "Right to rent", color: "var(--ink)", rot: 9, sq: false }, lead: "Your right to", faint: "rent in the UK.", lede: "Landlords in England have to check this by law, and we check it for every home. For now we just need to know which documents you have." },
  { id: "history", name: "Where you live now", stamp: { label: "History", color: "var(--clay)", rot: -10, sq: true }, lead: "Where you’re", faint: "living now.", lede: "Your current landlord is usually our first reference." },
  { id: "sign", name: "Check and sign", stamp: { label: "Signed", color: "var(--sage)", rot: 4, sq: false }, lead: "Check it,", faint: "then sign.", lede: "Have a quick look. You can change anything before you sign." },
];

/** The steps this passport has: no Right to rent in Scotland. */
export const stepsFor = (rules: PassportRules): StepDef[] => (rules.noRightToRent ? STEPS.filter((s) => s.id !== "rtr") : STEPS);

/* ── What is asked, and when it counts as answered ─────────────────────── */

export const HOW_LONG = ["Under 6 months", "6 to 12 months", "1 to 3 years", "Over 3 years"] as const;

/** Whole months from a "YYYY-MM" to now. */
export function monthsSince(ym: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2])));
}

/** The "how long" chip a move-in month falls in. */
export function howLongFor(months: number): (typeof HOW_LONG)[number] {
  return months < 6 ? "Under 6 months" : months < 12 ? "6 to 12 months" : months < 36 ? "1 to 3 years" : "Over 3 years";
}

export const okEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const okMobile = (v: string) => {
  const digits = v.replace(/\D/g, "");
  return /^\+?[\d\s()-]+$/.test(v.trim()) && digits.length >= 10 && digits.length <= 15;
};

/** Answers held on the screen rather than in the passport: which chip is lit while a choice is half made. */
export type Ui = { howlong: string; rtrPick: string; petPick: string };

export type Ctx = {
  d: PassportData;
  rules: PassportRules;
  questions: PassportQuestion[];
  answers: Record<string, string>;
  ui: Ui;
};

type Check = { key: string; ok: boolean };

/** Every required answer on a step, and whether it is in. Keys match the data-q on the screen. */
export function checks(id: StepId, c: Ctx): Check[] {
  const { d, rules } = c;
  const out: Check[] = [];
  const need = (key: string, ok: boolean) => out.push({ key, ok });
  switch (id) {
    case "you":
      need("legalName", Boolean(d.legalName.trim()));
      need("dob", /^\d{4}-\d{2}-\d{2}$/.test(d.dob));
      if (!rules.noNationality) need("nationality", Boolean(d.nationality.trim()));
      break;
    case "reach":
      need("mobile", okMobile(d.mobile));
      need("email", okEmail(d.email));
      need("currentAddress", Boolean(d.currentAddress.trim()));
      need("howlong", d.livedThreeYears !== null);
      need("movedIn", monthsSince(d.movedIn) !== null);
      if (d.livedThreeYears === false) need("previousAddress", Boolean(d.previousAddress.trim()));
      break;
    case "move":
      need("moveWhen", Boolean(d.moveWhen));
      need("budget", (money(d.budget) ?? 0) > 0);
      for (let k = 0; k < otherAdultCount(d); k++) {
        need(`other-${k}`, Boolean(otherName(d, k)));
        const cr = otherCredit(d, k);
        need(`othercredit-${k}`, cr.credit !== null);
        if (cr.credit === true) need(`othernote-${k}`, Boolean(cr.note.trim()));
      }
      need("pets", d.pets !== null);
      if (d.pets === true) need("petsNote", Boolean(d.petsNote.trim()));
      need("smoking", d.smoker !== null && (Boolean(d.smoking) || d.smoker === false));
      break;
    case "work":
      need("applicantType", Boolean(d.applicantType));
      if (isEmployed(d)) {
        need("workHours", Boolean(d.workHours));
        need("zeroHours", d.zeroHours !== null);
        need("onProbation", d.onProbation !== null);
      }
      if (isTrading(d)) need("tradingFor", Boolean(d.tradingFor));
      need("annualIncome", money(d.annualIncome) !== null);
      need("guarantor", d.guarantor !== null);
      break;
    case "rtr":
      need("rtr", d.hasBritishPassport !== null);
      if (d.hasBritishPassport === false) need("shareCode", Boolean(d.shareCode.trim()));
      break;
    case "history":
      need("livingNow", Boolean(d.livingNow));
      need("rentedLast12Months", d.rentedLast12Months !== null);
      if (d.rentedLast12Months === true) {
        need("rentOnTime", d.rentOnTime !== null);
        need("landlordRef", d.landlordRef !== null);
      }
      need("issues", d.adverseCredit === false || (d.adverseCredit === true && Boolean(d.issues) && d.issues !== "No"));
      if (d.adverseCredit === true) need("adverseCreditNote", Boolean(d.adverseCreditNote.trim()));
      for (const qn of c.questions) if (qn.required) need(`q-${qn.id}`, (c.answers[qn.id] ?? "").trim() !== "");
      break;
    case "sign":
      need("declaredTrue", d.declaredTrue === true);
      need("consentChecks", d.consentChecks === true);
      need("signature", Boolean(d.signature.trim()));
      break;
  }
  return out;
}

export const missing = (id: StepId, c: Ctx) => checks(id, c).filter((x) => !x.ok).map((x) => x.key);
export const stepOk = (id: StepId, c: Ctx) => checks(id, c).every((x) => x.ok);

/** How far along, in answers: the bar on the passport and the welcome back. */
export function percent(steps: StepDef[], c: Ctx): number {
  const all = steps.flatMap((s) => checks(s.id, c));
  return all.length ? Math.round((all.filter((x) => x.ok).length / all.length) * 100) : 0;
}

/** What a tenant is told under a question they missed. */
export const ERR: Record<string, string> = {
  legalName: "We need your full legal name.",
  dob: "Add your date of birth as day, month and year.",
  nationality: "Your nationality, as it is on your passport.",
  mobile: "A UK mobile number, so we can text you about viewings.",
  email: "An email address we can send your updates to.",
  currentAddress: "Start typing your postcode and pick your address.",
  howlong: "Pick one.",
  movedIn: "The month and year you moved in, roughly.",
  previousAddress: "Referencing looks back three years, so we need where you were before.",
  moveWhen: "Pick one.",
  budget: "Roughly how much a month?",
  pets: "Pick one.",
  petsNote: "What kind of pet?",
  smoking: "Pick one.",
  applicantType: "Pick one.",
  workHours: "Pick one.",
  zeroHours: "Pick one.",
  onProbation: "Pick one.",
  tradingFor: "Pick one.",
  annualIncome: "Roughly, before tax. Put 0 if you have none.",
  guarantor: "Pick one.",
  rtr: "Pick the one that fits.",
  shareCode: "We need your share code to check your right to rent online.",
  livingNow: "Pick one.",
  rentedLast12Months: "Pick one.",
  rentOnTime: "Pick one.",
  landlordRef: "Pick one.",
  issues: "Pick one.",
  adverseCreditNote: "A line or two about it.",
  declaredTrue: "Please tick to confirm.",
  consentChecks: "Please tick to agree.",
  signature: "Type your full name to sign.",
};
export const errFor = (key: string) =>
  ERR[key] ??
  (key.startsWith("other-") ? "Their name, please." : key.startsWith("othercredit-") ? "Pick one." : key.startsWith("othernote-") ? "A line or two about it." : "Please answer this one.");

/* ── The summary on the last page ──────────────────────────────────────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Mar 1996" from "1996-03-14", or "". */
export function bornOn(dob: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  return m ? `${m[3]} ${MON[Number(m[2]) - 1]} ${m[1]}` : "";
}

/** The first part or two of an address: "Flat 8, 20 Example Street". */
export const shortAddress = (a: string) => a.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(", ");

const pounds = (v: string) => {
  const n = money(v);
  return n === null ? "" : `£${n.toLocaleString("en-GB")}`;
};

export function summary(id: StepId, d: PassportData): string {
  const adults = Math.max(1, parseInt(d.numAdults, 10) || 1);
  const children = Math.max(0, parseInt(d.numChildren, 10) || 0);
  const bits: Record<StepId, string[]> = {
    you: [d.legalName.trim(), bornOn(d.dob) ? `born ${bornOn(d.dob)}` : ""],
    reach: [d.mobile.trim(), d.email.trim(), shortAddress(d.currentAddress)],
    move: [
      d.moveWhen,
      pounds(d.budget) ? `${pounds(d.budget)} a month` : "",
      `${adults} adult${adults > 1 ? "s" : ""}${children ? `, ${children} child${children > 1 ? "ren" : ""}` : ""}`,
      d.pets === false ? "No pets" : d.pets ? d.petsNote.trim() || "A pet" : "",
    ],
    work: [d.applicantType, pounds(d.annualIncome) ? `${pounds(d.annualIncome)} a year` : ""],
    rtr: [d.hasBritishPassport ? "British or Irish passport" : d.hasBritishPassport === false && d.shareCode.trim() ? `Share code ${d.shareCode.trim().toUpperCase()}` : ""],
    history: [d.livingNow, d.adverseCredit === false ? "No CCJs or defaults" : d.adverseCredit ? (d.issues === "Yes, now" ? "CCJs or defaults now" : d.issues === "Yes, in the past" ? "CCJs or defaults in the past" : "Adverse credit") : ""],
    sign: [],
  };
  return bits[id].filter(Boolean).join(" · ");
}
