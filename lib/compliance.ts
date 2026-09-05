/**
 * Compliance: the rules a rented home has to keep, and where each property
 * stands against them.
 *
 * THE BIG THREE are safety law and lead everything on this page:
 *   EICR — electrical installation condition report, every 5 years
 *   Gas safety (CP12) — every 12 months, any property with gas
 *   EPC — energy performance certificate, 10 years, minimum E to let
 *
 * HMOs carry more: the licence itself, a fire risk assessment, emergency
 * lighting checks and PAT testing on supplied appliances. Ordinary lets also
 * carry the quieter duties — smoke/CO alarms confirmed at tenancy start,
 * a legionella risk assessment — kept in the drawer, not the headline.
 *
 * Expiry dates are day OFFSETS from today (the sample-book convention), so
 * the "next month" list is always alive. When this wires up, the numbers
 * come from REX's compliance entries — which are real and readable today,
 * files included. Known truths from the live book: recording only began
 * Nov 2025 (thin history, no backfill), EICRs carry their certificate,
 * EPCs almost never do. This page is built to make exactly those gaps loud.
 */

export type CertKey =
  | "eicr" | "gas" | "epc"            // the big three
  | "licence" | "fire" | "pat"        // the HMO set
  | "alarms" | "legionella";          // the quiet duties

export const CERT_META: Record<
  CertKey,
  { label: string; short: string; rule: string; trade: string; icon: string }
> = {
  eicr: {
    label: "EICR — electrical safety", short: "EICR",
    rule: "Every 5 years. Legally required on every let.",
    trade: "electrician", icon: "pack/checklist",
  },
  gas: {
    label: "Gas safety (CP12)", short: "Gas",
    rule: "Every 12 months, any property with gas. The hardest deadline in lettings.",
    trade: "Gas Safe engineer", icon: "pack/house",
  },
  epc: {
    label: "EPC — energy performance", short: "EPC",
    rule: "Every 10 years, minimum rating E to let at all.",
    trade: "EPC assessor", icon: "doc",
  },
  licence: {
    label: "HMO licence", short: "Licence",
    rule: "5 years. Letting an unlicensed HMO is an unlimited fine.",
    trade: "council application", icon: "shield",
  },
  fire: {
    label: "Fire risk assessment", short: "Fire RA",
    rule: "Reviewed yearly on HMOs.",
    trade: "fire assessor", icon: "bell",
  },
  pat: {
    label: "PAT testing", short: "PAT",
    rule: "Yearly on supplied appliances — expected on HMOs, good practice everywhere.",
    trade: "electrician", icon: "setting",
  },
  alarms: {
    label: "Smoke & CO alarms", short: "Alarms",
    rule: "Working on day one of every tenancy, and every floor.",
    trade: "engineer on next visit", icon: "bell",
  },
  legionella: {
    label: "Legionella risk assessment", short: "Legionella",
    rule: "No fixed expiry — review roughly every 2 years.",
    trade: "assessor", icon: "info",
  },
};

/** The columns the book table leads with, in order. */
export const BIG_THREE: CertKey[] = ["eicr", "gas", "epc"];
export const HMO_SET: CertKey[] = ["licence", "fire", "pat"];
export const QUIET_SET: CertKey[] = ["alarms", "legionella"];

export type Cert = {
  /** Days from today until expiry; negative = expired; null = no record. */
  expires: number | null;
  /** REX's URL for the certificate file, when one is attached. Never shown
   *  to a customer raw: the landlord route fetches it under our credentials
   *  after checking the property is theirs. */
  fileUrl?: string | null;
  /** Is the actual certificate file on the record? (REX truth: EICRs yes,
   *  EPCs almost never — a date without a document is half a record.) */
  attached: boolean;
};

export type CompProperty = {
  id: string;
  name: string;
  locality: string;
  landlord: string;
  /** Sitting tenant — the person the engineer's visit must be arranged with.
   *  null = known vacant. undefined = nobody has told us, which is NOT the
   *  same thing when someone is about to book an engineer. */
  tenant: string | null | undefined;
  hmo: boolean;
  hasGas: boolean;
  certs: Partial<Record<CertKey, Cert>>;
};

/** What this property is REQUIRED to hold. */
export function requiredCerts(p: CompProperty): CertKey[] {
  return [
    "eicr" as const,
    ...(p.hasGas ? ["gas" as const] : []),
    "epc" as const,
    ...(p.hmo ? HMO_SET : []),
    ...QUIET_SET,
  ];
}

export type CertStatus = "expired" | "urgent" | "watch" | "ok" | "missing";

export function statusOf(c: Cert | undefined): CertStatus {
  if (!c || c.expires == null) return "missing";
  if (c.expires < 0) return "expired";
  if (c.expires <= 30) return "urgent";
  if (c.expires <= 90) return "watch";
  return "ok";
}

export const STATUS_META: Record<CertStatus, { label: string; rank: number }> = {
  expired: { label: "EXPIRED", rank: 0 },
  urgent: { label: "due", rank: 1 },
  missing: { label: "no record", rank: 2 },
  watch: { label: "watch", rank: 3 },
  ok: { label: "in date", rank: 4 },
};

const c = (expires: number | null, attached = true): Cert => ({ expires, attached });

/* The sample book — the same addresses as everywhere else in the OS, so a
   property is one thing wherever you meet it. Deliberately spread: expired,
   due-this-month, missing records, HMO extras, a gasless house, and a couple
   that are simply fine, because a page that's all red teaches nothing. */
export const COMP_BOOK: CompProperty[] = [
  {
    id: "cp-harewood", name: "41 Harewood Road", locality: "Luton LU1",
    landlord: "Margaret Wilson", tenant: "The Ellis family", hmo: false, hasGas: true,
    certs: { eicr: c(400), gas: c(12), epc: c(2400, false), alarms: c(200), legionella: c(300) },
  },
  {
    id: "cp-milton", name: "Flat A, 41 Milton Road", locality: "Luton LU1",
    landlord: "Howard Bentley", tenant: null, hmo: false, hasGas: true,
    certs: { eicr: c(30), gas: c(8), epc: c(100, false), alarms: c(90), legionella: c(-10) },
  },
  {
    id: "cp-cardiff", name: "2, 10 Cardiff Grove", locality: "Luton LU1",
    landlord: "Susan Aldridge", tenant: "Olivia Clark", hmo: false, hasGas: true,
    certs: { eicr: c(900), gas: c(-2), epc: c(1500, false), alarms: c(400), legionella: c(500) },
  },
  {
    id: "cp-recreation", name: "8 Recreation Terrace", locality: "Nottingham NG9",
    landlord: "Raj Chauhan", tenant: null, hmo: false, hasGas: true,
    certs: { eicr: c(-6), gas: c(90), epc: c(500, false), alarms: c(365), legionella: c(600) },
  },
  {
    id: "cp-mercer", name: "Flat 2, Mercer Street", locality: "Manchester M4",
    landlord: "Pauline Okafor", tenant: "Sophie Turner", hmo: false, hasGas: true,
    certs: { eicr: c(1100), gas: c(25), epc: c(-30, false), alarms: c(150), legionella: c(250) },
  },
  {
    id: "cp-priory", name: "44 Priory Court", locality: "Nottingham NG7",
    landlord: "K&P Property Group", tenant: "Four sharers", hmo: true, hasGas: true,
    certs: {
      eicr: c(100), gas: c(300), epc: c(600, false),
      licence: c(-20), fire: c(200), pat: c(200),
      alarms: c(60), legionella: c(180),
    },
  },
  {
    id: "cp-cherry", name: "108 Cherry Tree Drive", locality: "Coventry CV4",
    landlord: "Tomasz Nowak", tenant: "Student let — five sharers", hmo: true, hasGas: true,
    certs: {
      eicr: c(200), gas: c(160), epc: c(900, false),
      licence: c(300), fire: c(18), pat: c(45),
      alarms: c(120), legionella: c(365),
    },
  },
  {
    id: "cp-walesby", name: "183 Walesby Lane", locality: "New Ollerton NG22",
    landlord: "Raj Chauhan", tenant: "Dean Halliwell", hmo: false, hasGas: true,
    certs: { eicr: c(800), gas: c(140), epc: c(1200, false), alarms: c(300), legionella: c(400) },
  },
  {
    id: "cp-chapter", name: "228a Chapter Road", locality: "London NW2",
    landlord: "Pauline Okafor", tenant: "Daniel Okafor", hmo: false, hasGas: true,
    certs: { eicr: c(700), gas: c(200), epc: c(null), alarms: c(250), legionella: c(null) },
  },
  {
    id: "cp-granby", name: "9 Granby Road", locality: "Salford M7",
    landlord: "New instruction", tenant: null, hmo: false, hasGas: true,
    certs: { eicr: c(null), gas: c(null), epc: c(3000, false), alarms: c(null), legionella: c(null) },
  },
  {
    id: "cp-kelvin", name: "88 Kelvin Way", locality: "Nottingham NG8",
    landlord: "Margaret Wilson", tenant: "The Hughes family", hmo: false, hasGas: true,
    certs: { eicr: c(27), gas: c(180), epc: c(420, false), alarms: c(200), legionella: c(300) },
  },
  {
    id: "cp-sandpiper", name: "6 Sandpiper Way", locality: "Mansfield NG19",
    landlord: "Howard Bentley", tenant: "Amara Okoye", hmo: false, hasGas: false,
    certs: { eicr: c(55), epc: c(250, false), alarms: c(180), legionella: c(365) },
  },
  {
    id: "cp-elm", name: "12 Elm Gardens", locality: "Didsbury M20",
    landlord: "Susan Aldridge", tenant: null, hmo: false, hasGas: true,
    certs: { eicr: c(1500), gas: c(310), epc: c(2800, false), alarms: c(365), legionella: c(700) },
  },
  {
    id: "cp-beckett", name: "17 Beckett Avenue", locality: "Mansfield NG18",
    landlord: "Mrs Osei", tenant: null, hmo: false, hasGas: true,
    certs: { eicr: c(null), gas: c(null), epc: c(3500, false), alarms: c(null), legionella: c(null) },
  },
];

/** The duties that make the HEADLINE numbers: the big three plus the HMO
 *  set. The quiet duties stay in the drawer — an out-of-date legionella
 *  review is a job, not a siren, and a page that screams about everything
 *  screams about nothing. */
export function headlineCerts(p: CompProperty): CertKey[] {
  return requiredCerts(p).filter((k) => !QUIET_SET.includes(k));
}

/** Every headline certificate that is expired or due inside `days` —
 *  the list the page exists for. Sorted most-urgent first. */
export function dueWithin(days: number, book: CompProperty[] = COMP_BOOK) {
  const out: { p: CompProperty; key: CertKey; cert: Cert | undefined; status: CertStatus }[] = [];
  for (const p of book) {
    for (const key of headlineCerts(p)) {
      const cert = p.certs[key];
      const s = statusOf(cert);
      if (s === "expired" || (s === "urgent" && (cert!.expires ?? 99) <= days)) {
        out.push({ p, key, cert, status: s });
      }
    }
  }
  return out.sort((a, b) => (a.cert?.expires ?? -999) - (b.cert?.expires ?? -999));
}

/** The trades book — who gets the works order. */
export const CONTRACTORS: Record<string, string[]> = {
  electrician: ["M. Fletcher Electrical", "Brightspark NG", "Ohm & Away Ltd"],
  "Gas Safe engineer": ["R. Holt Heating (Gas Safe 512884)", "Notts Boiler Co"],
  "EPC assessor": ["EPC Assessors Notts", "GreenScore Surveys"],
  "fire assessor": ["Midlands Fire Safety", "SafeExit Assessments"],
  "council application": ["Renew with the council"],
  assessor: ["AquaCheck Midlands"],
  "engineer on next visit": ["Fold into the next visit"],
};
