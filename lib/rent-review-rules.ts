/**
 * THE SCOTTISH RENT REVIEW: THE RULES, ONCE (James and Michael Healy, 19-20 Nov 2026).
 *
 * In Scotland a rent increase is not a Section 13. On a private residential
 * tenancy it is the prescribed "Rent-increase notice" under section 22(1) of
 * the Private Housing (Tenancies) (Scotland) Act 2016. The Scottish agents
 * were paying Legal for Landlords for each one; the OS now fills it in.
 *
 * Client-safe, no imports with side effects: the screen checks every rule as
 * the agent types, and the server checks the same rules again before
 * anything is sent (lib/rent-reviews), from the same functions.
 *
 * ── The notice period (the official guidance, notes 2, 3, 12 and 13) ──────
 *
 *   The notice goes by email, so it is taken as received 48 hours after it
 *   was sent (Interpretation and Legislative Reform (Scotland) Act 2010, s.26).
 *   The tenant must have at least three months from the day they receive it.
 *   The three months end on the same date three months on; where that month
 *   has no such day, on its last day. The earliest the new rent can start is
 *   the day after the three months end.
 *
 *   Sent 13 Jan, received 15 Jan, period ends 15 Apr, earliest 16 Apr.
 *   Received 30 Nov, period ends 28 or 29 Feb, earliest 1 Mar.
 *
 * ── And two more ─────────────────────────────────────────────────────────
 *
 *   The new rent starts at least 12 months after the last increase, when
 *   there was one. The new rent is more than the rent today.
 */

export type RentPeriod = "week" | "fortnight" | "four_weeks" | "month" | "quarter" | "year";

export const PERIODS: { id: RentPeriod; label: string; per: string; perYear: number }[] = [
  { id: "week", label: "Week", per: "per week", perYear: 52 },
  { id: "fortnight", label: "Fortnight", per: "per fortnight", perYear: 26 },
  { id: "four_weeks", label: "4 weeks", per: "per 4 weeks", perYear: 13 },
  { id: "month", label: "Calendar month", per: "per calendar month", perYear: 12 },
  { id: "quarter", label: "Quarter", per: "per quarter", perYear: 4 },
  { id: "year", label: "Year", per: "per year", perYear: 1 },
];

export const isPeriod = (v: unknown): v is RentPeriod => PERIODS.some((p) => p.id === v);
export const periodOf = (id: RentPeriod) => PERIODS.find((p) => p.id === id) ?? PERIODS[3];

/** A rent over a year, so two rents on different periods can be compared. */
export const yearly = (amount: number, period: RentPeriod) => amount * periodOf(period).perYear;

/** "£1,250" or "£1,250.50". */
export function pounds(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** The increase as £ (on the new rent's period) and %, or null when either rent is missing. */
export function increaseOf(current: number | null, currentPeriod: RentPeriod, next: number | null, nextPeriod: RentPeriod): { amount: number; pct: number; per: string } | null {
  if (!current || !next || current <= 0 || next <= 0) return null;
  const was = yearly(current, currentPeriod) / periodOf(nextPeriod).perYear;
  const amount = Math.round((next - was) * 100) / 100;
  const pct = Math.round(((next - was) / was) * 1000) / 10;
  return { amount, pct, per: periodOf(nextPeriod).per };
}

/* ── days, as "YYYY-MM-DD" on the UK clock ───────────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** Today on the UK clock. */
export const ukToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The same date n months on; where that month has no such day, its last day. */
export function addMonthsClamped(day: string, n: number): string {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysIn(ny, nm)));
}

/** "16 April 2027". */
export function dayWords(day: string | null | undefined): string {
  if (!day || !isDay(day)) return "";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The 48 hours, the three months and the day after, from the day it is sent. */
export function noticePeriod(sentOn: string): { sentOn: string; received: string; periodEnds: string; earliest: string; why: string } {
  const received = addDays(sentOn, 2);
  const periodEnds = addMonthsClamped(received, 3);
  const earliest = addDays(periodEnds, 1);
  return {
    sentOn,
    received,
    periodEnds,
    earliest,
    why: `Emailed ${dayWords(sentOn)}, it counts as received 48 hours later, on ${dayWords(received)}. The three months' notice runs to ${dayWords(periodEnds)}, so the new rent can start from ${dayWords(earliest)}.`,
  };
}

/** A private residential tenancy cannot have begun before this day; earlier ones may be short assured tenancies. */
export const PRT_BEGAN = "2017-12-01";

/* ── the answers, and what is wrong with them ───────────────────────────── */

export interface RentReviewAnswers {
  tenantNames: string;
  letAddress: string;
  landlordName: string;
  landlordAddress: string;
  agentAddress: string;
  prtConfirmed: boolean;
  currentRent: number | null;
  currentPeriod: RentPeriod;
  newRent: number | null;
  newPeriod: RentPeriod;
  effectiveDate: string;
  /** null with notIncreased, or a day. */
  lastIncrease: string | null;
  notIncreased: boolean;
  /** Michael's questions: on the record, never on the notice. */
  why: string;
  marketRent: number | null;
  marketNote: string;
  emailAgreed: boolean;
  signature: string;
}

export const emptyAnswers = (): RentReviewAnswers => ({
  tenantNames: "", letAddress: "", landlordName: "", landlordAddress: "", agentAddress: "", prtConfirmed: false,
  currentRent: null, currentPeriod: "month", newRent: null, newPeriod: "month", effectiveDate: "", lastIncrease: null, notIncreased: false,
  why: "", marketRent: null, marketNote: "", emailAgreed: false, signature: "",
});

export type StepId = "tenancy" | "rent" | "why" | "sign";

/** What still needs doing on each step, in words for the screen. Empty: it can go. */
export function problems(a: RentReviewAnswers, sentOn: string, evidenceCount: number): Record<StepId, string[]> {
  const out: Record<StepId, string[]> = { tenancy: [], rent: [], why: [], sign: [] };
  if (!a.tenantNames.trim()) out.tenancy.push("Name the tenants.");
  if (!a.letAddress.trim()) out.tenancy.push("Add the let address.");
  if (!a.landlordName.trim()) out.tenancy.push("Add the landlord's name.");
  if (!a.landlordAddress.trim()) out.tenancy.push("Add the landlord's address.");
  if (!a.agentAddress.trim()) out.tenancy.push("Add the agent's address.");
  if (!a.prtConfirmed) out.tenancy.push("Confirm this is a private residential tenancy.");

  if (!a.currentRent || a.currentRent <= 0) out.rent.push("Add the rent today.");
  if (!a.newRent || a.newRent <= 0) out.rent.push("Add the new rent.");
  if (a.currentRent && a.newRent && yearly(a.newRent, a.newPeriod) <= yearly(a.currentRent, a.currentPeriod)) out.rent.push("The new rent must be more than the rent today.");
  const { earliest } = noticePeriod(sentOn);
  if (!isDay(a.effectiveDate)) out.rent.push("Pick the date the new rent starts.");
  else if (a.effectiveDate < earliest) out.rent.push(`The new rent can't start before ${dayWords(earliest)}.`);
  if (!a.notIncreased && !isDay(a.lastIncrease)) out.rent.push("Add when the rent last went up, or tick that it hasn't since the tenancy began.");
  if (!a.notIncreased && isDay(a.lastIncrease)) {
    if (a.lastIncrease > sentOn) out.rent.push("The last increase can't be in the future.");
    const twelve = addMonthsClamped(a.lastIncrease, 12);
    if (isDay(a.effectiveDate) && a.effectiveDate < twelve) out.rent.push(`The last increase was ${dayWords(a.lastIncrease)}, so the new rent can't start before ${dayWords(twelve)}.`);
  }

  if (a.why.trim().length < 10) out.why.push("Say why this increase is right.");
  if (!a.marketRent || a.marketRent <= 0) out.why.push("Add what similar homes rent for.");
  if (evidenceCount < 1) out.why.push("Add at least one piece of market evidence.");

  if (a.signature.trim().length < 3) out.sign.push("Type your name to sign.");
  return out;
}

/** The latest day it can start that the rules allow, from the answers: the later of the notice and the 12 months. */
export function earliestFor(a: Pick<RentReviewAnswers, "notIncreased" | "lastIncrease">, sentOn: string): string {
  const { earliest } = noticePeriod(sentOn);
  if (a.notIncreased || !isDay(a.lastIncrease)) return earliest;
  const twelve = addMonthsClamped(a.lastIncrease, 12);
  return twelve > earliest ? twelve : earliest;
}

/* ── the record ─────────────────────────────────────────────────────────── */

export type ReviewStatus = "sent" | "payprop_updated" | "in_effect";
export type TenantResponse = "accepted" | "challenged_notice" | "rent_officer";

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  sent: "Sent - PayProp to update",
  payprop_updated: "PayProp updated",
  in_effect: "In effect",
};
export const RESPONSE_LABEL: Record<TenantResponse, string> = {
  accepted: "Accepted the new rent",
  challenged_notice: "Accepted, but says the notice was short",
  rent_officer: "Referring it to a Rent Officer",
};
export const isResponse = (v: unknown): v is TenantResponse => v === "accepted" || v === "challenged_notice" || v === "rent_officer";

export interface RentReview {
  id: string;
  listingId: string;
  propertyId: string | null;
  osPropertyId: string | null;
  home: string;
  country: "scotland";
  answers: RentReviewAnswers;
  evidence: { key: string; name: string; size: number; mime: string }[];
  pdfKey: string | null;
  method: "email" | "print";
  sentAt: string;
  sentBy: { id: string; name: string; email: string };
  recipients: { name: string; email: string; sent: boolean; detail: string }[];
  homeSendId: string | null;
  accounts: { to: string; sentAt: string | null; detail: string };
  status: ReviewStatus;
  paypropBy: string | null;
  paypropAt: string | null;
  response: TenantResponse | null;
  responseDate: string | null;
  responseNote: string;
  responseBy: string | null;
  demo: boolean;
}

/* ── the blanks on the notice ───────────────────────────────────────────── */

/** An address as the lines it prints on: one per line typed, or per comma. */
export const addressLines = (s: string) =>
  s.split(/\r?\n|,/).map((l) => l.trim()).filter(Boolean);

/** What each blank on the prescribed form prints, from the answers. Empty lines are blanks still to fill. */
export function fillNotice(a: RentReviewAnswers, sentOn: string): import("@/lib/rent-increase-notice-text").Filled {
  const rent = (n: number | null, p: RentPeriod) => (n && n > 0 ? [`${pounds(n)} ${periodOf(p).per}`] : []);
  return {
    tenantNames: a.tenantNames.trim() ? [a.tenantNames.trim()] : [],
    letAddress: addressLines(a.letAddress),
    landlordName: a.landlordName.trim() ? [a.landlordName.trim()] : [],
    landlordAddress: addressLines(a.landlordAddress),
    agentAddress: addressLines(a.agentAddress),
    currentRent: rent(a.currentRent, a.currentPeriod),
    newRent: rent(a.newRent, a.newPeriod),
    effectiveDate: isDay(a.effectiveDate) ? [dayWords(a.effectiveDate)] : [],
    lastIncrease: a.notIncreased ? ["n/a"] : isDay(a.lastIncrease) ? [dayWords(a.lastIncrease)] : [],
    signature: a.signature.trim() ? [a.signature.trim()] : [],
    signedOn: [dayWords(sentOn)],
    noticeDate: [dayWords(sentOn)],
  };
}
