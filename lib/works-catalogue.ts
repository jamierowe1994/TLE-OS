/**
 * The maintenance vocabulary, on BOTH sides of the server line.
 *
 * No "server-only" here, and that is the entire point. `lib/works-orders.ts`
 * is server-only because it talks to the database, so every screen that needs
 * to draw an urgency or a trade has had to keep its own copy - the Maintenance
 * page carries one under a comment that says "Keep them in step", which is a
 * standing invitation to drift and a job nothing can check.
 *
 * The same trap caught the inspection report sheet on 14 Sep 2026: it imported
 * a VALUE from a server-only module into a client component and broke the
 * build. The answer both times is the same - the words live in a plain module
 * either side can import, and the server module re-exports them so nothing
 * that already reads them has to change.
 */

import { FIRE_KINDS } from "@/lib/cert-kinds";

export const KINDS = ["repair", "planned"] as const;
export type Kind = (typeof KINDS)[number];

export const URGENCIES = [
  { id: "emergency", label: "Emergency", within: "24 hours", hours: 24, blurb: "No heating in winter, a burst pipe, no power, a security risk." },
  { id: "urgent", label: "Urgent", within: "3 days", hours: 72, blurb: "Something broken that makes the home hard to live in." },
  { id: "routine", label: "Routine", within: "14 days", hours: 24 * 14, blurb: "Everything else." },
] as const;
export type Urgency = (typeof URGENCIES)[number]["id"];

export const REPAIR_CATEGORIES = [
  "Plumbing", "Heating & boiler", "Electrical", "Gas", "Appliance", "Roof & gutters", "Windows & doors", "Locks & security", "Damp & mould",
  "Decoration", "Flooring", "Garden & fences", "Pests", "Cleaning", "Structural", "Other",
] as const;

export const PLANNED_CATEGORIES = [
  "Gas safety (CP12)", "EICR", "EPC", "Boiler service", "Legionella risk assessment", "PAT test", "Smoke & CO alarms", "Fire risk assessment",
  "HMO licence inspection", "Property inspection", "Inventory & check-in", "Check-out", "Other",
] as const;

/**
 * A planned job can be several things at once - a boiler service and an EPC
 * on the same visit. James, 8 Oct 2026. The job keeps one category column, so
 * the ticked ones are kept in it together, "Boiler service, EPC", and every
 * screen that shows the category shows all of them for free. Anything that
 * acts on a category (the contractor's trade, the certificate's due date)
 * reads them apart with this. No category name has a comma in it.
 */
export const categoriesOf = (category: string | null | undefined): string[] =>
  [...new Set((category ?? "").split(",").map((c) => c.trim()).filter(Boolean))];

export const joinCategories = (list: readonly string[]): string => [...new Set(list.map((c) => c.trim()).filter(Boolean))].join(", ");

/** A category as it is said in a sentence: "Gas safety (CP12)" is "Gas safety". */
export const categoryName = (c: string): string => c.replace(/ \(.*\)$/, "");

/** "Gas safety", "Gas safety and PAT test", "Gas safety, Boiler service and PAT test". */
export const sayList = (list: readonly string[]): string =>
  list.length < 2 ? list[0] ?? "" : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

/**
 * EVERYTHING A PLANNED JOB COVERS, IN WORDS (Lianna Denholm, 17 Nov 2026,
 * ticket 6537a792: "the system only tells them a gas safety due, but I chose
 * gas and PAT"). The tenants' email named the job by what was typed in The
 * job box, which is the agent's own shorthand for the contractor and said
 * nothing of the PAT test ticked beside it. Whoever the job is done for is
 * told every category ticked. "Other" says nothing on its own, so a job that
 * is only that keeps its typed name.
 */
export function coversOf(o: { category?: string | null; title?: string | null }): string {
  const named = categoriesOf(o.category).filter((c) => c !== "Other").map(categoryName);
  return named.length ? sayList(named) : (o.title ?? "").trim();
}

/**
 * A PLANNED JOB'S CERTIFICATES, EACH WITH THE DAY IT RUNS OUT (Lianna
 * Denholm, 17 Nov 2026, ticket 578704cc: "if I want to instruct PAT & Gas
 * safety it only pulls through gas safety expiry date, it should pull
 * through both"). The form showed both dates since 12 Nov, but the job kept
 * one - the sooner - so its page, the works order and everything after said
 * nothing of the other. The job's own due date is still the one it is sorted
 * and chased by; these say which certificate runs out when. YYYY-MM-DD.
 */
export interface CertDate { category: string; expires: string }

/** As saved and as read: the job's own categories only, one real date each, soonest first. */
export function cleanCertDates(list: unknown, category: string | null | undefined): CertDate[] {
  const own = categoriesOf(category);
  const out: CertDate[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const row = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const c = String(row.category ?? "").trim();
    const d = String(row.expires ?? "").slice(0, 10);
    if (!own.includes(c) || out.some((o) => o.category === c)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00Z`))) continue;
    out.push({ category: c, expires: d });
  }
  return out.sort((a, b) => a.expires.localeCompare(b.expires));
}

/**
 * The dates to say apart, soonest first: only when the job holds two or
 * more. A job with one date or none - every job raised before 17 Nov 2026 -
 * is its own due date, exactly as it always was.
 */
export function certDatesOf(o: { kind?: string | null; category?: string | null; certDates?: CertDate[] | null }): CertDate[] {
  if (o.kind !== "planned") return [];
  const list = cleanCertDates(o.certDates, o.category);
  return list.length > 1 ? list : [];
}

/** The London day a job is due, as YYYY-MM-DD, to set beside a certificate's date. */
export const dueDayOf = (iso: string | null | undefined): string =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" }) : "";

/**
 * The certificates a job can bring back, in REX's vocabulary and the words a
 * contractor would use. Gas and electrical first because they are most of
 * what comes back. Read by the contractor's page and the job sheet, so both
 * file a certificate under the same type (lib/certificate-intake CERT_TYPES).
 */
export const JOB_CERT_TYPES: { id: string; label: string }[] = [
  { id: "gas_safety", label: "Gas safety (CP12)" },
  { id: "eicr", label: "Electrical safety (EICR)" },
  { id: "epc", label: "EPC" },
  { id: "portable_appliance_testing", label: "PAT test" },
  { id: "legionella_risk_assessment", label: "Legionella risk assessment" },
  { id: "smoke_alarms", label: "Smoke alarms" },
  { id: "co_alarms", label: "CO alarms" },
  /* The fire family by name (lib/cert-kinds): a fire risk assessment and an
     emergency lighting certificate each have their own line, and all three
     file as REX's one fire type. */
  ...FIRE_KINDS.map((k) => ({ id: k.id, label: k.label })),
];

/** The certificate a planned category brings back, to start the job sheet's upload on the right one. */
export const CATEGORY_CERT_TYPE: Record<string, string> = {
  "Gas safety (CP12)": "gas_safety",
  EICR: "eicr",
  EPC: "epc",
  "PAT test": "portable_appliance_testing",
  "Legionella risk assessment": "legionella_risk_assessment",
  "Smoke & CO alarms": "smoke_alarms",
  "Fire risk assessment": "fire_risk_assessment",
};

/** The trade a planned category wants, to start "Add a contractor" on a trade rather than a job name. */
export const CATEGORY_TRADE: Record<string, string> = {
  "Gas safety (CP12)": "Gas Safe engineer",
  "Boiler service": "Gas Safe engineer",
  EICR: "Electrician",
  "PAT test": "Electrician",
  "Smoke & CO alarms": "Electrician",
  EPC: "EPC assessor",
  "Legionella risk assessment": "Legionella assessor",
  "Fire risk assessment": "Fire risk assessor",
  "HMO licence inspection": "Inspector",
  "Property inspection": "Inventory clerk",
  "Inventory & check-in": "Inventory clerk",
  "Check-out": "Inventory clerk",
};

/** Stands for each tenant's own first name in a tenant email the agent rewords (Lianna Denholm, 16 Nov 2026). */
export const TENANT_FIRST_NAME = "[first name]";
