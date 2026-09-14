import type { Finding, PlcCase, PlcDocument } from "@/lib/plc";
import type { Prefill } from "@/lib/plc-prefill";

/**
 * An invented compliance pack, for showing people how the handover works.
 *
 * ── Why it is invented rather than borrowed ───────────────────────────────
 *
 * The PLC screens read live REX data: a real property, a real landlord, real
 * tenants, and a set of certificates belonging to somebody's actual tenancy.
 * That is fine on James's screen and not fine on a link he sends to somebody
 * outside the company. So the public preview gets a case that is about
 * nobody, and every name in it says so.
 *
 * ── The pack is deliberately imperfect ────────────────────────────────────
 *
 * The temptation with a demo is to make everything pass, and it would be the
 * wrong demo. The entire argument for this feature is that the scan reads the
 * documents, finds the thing a person would have missed at four o'clock on a
 * Friday, and then does NOT get to decide - so the pack contains one genuine
 * blocker (a gas certificate that expires eleven days after the tenants move
 * in), one query, and the rest clean. The blocker is the demo.
 *
 * ── Nothing here is stored ────────────────────────────────────────────────
 *
 * These objects are handed to the real components as props. No case is
 * created, no document is uploaded, no decision is recorded, and the preview
 * never calls the PLC API at all.
 */

/**
 * The move-in date, and every date derived from it, ROLL.
 *
 * This was the literal "2026-10-01", which was far enough away when it was
 * written and is a fortnight away now. The whole demonstration rests on a gas
 * certificate that runs out ELEVEN DAYS AFTER the tenants move in - a date in
 * the past turns the blocker into a tenancy that started last month, and the
 * practice run stops teaching the thing it exists to teach. Same trap as the
 * hardcoded month literals that bit the portal: anything a demo asserts about
 * time has to be computed from the time it is read at.
 *
 * The first of the month AFTER next, so it is always three to eight weeks out,
 * always a round date, and it changes once a month rather than once a day.
 * Everything is UTC: this module is imported by client components that Next
 * renders on the server first, and a date built from local time would be one
 * value in the HTML and another after hydration.
 */
function firstOfMonthAfterNext(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1))
    .toISOString()
    .slice(0, 10);
}

/** `iso` plus `days`, as a date string. */
function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const MOVE_IN = firstOfMonthAfterNext();

/** The blocker: present, correct-looking, and eleven days too short. */
const GAS_EXPIRES = plusDays(MOVE_IN, 11);

/**
 * The pack's own clock, also relative.
 *
 * The queue colours a pack by how long it has waited - green inside 48 hours,
 * red past it - so a fixed submitted-at makes every practice run open on a
 * pack that has been sitting there for weeks, and teaches the wrong urgency.
 * This one landed at breakfast: firmly green, with the 48 hours still to run.
 */
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const DEMO_ADDRESS = "14 Sample Street, Northampton NN1 1AA";

export const DEMO_PREFILL: Prefill = {
  applicationRef: "SAMPLE-0001",
  applicationId: "sample-0001",
  listingId: null,
  address: DEMO_ADDRESS,
  locality: "Northampton",
  tenants: [
    { name: "Alex Sample", email: "alex.sample@example.com", isPrimary: true },
    { name: "Jordan Sample", email: "jordan.sample@example.com", isPrimary: false },
  ],
  moveInDate: MOVE_IN,
  agentName: "Sam Partner",
  rentPcm: 1100,
  /* One real warning, because the wizard shows them and a demo where the
     panel is always empty never explains what it is for. */
  warnings: ["Right to Rent is not recorded in REX for every adult applicant."],
};

/** A full pack, as it looks once the agent has attached everything. */
const DOCS: PlcDocument[] = [
  ["landlord-id-aml", "Landlord ID and AML.pdf"],
  ["tenant-checks", "Referencing report - Sample.pdf"],
  ["guarantor-checks", "Guarantor reference.pdf"],
  ["gas-safety", "Gas safety certificate CP12.pdf"],
  ["epc", "EPC certificate.pdf"],
  ["eicr", "EICR report.pdf"],
  ["licensing", "Selective licence.pdf"],
  ["tenancy-agreement", "Tenancy agreement - draft.pdf"],
].map(([checkId, name]) => ({
  checkId: checkId as PlcDocument["checkId"],
  name,
  key: `documents/sample/${name}`,
  url: "#",
  addedAt: hoursAgo(3),
  addedBy: "Sam Partner",
  /* The flag that already exists for exactly this: a name standing in for a
     file, so no screen can ever imply a document is on file when it is not. */
  placeholder: true,
}));

/**
 * What the scan says.
 *
 * The gas certificate is the point of the whole demonstration: it is present,
 * it looks correct, and it runs out eleven days after the tenants move in.
 * Nobody reading nine PDFs at speed catches that, and it is precisely the
 * kind of thing the reader is good at.
 */
export const DEMO_FINDINGS: Finding[] = [
  {
    checkId: "gas-safety",
    level: "blocker",
    message: `The gas safety certificate expires on ${longDate(
      GAS_EXPIRES
    )}, eleven days after the tenants move in. A new CP12 is needed before the tenancy starts.`,
    documentName: "Gas safety certificate CP12.pdf",
    foundDate: GAS_EXPIRES,
  },
  {
    checkId: "epc",
    level: "query",
    message:
      "The EPC is rated E. That is lettable, but it is one band off the minimum and worth flagging to the landlord now rather than at renewal.",
    documentName: "EPC certificate.pdf",
    /* Comfortably valid, so the only date under argument is the gas one. */
    foundDate: plusDays(MOVE_IN, 365 * 5),
  },
  {
    checkId: "eicr",
    level: "ok",
    message: "EICR satisfactory, valid for five years.",
    documentName: "EICR report.pdf",
    foundDate: plusDays(MOVE_IN, 365 * 3),
  },
  {
    checkId: "landlord-id-aml",
    level: "ok",
    message: "Photographic ID and proof of address present, and the names agree.",
    documentName: "Landlord ID and AML.pdf",
  },
  {
    checkId: "tenancy-agreement",
    level: "ok",
    message: "Draft agreement names both applicants and the rent matches the offer.",
    documentName: "Tenancy agreement - draft.pdf",
  },
];

/** The case as it stands at any point in the walkthrough. */
export function demoCase(over: Partial<PlcCase> = {}): PlcCase {
  return {
    id: "plc-SAMPLE-0001",
    applicationRef: "SAMPLE-0001",
    address: DEMO_ADDRESS,
    agentName: "Sam Partner",
    agentEmail: "sam.partner@example.com",
    state: "assembling",
    submittedAt: null,
    documents: DOCS,
    moveInDate: MOVE_IN,
    agentNote:
      "Landlord is abroad until the 20th, so anything needing a signature will take a couple of days.",
    waivers: [],
    scannedAt: null,
    findings: [],
    decidedAt: null,
    decidedBy: null,
    decisionNote: "",
    createdAt: hoursAgo(3.5),
    ...over,
  };
}

/** The pack as it reaches compliance: submitted, and not yet read. */
export const DEMO_SUBMITTED = demoCase({
  state: "submitted",
  submittedAt: hoursAgo(2),
});

/** The same pack once the reader has been over it. */
export const DEMO_SCANNED = demoCase({
  state: "reviewing",
  submittedAt: hoursAgo(2),
  scannedAt: hoursAgo(1.9),
  findings: DEMO_FINDINGS,
});

export const DEMO_SUMMARY =
  "Eight documents read. One blocker: the gas certificate runs out eleven days into the tenancy. One query on the EPC band. Everything else is in order.";
