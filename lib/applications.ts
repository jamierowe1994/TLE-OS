import "server-only";
import { rexCall, rexRows } from "@/lib/rex";

/**
 * Tenancy applications — the real ones, out of REX.
 *
 * This is not a new pipeline. 576 applications already live in REX and 457 of
 * them were made this year, 87% of those by Howard's JotForm → Power Automate
 * flow. What follows was measured against that book on 21 Aug 2026, because
 * the shape of the form we build has to be the shape of the data that exists.
 *
 * WHAT THE MEASUREMENT FOUND
 *
 * REX's application record is generous. It holds an applicant sub-record per
 * person (`related.listing_application_tenants`) with date of birth, net income
 * and period, employment status, a guarantors array and a linked contact. It is
 * mostly well filled: across 2026, employment 457/457, dob 432/457, income
 * 371/457.
 *
 * Four answers, though, are in NO field. Right to Rent, a landlord reference
 * for the last two years, whether a guarantor is offered, and whether there is
 * adverse credit are pushed into the free-text `notes` column as a single line
 * of prose, in a stable pipe-separated format:
 *
 *   PRIMARY — Rachel Oakes (Employed) | Job: … | Company: … | Position: … |
 *   Zero hours: No | In probation: No | Salary: £ 21,774 p/year |
 *   Right to rent: Yes | LL ref (2y): Yes | Guarantor: No | Poor credit: No
 *
 * Three consequences, and they are the reason this task exists:
 *
 *  1. THE LINE ONLY EVER DESCRIBES THE PRIMARY APPLICANT. 473 blobs, not one
 *     mentions a second person. There are 265 joint applicants on 2026's
 *     applications, and for every one of them Right to Rent is unrecorded —
 *     in prose or otherwise. Right to Rent is a statutory check per adult
 *     occupier, so this is the gap that matters most.
 *
 *  2. `guarantors` IS EMPTY ON ALL 457, while the prose says "Guarantor: Yes"
 *     on a good hundred of them. We know a guarantor was offered; we have
 *     never recorded who.
 *
 *  3. THE EMPLOYMENT MAPPING IS LOSSY. The form offers Employed, Self-Employed,
 *     Student, Benefits and In Receipt of Pension. REX's enum has no Student,
 *     Benefits or Pension, so all three land on `unemployed` — 104 applicants
 *     recorded as unemployed who are nothing of the sort. Affordability is
 *     computed off income, not status, so the sums are safe; anyone reading or
 *     filtering the status is not.
 *
 * So `parseKeyInfo` below reads the prose back out. It is not a nicety: it is
 * the only way to see the Right to Rent answer on the 413 applications already
 * recorded that way, and it lets the new form and the old flow feed one screen.
 */

/* ── the vocabulary, as the form asks it ──────────────────────────────────── */

/** What the JotForm offers. Recovered from the live book, not invented. */
export const EMPLOYMENT = [
  "Employed",
  "Self-Employed",
  "Student",
  "Benefits",
  "In Receipt of Pension",
] as const;
export type Employment = (typeof EMPLOYMENT)[number];

/**
 * Our word → REX's enum id.
 *
 * Three of the five have no honest home, and they are marked as such rather
 * than quietly rounded off. `lossy: true` means REX will hold something that
 * is not what the applicant said, and the true answer survives only in our own
 * record — which is why `keyInfo.employment` is kept verbatim alongside it.
 */
export const EMPLOYMENT_TO_REX: Record<Employment, { id: string; lossy: boolean }> = {
  Employed: { id: "full_time", lossy: false },
  "Self-Employed": { id: "self_employed", lossy: false },
  Student: { id: "unemployed", lossy: true },
  Benefits: { id: "unemployed", lossy: true },
  "In Receipt of Pension": { id: "unemployed", lossy: true },
};

/** REX's own agreement types, as used on the live book. */
export const AGREEMENT_TYPES = [
  { id: "ast", text: "Assured Shorthold Tenancy (AST)" },
  { id: "apt", text: "Assured Periodic Tenancy (APT)" },
  { id: "153279", text: "Private Residential Tenancy (PRT) (Scotland)" },
  { id: "company", text: "Company" },
  { id: "periodic_oc", text: "Periodic Occupation Contract" },
] as const;

/** The four statuses in use, in the order a deal passes through them. */
export const APPLICATION_STATUSES = [
  { id: "received", text: "Received" },
  { id: "communicated", text: "Communicated" },
  { id: "accepted", text: "Accepted" },
  { id: "unsuccessful", text: "Unsuccessful" },
] as const;

/* ── the shape we hand the UI ─────────────────────────────────────────────── */

/** The four answers that live in prose today, per applicant. */
export interface KeyInfo {
  employment: string | null;
  job: string | null;
  company: string | null;
  /** "Permanent" | "Temporary" */
  position: string | null;
  zeroHours: boolean | null;
  inProbation: boolean | null;
  /** Annual, in pounds. */
  salary: number | null;
  rightToRent: boolean | null;
  /** A landlord reference covering the last two years. */
  landlordRef: boolean | null;
  guarantor: boolean | null;
  adverseCredit: boolean | null;
  /** What they wrote when they ticked "poor credit" — always worth reading. */
  adverseCreditNote: string | null;
}

export interface Applicant {
  id: string | null;
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  dob: string | null;
  /** Normalised to pounds per year, whatever period REX stored. */
  incomePerYear: number | null;
  employmentRex: string | null;
  guarantorCount: number;
  /** Only ever present for the primary, and only when the flow wrote it. */
  keyInfo: KeyInfo | null;
}

export interface Application {
  id: string;
  status: string;
  statusLabel: string;
  listingId: number | null;
  /** The PROPERTY, not the listing. Compliance certificates hang off this. */
  propertyId: string | null;
  property: string;
  locality: string;
  image: string | null;
  agent: string | null;
  offerAmount: number | null;
  offerPeriod: string;
  startDate: string | null;
  agreementMonths: number | null;
  occupants: number | null;
  households: number | null;
  dependents: number | null;
  hasPets: boolean | null;
  affordabilityPct: number | null;
  totalIncome: number | null;
  holdingDepositAmount: number | null;
  dateReceived: string | null;
  dateAccepted: string | null;
  conditions: string | null;
  applicants: Applicant[];
  createdBy: string | null;
  createdAt: number | null;
  /** True when nobody has recorded Right to Rent for every adult applicant. */
  rightToRentIncomplete: boolean;
}

/* ── reading the prose back out ───────────────────────────────────────────── */

const YES = /^\s*yes/i;
const NO = /^\s*no/i;

function tri(v: string | null): boolean | null {
  if (v == null) return null;
  if (YES.test(v)) return true;
  if (NO.test(v)) return false;
  return null;
}

/** Pull `Label: value` out of the pipe-separated line. */
function field(blob: string, label: string): string | null {
  const re = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([^|\\n]*)`, "i");
  const m = re.exec(blob);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

function money(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[£,\s]/g, "").replace(/p\/?year|per\s*year|pa/i, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Recover the four checks from the `notes` blob.
 *
 * Returns null when the note was written by a person rather than the flow —
 * better an honest absence than a half-parsed record that reads as an answer.
 */
export function parseKeyInfo(notes: string | null | undefined): KeyInfo | null {
  if (!notes) return null;
  const after = notes.split(/Tenant key info:/i)[1];
  if (!after) return null;
  const blob = after.trim();
  if (!blob) return null;

  const employment = /^\s*PRIMARY\s+—\s+[^(]*\(([^)]*)\)/m.exec(blob)?.[1]?.trim() ?? null;
  const credit = field(blob, "Poor credit");
  // "Poor credit: Yes (…their explanation, which can run for paragraphs…)"
  const creditNote = credit && /^yes/i.test(credit) ? /\(([\s\S]*)/.exec(credit)?.[1] ?? null : null;

  return {
    employment,
    job: field(blob, "Job"),
    company: field(blob, "Company"),
    position: field(blob, "Position"),
    zeroHours: tri(field(blob, "Zero hours")),
    inProbation: tri(field(blob, "In probation")),
    // Three different labels carry the income, depending on which branch of
    // the form they took. The benefits one is stated MONTHLY — taking it at
    // face value understated those applicants twelvefold.
    salary:
      money(field(blob, "Salary")) ??
      money(field(blob, "Last 12 months")) ??
      (() => {
        const m = money(field(blob, "Monthly benefit income"));
        return m == null ? null : m * 12;
      })(),
    rightToRent: tri(field(blob, "Right to rent")),
    // `field` escapes the label itself — pre-escaping the brackets here double
    // escaped them and the match silently failed, reading every landlord
    // reference as unanswered.
    landlordRef: tri(field(blob, "LL ref (2y)")),
    guarantor: tri(field(blob, "Guarantor")),
    adverseCredit: tri(credit),
    adverseCreditNote: creditNote ? creditNote.replace(/\)\s*$/, "").trim() : null,
  };
}

/** Write the same line back, so a form-made application reads like a flow-made
 *  one. Same order, same labels — REX's note history stays one format. */
export function formatKeyInfo(name: string, k: KeyInfo): string {
  const yn = (b: boolean | null) => (b == null ? "—" : b ? "Yes" : "No");
  const parts = [`PRIMARY — ${name} (${k.employment ?? "—"})`];
  if (k.job) parts.push(`Job: ${k.job}`);
  if (k.company) parts.push(`Company: ${k.company}`);
  if (k.position) parts.push(`Position: ${k.position}`);
  if (k.zeroHours != null) parts.push(`Zero hours: ${yn(k.zeroHours)}`);
  if (k.inProbation != null) parts.push(`In probation: ${yn(k.inProbation)}`);
  if (k.salary) parts.push(`Salary: £ ${k.salary.toLocaleString("en-GB")} p/year`);
  parts.push(`Right to rent: ${yn(k.rightToRent)}`);
  parts.push(`LL ref (2y): ${yn(k.landlordRef)}`);
  parts.push(`Guarantor: ${yn(k.guarantor)}`);
  parts.push(
    `Poor credit: ${yn(k.adverseCredit)}${k.adverseCredit && k.adverseCreditNote ? ` (${k.adverseCreditNote})` : ""}`
  );
  return parts.join(" | ");
}

/* ── REX → our shape ──────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** REX hands image URLs back protocol-relative — unusable outside a browser. */
function https(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

const PER_YEAR: Record<string, number> = { year: 1, month: 12, week: 52, fortnight: 26, day: 365 };

function applicantOf(t: Row, keyInfo: KeyInfo | null): Applicant {
  const contact = (t.contact ?? {}) as Row;
  const period = str((t.net_income_period as Row | null)?.id) ?? "year";
  const income = num(t.net_income);
  const isPrimary = Boolean(t.is_primary);
  return {
    id: str(t.id),
    contactId: str(contact.id),
    name: str(contact.name) ?? "Name not recorded",
    email: str(contact.email_address),
    phone: str(contact.phone_number),
    isPrimary,
    dob: str(t.dob),
    incomePerYear: income != null ? Math.round(income * (PER_YEAR[period] ?? 1)) : null,
    employmentRex: str((t.employment_status as Row | null)?.text),
    guarantorCount: Array.isArray(t.guarantors) ? t.guarantors.length : 0,
    // The blob describes the primary and nobody else — attaching it to a joint
    // applicant would be inventing an answer they were never asked for.
    keyInfo: isPrimary ? keyInfo : null,
  };
}

export function shapeApplication(r: Row): Application {
  const listing = (r.listing ?? {}) as Row;
  const property = (listing.property ?? {}) as Row;
  const keyInfo = parseKeyInfo(str(r.notes));
  const tenants = ((r.related as Row | null)?.listing_application_tenants ?? []) as Row[];
  const applicants = tenants.map((t) => applicantOf(t, keyInfo));

  const street = [str(property.adr_street_number), str(property.adr_street_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  const building =
    typeof property.adr_building === "string"
      ? property.adr_building
      : str((property.adr_building as Row | null)?.name);
  const name =
    [
      property.adr_unit_number ? `Apartment ${property.adr_unit_number}` : null,
      building,
      street || null,
    ]
      .filter(Boolean)
      .join(", ") ||
    str(property.system_search_key) ||
    "Address not recorded";

  const status = str((r.application_status as Row | null)?.id) ?? "received";

  return {
    id: String(r.id ?? ""),
    status,
    statusLabel:
      str((r.application_status as Row | null)?.text) ??
      APPLICATION_STATUSES.find((s) => s.id === status)?.text ??
      "Received",
    listingId: num(listing.id),
    propertyId: property.id != null ? String(property.id) : null,
    property: name,
    locality:
      [str(property.adr_suburb_or_town), str(property.adr_postcode)].filter(Boolean).join(" ") ||
      "—",
    image: https(str((listing.listing_primary_image as Row | null)?.url)),
    agent: str((r.agent as Row | null)?.name),
    offerAmount: num(r.offer_amount),
    offerPeriod: str((r.offer_amount_period as Row | null)?.text) ?? "Per Month",
    startDate: str(r.start_date),
    agreementMonths: num(r.agreement_length_months),
    occupants: num(r.num_of_occupants),
    households: num(r.num_of_households),
    dependents: num(r.num_of_dependents),
    hasPets: r.has_pets == null ? null : Boolean(r.has_pets),
    affordabilityPct: num(r.system_affordability_percentage),
    totalIncome: num(r.system_total_income),
    holdingDepositAmount: num(r.holding_deposit_amount),
    dateReceived: str(r.date_received),
    dateAccepted: str(r.date_accepted),
    conditions: str(r.conditions),
    applicants,
    createdBy: str((r.system_created_user as Row | null)?.name),
    createdAt: num(r.system_ctime),
    // The whole point of the exercise. One "Yes" on the primary is not a
    // Right to Rent check on a household of three.
    rightToRentIncomplete:
      applicants.length > 0 && applicants.some((a) => a.keyInfo?.rightToRent !== true),
  };
}

/**
 * The live book, newest first.
 *
 * REX caps a page at 100 and — this is the trap — returns an EMPTY array rather
 * than an error when you ask for more, so a limit of 200 reads as "no
 * applications" instead of failing. Paged deliberately.
 */
export async function getApplications(limit = 100): Promise<Application[]> {
  const out: Application[] = [];
  for (let offset = 0; out.length < limit; offset += 100) {
    const page = Math.min(100, limit - out.length);
    const res = await rexCall("TenancyApplications", "search", {
      limit: page,
      offset,
      order_by: { system_ctime: "desc" },
    });
    if (!res.ok) throw new Error(res.error ?? "REX wouldn't answer.");
    const rows = rexRows(res.result);
    if (!rows.length) break;
    out.push(...rows.map(shapeApplication));
    if (rows.length < page) break;
  }
  return out;
}

/* ── making one ───────────────────────────────────────────────────────────── */

export interface NewApplicant {
  name: string;
  email: string;
  phone: string;
  dob: string;
  isPrimary: boolean;
  employment: Employment;
  job?: string;
  company?: string;
  position?: string;
  zeroHours?: boolean;
  inProbation?: boolean;
  /** Annual, in pounds. */
  income: number;
  rightToRent: boolean;
  landlordRef: boolean;
  guarantor: boolean;
  adverseCredit: boolean;
  adverseCreditNote?: string;
}

export interface NewApplication {
  listingId: number;
  offerAmount: number;
  startDate: string;
  agreementMonths: number;
  occupants: number;
  dependents: number;
  hasPets: boolean;
  conditions?: string;
  applicants: NewApplicant[];
}

/** Every reason this application cannot be filed. Empty means it can. */
export function validateApplication(a: NewApplication, askingRent: number | null): string[] {
  const errs: string[] = [];
  if (!a.listingId) errs.push("No property — an application has to be against a listing.");
  if (!a.applicants.length) errs.push("No applicants.");
  if (a.applicants.filter((x) => x.isPrimary).length !== 1) {
    errs.push("Exactly one applicant must be the lead.");
  }
  a.applicants.forEach((p, i) => {
    const who = p.name?.trim() || `Applicant ${i + 1}`;
    if (!p.name?.trim()) errs.push(`Applicant ${i + 1} has no name.`);
    if (!p.email?.trim()) errs.push(`${who} has no email address.`);
    if (!p.dob) errs.push(`${who} has no date of birth.`);
    // The gap this whole task exists to close: asked of EVERY adult, not just
    // the lead. A statutory check is not a lead-applicant question.
    if (p.rightToRent !== true) {
      errs.push(`${who} hasn't confirmed their right to rent in the UK.`);
    }
  });
  if (!(a.offerAmount > 0)) errs.push("No offer amount.");
  // Howard's form has a price indicator and no rule. Rent is not an auction.
  if (askingRent != null && a.offerAmount > askingRent) {
    errs.push(`The advertised rent is £${askingRent.toLocaleString("en-GB")} — an offer can't be above it.`);
  }
  if (!a.startDate) errs.push("No move-in date.");
  return errs;
}

/**
 * The REX create payload.
 *
 * Applicants go in as nested `related.listing_application_tenants` — the proven
 * write shape for this API, where a nested `related` block on create/update IS
 * the way to write sub-records. The prose line goes into `notes` as well, in
 * the flow's exact format, so the note history stays readable in one style;
 * the structured answers are the copy that matters.
 */
export function buildCreatePayload(a: NewApplication): Record<string, unknown> {
  const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  const keyInfo: KeyInfo = {
    employment: lead.employment,
    job: lead.job ?? null,
    company: lead.company ?? null,
    position: lead.position ?? null,
    zeroHours: lead.zeroHours ?? null,
    inProbation: lead.inProbation ?? null,
    salary: lead.income || null,
    rightToRent: lead.rightToRent,
    landlordRef: lead.landlordRef,
    guarantor: lead.guarantor,
    adverseCredit: lead.adverseCredit,
    adverseCreditNote: lead.adverseCreditNote ?? null,
  };

  // Joint applicants get their own line. The flow never wrote these, which is
  // why 265 people have no recorded Right to Rent — we write all of them.
  const others = a.applicants
    .filter((p) => p !== lead)
    .map(
      (p) =>
        `ALSO — ${p.name} (${p.employment}) | Salary: £ ${p.income.toLocaleString("en-GB")} p/year | ` +
        `Right to rent: ${p.rightToRent ? "Yes" : "No"} | LL ref (2y): ${p.landlordRef ? "Yes" : "No"} | ` +
        `Guarantor: ${p.guarantor ? "Yes" : "No"} | Poor credit: ${p.adverseCredit ? "Yes" : "No"}`
    );

  return {
    listing_id: a.listingId,
    application_status_id: "received",
    offer_amount: a.offerAmount,
    offer_amount_period_id: "month",
    date_received: new Date().toISOString().slice(0, 10),
    start_date: a.startDate,
    agreement_length_months: a.agreementMonths,
    num_of_occupants: a.occupants,
    num_of_dependents: a.dependents,
    num_of_households: 1,
    has_pets: a.hasPets,
    conditions: a.conditions || null,
    notes: ["Tenant key info:", formatKeyInfo(lead.name, keyInfo), ...others].join("\n"),
    related: {
      listing_application_tenants: a.applicants.map((p) => ({
        is_primary: p.isPrimary,
        dob: p.dob,
        net_income: p.income,
        net_income_period_id: "year",
        employment_status_id: EMPLOYMENT_TO_REX[p.employment].id,
        contact: {
          name: p.name,
          email_address: p.email,
          phone_number: p.phone,
        },
      })),
    },
  };
}

/**
 * File it, AS SOMEBODY.
 *
 * Refused by the REX write lock until this exact method is unlocked — creating
 * a real application in the team's live system is not a thing to discover
 * working by accident.
 *
 * ── The actor token is not optional, and this is why ──────────────────────
 *
 * This called rexCall with no token, so it fell back to the office service
 * account. That is precisely how the first listing write on 29 Aug came to be
 * recorded against "System User": REX's audit trail then says the office did
 * it, and the person who actually did it is unrecoverable.
 *
 * lib/rex-contacts refuses on the same grounds and has done since it was
 * written. This now matches it rather than being the one write that quietly
 * does not care who is asking — and it refuses BEFORE building a payload, so
 * nothing is half-done.
 */
export async function createApplication(a: NewApplication, actorToken: string | null) {
  if (!actorToken) {
    throw new Error(
      "No REX sign-in held for you, so this application would be filed under the office account " +
        "rather than your name. Link your REX account on Profile, then try again."
    );
  }
  const res = await rexCall(
    "TenancyApplications",
    "create",
    { data: buildCreatePayload(a), return_id: true },
    actorToken
  );
  if (!res.ok) throw new Error(res.error ?? "REX refused the application.");
  return res.result;
}
