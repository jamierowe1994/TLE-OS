/**
 * PLC — pre-let compliance, brought in-house.
 *
 * Today an agent fills in a JotForm, a Power Automate flow fans it out, and
 * Kirstie or Mike reads every document by hand. This is the model that
 * replaces it: an agent submits, an AI reads the documents, and **a person
 * gives the pass or the fail.**
 *
 * The shape is lifted from Fine & Country's compliance review, which has been
 * running against real AML documents for months. Four of its decisions are
 * worth stating plainly, because each one is the difference between a tool
 * people trust and a tool people route around.
 *
 * ── 1. THE MODEL DOES NOT PRODUCE THE VERDICT ─────────────────────────────
 *
 * The AI extracts FACTS and flags CONCERNS. `deriveStatus()` below is ordinary
 * code, and it is the only thing that decides. A model that both reads the
 * evidence and returns the answer gives you a verdict nobody can audit and
 * that changes when the prompt changes.
 *
 * ── 2. ITS OUTPUT IS CLAMPED BEFORE IT IS USED ────────────────────────────
 *
 * Measured on their live system: the model invents check names that were never
 * in the schema, and rates a MISSING or IRRELEVANT document as high fraud
 * risk. Both are wrong in the same expensive direction. So unknown checks are
 * dropped, and only checks that can actually evidence tampering may push the
 * risk up. A document in the wrong name is "please clarify", never "forgery".
 *
 * ── 3. RECORDS ARE CHAINED, NEVER EDITED ──────────────────────────────────
 *
 * A re-run or an amendment creates a NEW review pointing at the old one. This
 * is a compliance artefact — the audit trail is the product, and overwriting
 * it destroys the only thing that makes a pass defensible later.
 *
 * ── 4. A FAILED DOCUMENT IS RECORDED, NOT SKIPPED ─────────────────────────
 *
 * If a document cannot be read, that is stored on the review with the reason.
 * Silently skipping it produces a clean-looking pass over evidence nobody
 * actually checked, which is the worst outcome available.
 */

/* ── what PLC requires ────────────────────────────────────────────────────── */

export const PLC_ITEMS = [
  { id: "right_to_rent", label: "Right to Rent", who: "tenant", statutory: true },
  { id: "gas", label: "Gas safety (CP12)", who: "property", statutory: true },
  { id: "eicr", label: "EICR", who: "property", statutory: true },
  { id: "epc", label: "EPC", who: "property", statutory: true },
  { id: "licence", label: "Licence (HMO/selective)", who: "property", statutory: false },
  { id: "deposit_scheme", label: "Deposit registered", who: "tenancy", statutory: true },
  { id: "tenancy_agreement", label: "Tenancy agreement signed", who: "tenancy", statutory: false },
  { id: "id_check", label: "Tenant ID", who: "tenant", statutory: true },
] as const;

export type PlcItemId = (typeof PLC_ITEMS)[number]["id"];

/* ── what the model is allowed to say ─────────────────────────────────────── */

/**
 * The ONLY authenticity checks that exist.
 *
 * Anything the model returns outside this list is discarded. It does invent
 * names — "name_mismatch", "document_relevance" — and each invented check is
 * an unreviewable claim about a real person's paperwork.
 */
export const CANONICAL_CHECKS = [
  "metadata",
  "arithmetic",
  "date_sequence",
  "font_layout",
  "redaction",
  "scan_artefact",
] as const;
export type CheckName = (typeof CANONICAL_CHECKS)[number];

/**
 * Checks that can, on their own, justify HIGH risk.
 *
 * Metadata and date sequence are circumstantial — a scan can have odd metadata
 * for a dozen innocent reasons. Arithmetic that doesn't add up, a font that
 * changes mid-line, a redaction, a splice: those are tampering signals.
 */
export const HIGH_CAPABLE_CHECKS: CheckName[] = [
  "arithmetic",
  "font_layout",
  "redaction",
  "scan_artefact",
];

export type Risk = "low" | "medium" | "high";
export type Concern = { check: CheckName; risk: Risk; note: string };

export interface DocumentRead {
  itemId: PlcItemId;
  filename: string;
  /** Null when the document could not be read at all. */
  extracted: {
    documentType: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
    subjectName: string | null;
  } | null;
  concerns: Concern[];
  /** Set when reading failed. The document is still listed — never dropped. */
  error: string | null;
}

/**
 * Clamp what the model returned before anything reads it.
 *
 * Three rules, each from a real failure:
 *   • unknown check names are dropped — they are unauditable
 *   • a check that cannot evidence tampering is capped at medium
 *   • no surviving concerns means low, not "unknown" — an empty list is an
 *     answer, and leaving it undefined made callers invent one
 */
export function clampConcerns(raw: unknown): Concern[] {
  if (!Array.isArray(raw)) return [];
  const out: Concern[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const check = (c as { check?: unknown }).check;
    if (typeof check !== "string") continue;
    if (!CANONICAL_CHECKS.includes(check as CheckName)) continue; // invented
    const name = check as CheckName;
    let risk = (c as { risk?: unknown }).risk;
    if (risk !== "low" && risk !== "medium" && risk !== "high") risk = "low";
    // Circumstantial checks cannot reach high on their own.
    if (risk === "high" && !HIGH_CAPABLE_CHECKS.includes(name)) risk = "medium";
    out.push({
      check: name,
      risk: risk as Risk,
      note: String((c as { note?: unknown }).note ?? "").slice(0, 400),
    });
  }
  return out;
}

/* ── the verdict, decided in code ─────────────────────────────────────────── */

export type PlcStatus = "clear" | "needs_review" | "high_risk";

export interface ItemState {
  itemId: PlcItemId;
  label: string;
  statutory: boolean;
  present: boolean;
  /** Days until expiry at the tenancy start. Negative = expired by then. */
  daysAtStart: number | null;
  readError: string | null;
  concerns: Concern[];
}

/**
 * The verdict. Ordinary code, deliberately — see the header.
 *
 * `high_risk` requires a genuine tampering signal. A missing document is
 * `needs_review`: it is an incomplete file, not a suspected fraud, and
 * conflating the two teaches people to ignore the flag.
 */
export function deriveStatus(items: ItemState[]): PlcStatus {
  const anyHigh = items.some((i) => i.concerns.some((c) => c.risk === "high"));
  if (anyHigh) return "high_risk";

  const missingStatutory = items.some((i) => i.statutory && !i.present);
  const expiredAtStart = items.some((i) => i.daysAtStart != null && i.daysAtStart < 0);
  const unread = items.some((i) => i.readError);
  const anyMedium = items.some((i) => i.concerns.some((c) => c.risk === "medium"));

  if (missingStatutory || expiredAtStart || unread || anyMedium) return "needs_review";
  return "clear";
}

/** Why, in the words a person would use. Shown beside the status so nobody
 *  has to guess what the machine objected to. */
export function explainStatus(items: ItemState[]): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (i.readError) out.push(`${i.label}: could not be read — ${i.readError}`);
    else if (i.statutory && !i.present) out.push(`${i.label}: missing, and it is required.`);
    else if (i.daysAtStart != null && i.daysAtStart < 0) {
      out.push(`${i.label}: expires before the tenancy starts.`);
    }
    for (const c of i.concerns) {
      if (c.risk !== "low") out.push(`${i.label}: ${c.check} — ${c.note}`);
    }
  }
  return out;
}

/* ── the human decision ───────────────────────────────────────────────────── */

export type Decision = "passed" | "more_evidence" | "refused";

export interface SignOff {
  decision: Decision;
  reviewer: string;
  /** Mandatory. A pass with no reasoning is not a review. */
  rationale: string;
  at: string;
}

export interface PlcReview {
  id: string;
  applicationId: string;
  propertyId: string | null;
  tenancyStart: string | null;
  submittedBy: string;
  submittedAt: string;
  documents: DocumentRead[];
  items: ItemState[];
  aiStatus: PlcStatus;
  aiExplains: string[];
  /** Set only by a person. Until then this review is pending. */
  signOff: SignOff | null;
  /** Once signed off, the record is closed. An amendment chains a new one. */
  locked: boolean;
  /** The review this supersedes, if any. The audit trail is the product. */
  previousReviewId: string | null;
}

/**
 * Can this be signed off, and by whom.
 *
 * The AI verdict is fully overridable — a reviewer may pass a `high_risk` file
 * if they know something the documents don't say. What they may NOT do is pass
 * it silently: a rationale is required, and a pass over an AI high-risk flag
 * should read differently in the audit trail from an ordinary one.
 */
export function signOffProblems(review: PlcReview, s: Omit<SignOff, "at">): string[] {
  const errs: string[] = [];
  if (review.locked) errs.push("This review is already signed off. Re-run it to amend.");
  if (!s.reviewer.trim()) errs.push("Reviewer name is required.");
  if (!s.rationale.trim()) errs.push("A rationale is required — a pass with no reasoning is not a review.");
  if (s.decision === "passed" && review.aiStatus === "high_risk" && s.rationale.trim().length < 40) {
    errs.push(
      "Passing a file flagged high risk needs more than a line — say what you checked that the documents don't show."
    );
  }
  return errs;
}
