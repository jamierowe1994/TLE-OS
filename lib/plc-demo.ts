import type { Finding, PlcAiSummary, PlcCase, PlcDocument } from "@/lib/plc";
import type { TenantAnswers } from "@/lib/plc-tenant-answers";
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
  warnings: ["Right to Rent is not recorded for every adult applicant. Compliance will ask."],
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

/* ── The full-screen review's sample (23 Oct 2026) ─────────────────────────
   Who is on the let, what the tenants said, and the AI summary, all
   invented, so ?sample=1 on the PLC queue shows the whole screen without
   reading anybody's real details or calling the model. */

export const DEMO_PEOPLE = [
  { key: "sample:landlord", role: "landlord" as const, name: "Pat Example", email: "pat.example@example.com", phone: "07700 900111", address: "2 Elsewhere Road, Leicester LE1 1AA", isPrimary: true },
  { key: "sample:tenant:alex", role: "tenant" as const, name: "Alex Sample", email: "alex.sample@example.com", phone: "07700 900222", address: null, isPrimary: true },
  { key: "sample:tenant:jordan", role: "tenant" as const, name: "Jordan Sample", email: "jordan.sample@example.com", phone: "07700 900333", address: null, isPrimary: false },
];

export const DEMO_ANSWERS: TenantAnswers = {
  from: ["the offer, 20 Oct"],
  let: [
    {
      title: "Terms",
      rows: [
        { label: "Rent, a month", value: "£1,100", copy: "1100" },
        { label: "Move-in date", value: longDate(MOVE_IN), copy: `${MOVE_IN.slice(8, 10)}/${MOVE_IN.slice(5, 7)}/${MOVE_IN.slice(0, 4)}` },
        { label: "Term", value: "12 months", copy: "12" },
        { label: "Pets", value: "No" },
        { label: "Smokers", value: "No" },
      ],
    },
    { title: "Permitted Occupiers", rows: [{ label: "Adults moving in", value: "2" }, { label: "Children moving in", value: "0" }] },
  ],
  people: [
    {
      key: "tenant:alex",
      name: "Alex Sample",
      role: "Lead tenant",
      from: ["their passport, finished 19 Oct"],
      groups: [
        {
          title: "Details",
          rows: [
            { label: "Date of birth", value: "4 March 1994", copy: "04/03/1994" },
            { label: "Email", value: "alex.sample@example.com" },
            { label: "Mobile", value: "07700 900222" },
          ],
        },
        { title: "Work", rows: [{ label: "Employer", value: "Sample Ltd" }, { label: "Income, a year", value: "£34,000", copy: "34000" }] },
      ],
    },
    {
      key: "tenant:jordan",
      name: "Jordan Sample",
      role: "Tenant",
      from: ["their part of the offer, 20 Oct"],
      groups: [{ title: "Details", rows: [{ label: "Date of birth", value: "17 July 1995", copy: "17/07/1995" }, { label: "Email", value: "jordan.sample@example.com" }] }],
    },
  ],
};

export const DEMO_AI_SUMMARY: PlcAiSummary = {
  verdict: "fail",
  headline: "I think this fails on the gas certificate.",
  summary: `A full pack. The landlord's ID, the referencing, the EICR, the licence and the draft agreement are all in order. The gas safety record runs out on ${longDate(GAS_EXPIRES)}, eleven days after the tenants move in, so a new CP12 is needed first.`,
  points: [
    { checkId: "gas-safety", level: "blocker", text: `The gas safety record expires ${longDate(GAS_EXPIRES)}, eleven days into the tenancy. Ask the landlord for a new CP12 before move-in.` },
    { checkId: "epc", level: "query", text: "The EPC is an E: lettable, but worth telling the landlord now." },
  ],
  noise: "The other lines are the reader confirming files it read cleanly.",
  basis: "sample",
  at: hoursAgo(1.8),
  model: "sample",
};
