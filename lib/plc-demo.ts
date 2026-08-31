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

/** Far enough in the future to stay sensible for a while, and obviously round. */
const MOVE_IN = "2026-10-01";

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
  addedAt: "2026-08-29T09:12:00.000Z",
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
    message:
      "The gas safety certificate expires on 12 October 2026, eleven days after the tenants move in. A new CP12 is needed before the tenancy starts.",
    documentName: "Gas safety certificate CP12.pdf",
    foundDate: "2026-10-12",
  },
  {
    checkId: "epc",
    level: "query",
    message:
      "The EPC is rated E. That is lettable, but it is one band off the minimum and worth flagging to the landlord now rather than at renewal.",
    documentName: "EPC certificate.pdf",
    foundDate: "2031-04-02",
  },
  {
    checkId: "eicr",
    level: "ok",
    message: "EICR dated 3 March 2025, satisfactory, valid for five years.",
    documentName: "EICR report.pdf",
    foundDate: "2030-03-03",
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
    scannedAt: null,
    findings: [],
    decidedAt: null,
    decidedBy: null,
    decisionNote: "",
    createdAt: "2026-08-29T09:05:00.000Z",
    ...over,
  };
}

/** The pack as it reaches compliance: submitted, and not yet read. */
export const DEMO_SUBMITTED = demoCase({
  state: "submitted",
  submittedAt: "2026-08-29T09:20:00.000Z",
});

/** The same pack once the reader has been over it. */
export const DEMO_SCANNED = demoCase({
  state: "reviewing",
  submittedAt: "2026-08-29T09:20:00.000Z",
  scannedAt: "2026-08-29T09:21:00.000Z",
  findings: DEMO_FINDINGS,
});

export const DEMO_SUMMARY =
  "Eight documents read. One blocker: the gas certificate runs out eleven days into the tenancy. One query on the EPC band. Everything else is in order.";
