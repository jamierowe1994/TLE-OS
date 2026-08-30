/**
 * The PLC handover: agent → compliance → back to agent.
 *
 * When an application is accepted the file stops being the agent's and becomes
 * a submission. Somebody has to assemble the documents, somebody else has to
 * check them, and the property cannot be let until they say so. Today that
 * happens in email, which is why nobody can answer "where is 41 Harewood up
 * to" without asking Kirstie.
 *
 * ── The one rule that shapes everything here ────────────────────────────────
 *
 * THE SCAN DOES NOT DECIDE. It reads documents and reports what it found -
 * a date, a name, a missing page. Whether a file is compliant is a legal
 * judgement with a person's name against it, and that person is Kirstie. So
 * the model produces FINDINGS, never a verdict, and the case cannot leave
 * review without a human pressing something.
 *
 * That is not caution for its own sake. If the scan could approve, then the
 * day it misreads an expiry we have let a property with an out-of-date gas
 * certificate and the audit trail says a computer decided. The scan exists to
 * make Kirstie faster, not to replace her.
 *
 * ── Checks ──────────────────────────────────────────────────────────────────
 *
 * Taken from what Legal for Landlords actually cover for us (James, 29 Aug),
 * so the OS asks for the same pack we already send them rather than inventing
 * its own list. Two properties matter per check: what document proves it, and
 * whether a machine can say anything useful about it at all.
 */

/* ───────────────────────────── the checks ───────────────────────────────── */

export type CheckId =
  | "landlord-id-aml"
  | "tenant-checks"
  | "guarantor-checks"
  | "gas-safety"
  | "epc"
  | "eicr"
  | "licensing"
  | "tenancy-agreement"
  | "right-to-rent";

export type Check = {
  id: CheckId;
  label: string;
  /** What the agent has to attach for this to be checkable at all. */
  needs: string;
  /**
   * What the scan can genuinely say.
   *
   * `dates`    — it can read an expiry and compare it to the move-in date.
   * `presence` — it can say a document is there and looks like what it claims.
   * `reading`  — it can pull named fields out and flag disagreements.
   * `none`     — a human judgement the model should not be asked to make.
   *
   * Recorded per check so the UI can be honest about which lines the scan
   * actually looked at, rather than implying it understood all nine.
   */
  scan: "dates" | "presence" | "reading" | "none";
  /** Why it is on the list, in the words somebody would use out loud. */
  why: string;
};

export const PLC_CHECKS: Check[] = [
  {
    id: "landlord-id-aml",
    label: "Landlord ID & AML",
    needs: "Photo ID and proof of address for every named owner",
    scan: "reading",
    why: "Money laundering checks are on the agent, not the landlord, and the fine lands here.",
  },
  {
    id: "tenant-checks",
    label: "Tenant checks",
    needs: "Referencing outcome for each tenant",
    scan: "reading",
    why: "Affordability and history, per person on the tenancy rather than per household.",
  },
  {
    id: "guarantor-checks",
    label: "Guarantor checks",
    needs: "Referencing outcome and signed guarantee, where one is required",
    scan: "reading",
    why: "A guarantor who was never referenced is a guarantee nobody can enforce.",
  },
  {
    id: "gas-safety",
    label: "Gas safety",
    needs: "Current CP12, dated within 12 months",
    scan: "dates",
    why: "Must be in date ON the move-in date, not on the day it was uploaded.",
  },
  {
    id: "epc",
    label: "EPC",
    needs: "Certificate rated E or above",
    scan: "dates",
    why: "Below E cannot be let without an exemption, and the exemption is its own document.",
  },
  {
    id: "eicr",
    label: "EICR",
    needs: "Satisfactory report, dated within 5 years",
    scan: "dates",
    why: "An 'unsatisfactory' report with remedial work outstanding is not a pass.",
  },
  {
    id: "licensing",
    label: "Licensing",
    needs: "Selective or HMO licence, where the council requires one",
    scan: "presence",
    why: "Council-by-council and changes without notice, so absence is a question rather than a fail.",
  },
  {
    id: "tenancy-agreement",
    label: "Tenancy agreement",
    needs: "The agreement as it will be signed",
    scan: "reading",
    why: "Names, dates, rent and deposit have to match the rest of the pack.",
  },
  {
    id: "right-to-rent",
    label: "Right to Rent",
    needs: "Share code or original document check for each adult occupier",
    scan: "none",
    why: "A statutory check with a manual step. The model must not be asked to certify it.",
  },
];

export const checkById = (id: CheckId) => PLC_CHECKS.find((c) => c.id === id) ?? null;

/* ───────────────────────────── the states ──────────────────────────────── */

export type PlcState =
  /** The agent is still putting the pack together. Nobody is waiting on us. */
  | "assembling"
  /** Handed to compliance. The agent can no longer change it. */
  | "submitted"
  /** The model is reading the documents. */
  | "scanning"
  /** Findings are in and Kirstie has not looked yet. */
  | "reviewing"
  | "approved"
  /** Something is missing or wrong; it goes back to the agent to fix. */
  | "deferred"
  | "declined";

export const PLC_STATES: { id: PlcState; label: string; who: string; blurb: string }[] = [
  { id: "assembling", label: "Assembling", who: "Agent",
    blurb: "Attaching the pack. Nothing has gone to compliance." },
  { id: "submitted", label: "Submitted", who: "Compliance",
    blurb: "With the PLC team. Locked to the agent from here." },
  { id: "scanning", label: "Scanning", who: "The OS",
    blurb: "Reading the documents for dates and details." },
  { id: "reviewing", label: "Ready to review", who: "Kirstie",
    blurb: "Findings are in. A person decides from here, not the scan." },
  { id: "approved", label: "Approved", who: "Agent",
    blurb: "Cleared. The property can be let." },
  { id: "deferred", label: "Deferred", who: "Agent",
    blurb: "Something is missing. Back to the agent, with the reason." },
  { id: "declined", label: "Declined", who: "Agent",
    blurb: "Not proceeding on this pack." },
];

/**
 * What may follow what.
 *
 * Written as data rather than as ifs scattered through routes, because the
 * expensive mistakes here are ordering ones: a pack approved before it was
 * scanned, or an agent editing documents after submission. A transition that
 * is not in this table cannot happen.
 *
 * `deferred` returns to `assembling` on purpose. A deferral is not an ending,
 * it is the agent's turn again, and giving it its own dead-end state would
 * leave real cases stranded with nowhere to go.
 */
export const PLC_TRANSITIONS: Record<PlcState, PlcState[]> = {
  assembling: ["submitted"],
  submitted: ["scanning", "reviewing"], // scanning is skippable when there is no key
  scanning: ["reviewing"],
  reviewing: ["approved", "deferred", "declined"],
  approved: [],
  deferred: ["assembling"],
  declined: [],
};

export const canMove = (from: PlcState, to: PlcState) =>
  PLC_TRANSITIONS[from]?.includes(to) ?? false;

/** Who is being waited on. The question every board exists to answer. */
export const waitingOn = (s: PlcState) => PLC_STATES.find((x) => x.id === s)?.who ?? "—";

/* ──────────────────────────── the findings ─────────────────────────────── */

export type FindingLevel = "blocker" | "query" | "ok";

export type Finding = {
  checkId: CheckId;
  level: FindingLevel;
  /** One sentence a person can act on. Never "see attached". */
  message: string;
  /** What the model read it from, so Kirstie can go and look at the same page. */
  documentName?: string;
  /** The date it found, where the check is a date check. ISO. */
  foundDate?: string | null;
};

export type PlcCase = {
  id: string;
  /** The application this came from. */
  applicationRef: string;
  address: string;
  agentName: string;
  agentEmail: string;
  state: PlcState;
  submittedAt: string | null;
  /** Documents attached at handover, by check. */
  documents: { checkId: CheckId; name: string; url: string; addedAt: string }[];
  scannedAt: string | null;
  findings: Finding[];
  /** Kirstie's decision, her words, and her name against it. */
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string;
};

/**
 * Is the pack even worth submitting?
 *
 * Checked in the OS before it goes anywhere, because a submission that is
 * obviously short wastes a round trip through a person. Right to Rent is
 * excluded: it is a manual check whose evidence may legitimately live
 * elsewhere, and blocking on it would stop every genuine submission.
 */
export function missingDocuments(c: Pick<PlcCase, "documents">): Check[] {
  const have = new Set(c.documents.map((d) => d.checkId));
  return PLC_CHECKS.filter((k) => k.id !== "right-to-rent" && !have.has(k.id));
}

/** Blockers first, then queries. What Kirstie should read in order. */
export function sortFindings(f: Finding[]): Finding[] {
  const rank: Record<FindingLevel, number> = { blocker: 0, query: 1, ok: 2 };
  return [...f].sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * A one-line summary of the scan, for the board.
 *
 * Deliberately never says "passed". The scan does not pass anything - it
 * reports what it saw, and the sentence has to keep that true even when
 * everything looks fine.
 */
export function scanSummary(f: Finding[]): string {
  const blockers = f.filter((x) => x.level === "blocker").length;
  const queries = f.filter((x) => x.level === "query").length;
  if (blockers) return `${blockers} thing${blockers === 1 ? "" : "s"} to fix before this can be let`;
  if (queries) return `${queries} thing${queries === 1 ? "" : "s"} worth a look`;
  return "Nothing flagged. Still needs your eyes.";
}
