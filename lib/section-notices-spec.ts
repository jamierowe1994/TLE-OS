/**
 * SECTION 13 AND SECTION 8, AS MICHAEL WROTE THEM (7 Oct 2026).
 *
 * Michael sent two Word documents, "Section 13 Rent Increase Pre Approval
 * Checklist" and "Section 8 Possession Notice Pre Approval Checklist". James:
 * "we want to convert that doc file into a process" - the agent fills the
 * checklist in on the home's file, it goes to Michael's Sections tab, he
 * approves it or sends it back, and he serves it through PayProp by hand.
 *
 * Every line below is his wording, in his order, so the screen, his review
 * and the PDF he downloads all read the same as the paper. Client-safe: the
 * form, the desk and the server all read it, and the server re-checks
 * `missingFor` before it will take a submission.
 *
 * ── Kinds of line ─────────────────────────────────────────────────────────
 *
 *   check    a box the agent ticks, by hand, one at a time. Required unless
 *            the section says "where applicable".
 *   field    a value on the line (a date, a sum, some words). Header fields
 *            and a few others arrive filled in from the home's record and can
 *            be overwritten.
 *   risk     section 4 of the Section 8: tick any that apply. Not ticking is
 *            not the same as saying none apply, so the agent says one or the
 *            other, and any tick needs the details written underneath.
 *
 * A check can carry `evidence`: the line says a document is uploaded or
 * attached, so a file goes against that line and the tick waits for it.
 */

export type NoticeKind = "s13" | "s8";

export const KINDS: NoticeKind[] = ["s13", "s8"];
export const isKind = (k: unknown): k is NoticeKind => k === "s13" || k === "s8";

export type FieldType = "text" | "date" | "money" | "longtext";

export interface CheckLine {
  type: "check";
  id: string;
  label: string;
  /** A file goes against this line before it can be ticked. */
  evidence?: boolean;
  /** "Where applicable" lines: tick it or leave it. */
  optional?: boolean;
}

export interface FieldLine {
  type: "field";
  id: string;
  label: string;
  input: FieldType;
  optional?: boolean;
  /** Worked out from other fields rather than typed. */
  computed?: boolean;
}

export type Line = CheckLine | FieldLine;

export interface Section {
  id: string;
  title: string;
  /** Under the heading, in Michael's words. */
  note?: string;
  lines: Line[];
  /** Section 4 of the Section 8: tick any that apply, or say none do. */
  risk?: boolean;
}

export interface Spec {
  kind: NoticeKind;
  /** "Section 13" */
  short: string;
  /** What the agent's button says. */
  button: string;
  /** Michael's title, as on his document. */
  title: string;
  /** Plain words for the agent: what this is for. */
  purpose: string;
  /** The form the notice itself is served on. */
  form: string;
  intro: string;
  sections: Section[];
  /** The agent declaration. Every line is required. */
  declaration: CheckLine[];
  /** Compliance use only. Every line is required to approve. */
  compliance: CheckLine[];
  decisions: Decision[];
  /** After it is served, Section 8 only. */
  postService: CheckLine[];
  footer: string[];
}

export type Decision = "approved" | "returned" | "legal" | "declined";

export const DECISION_LABEL: Record<Decision, string> = {
  approved: "Approved to serve",
  returned: "Returned - further information required",
  legal: "Referred for legal review",
  declined: "Declined - do not serve",
};

/** The header every notice opens with. Filled in from the home, overwritable. */
export const HEADER: FieldLine[] = [
  { type: "field", id: "address", label: "Property address", input: "text" },
  { type: "field", id: "landlord", label: "Landlord", input: "text" },
  { type: "field", id: "tenants", label: "Tenant(s)", input: "text" },
  { type: "field", id: "agent", label: "Agent", input: "text" },
  { type: "field", id: "submitted", label: "Date submitted", input: "date" },
];

const c = (id: string, label: string, extra: Partial<CheckLine> = {}): CheckLine => ({ type: "check", id, label, ...extra });
const f = (id: string, label: string, input: FieldType, extra: Partial<FieldLine> = {}): FieldLine => ({ type: "field", id, label, input, ...extra });

export const S13: Spec = {
  kind: "s13",
  short: "Section 13",
  button: "Rent review",
  title: "Section 13 Rent Increase Pre Approval Checklist",
  purpose: "A rent increase on a periodic tenancy.",
  form: "Form 4A",
  intro: "Agent to complete and upload the supporting evidence before Compliance approval. Do not serve the notice until approval has been received.",
  sections: [
    {
      id: "tenancy",
      title: "Tenancy Checks",
      lines: [
        c("details_checked", "Correct property and tenant details have been checked."),
        c("agreement_on_file", "Current tenancy agreement is held on file.", { evidence: true }),
        c("start_checked", "Tenancy commencement date has been checked."),
        f("tenancy_start", "Tenancy start date", "date"),
        c("eligible", "I have confirmed the tenancy is eligible for a Section 13 rent increase."),
        c("not_first_12", "The proposed increase will not take effect within the first 12 months of the tenancy."),
        c("twelve_since_last", "At least 12 months will have passed since the last rent increase took effect."),
        f("last_increase", "Last rent increase date if applicable", "date", { optional: true }),
      ],
    },
    {
      id: "rent",
      title: "Rent Checks",
      lines: [
        f("current_rent", "Current monthly rent £", "money"),
        f("proposed_rent", "Proposed monthly rent £", "money"),
        f("increase", "Proposed increase £", "money", { computed: true }),
        f("new_rent_start", "Proposed new rent start date", "date"),
        c("landlord_instructed", "Landlord has instructed us in writing to increase the rent."),
        c("instruction_filed", "A copy of the landlord's instruction has been uploaded/filed.", { evidence: true }),
        c("market_checked", "Proposed rent has been checked against current market rent."),
        c("comparables", "Comparable properties/market evidence have been provided where appropriate.", { evidence: true }),
        c("confirmed_with_landlord", "Proposed rent and effective date have been confirmed with the landlord."),
      ],
    },
    {
      id: "notice",
      title: "Notice Checks",
      lines: [
        c("form_4a", "Correct current prescribed Section 13 Form 4A will be used."),
        c("two_months", "At least 2 months' notice will be provided."),
        c("names_correct", "All tenant names are correct."),
        c("address_correct", "Property address is correct."),
        c("current_rent_correct", "Current rent is correct."),
        c("new_rent_correct", "Proposed new rent is correct."),
        c("effective_date_checked", "Effective date has been checked."),
        c("service_method_checked", "Proposed method of service has been checked against the tenancy agreement."),
      ],
    },
  ],
  declaration: [
    c("d_checks", "I confirm that I have completed the above checks."),
    c("d_accurate", "I confirm that the information provided is accurate to the best of my knowledge."),
    c("d_uploaded", "All supporting documents have been uploaded to the property file."),
    c("d_not_served", "I have NOT served the Section 13 notice on the tenant."),
    c("d_understand", "I understand that the notice must not be served until Compliance approval has been received."),
  ],
  compliance: [
    c("k_tenancy", "Tenancy checked"),
    c("k_rent_history", "Rent history checked"),
    c("k_authority", "Landlord authority checked"),
    c("k_eligibility", "Eligibility checked"),
    c("k_12_month", "12 month restriction checked"),
    c("k_notice_period", "Required notice period checked"),
    c("k_form_4a", "Form 4A checked"),
    c("k_effective", "Effective date checked"),
    c("k_evidence", "Supporting evidence checked"),
  ],
  decisions: ["approved", "returned", "declined"],
  postService: [],
  footer: ["Any material amendment to an approved notice must be returned to Compliance for reapproval before service."],
};

export const S8: Spec = {
  kind: "s8",
  short: "Section 8",
  button: "Serve notice",
  title: "Section 8 Possession Notice Pre Approval Checklist",
  purpose: "Seeking possession of the home on one or more grounds.",
  form: "Form 3A",
  intro: "Agent to complete and upload the supporting evidence before Compliance approval. Do not serve the notice until approval has been received.",
  sections: [
    {
      id: "tenancy",
      title: "Tenancy and Property Checks",
      lines: [
        c("details_checked", "Correct property and tenant details have been checked."),
        c("agreement_on_file", "Signed tenancy agreement is held on file.", { evidence: true }),
        c("variations_on_file", "Any renewals/variations/addendums are held on file."),
        f("tenancy_start", "Tenancy start date", "date"),
        c("landlord_details", "Landlord's current details have been checked."),
        c("landlord_instructed", "Landlord has instructed us in writing to seek possession."),
        c("instruction_uploaded", "Written landlord instruction has been uploaded.", { evidence: true }),
        c("deposit_checked", "Deposit records have been checked where applicable."),
        c("licensing_checked", "Property licensing requirements have been checked."),
        c("safety_checked", "Relevant property safety/compliance records have been checked."),
      ],
    },
    {
      id: "ground",
      title: "Section 8 Ground",
      lines: [
        f("grounds", "Ground(s) being relied upon", "text"),
        f("reason", "Reason possession is being sought", "longtext"),
        c("grounds_apply", "I have checked that the selected ground(s) apply to this tenancy."),
        c("evidence_supplied", "I have supplied evidence supporting each ground being relied upon."),
        c("notice_period_checked", "I have checked the current statutory notice period applicable to the selected ground(s)."),
      ],
    },
    {
      id: "evidence",
      title: "Evidence",
      note: "Where applicable",
      lines: [
        c("rent_statement", "Full rent statement/ledger attached.", { evidence: true, optional: true }),
        c("statement_accurate", "Rent statement has been checked for accuracy.", { optional: true }),
        c("payments_allocated", "Payments received have been correctly allocated.", { optional: true }),
        c("arrears_checked", "Arrears amount has been independently checked.", { optional: true }),
        f("arrears", "Current arrears £", "money", { optional: true }),
        c("correspondence", "Tenant correspondence attached.", { evidence: true, optional: true }),
        c("reminders", "Previous arrears reminders/warnings attached.", { evidence: true, optional: true }),
        c("inspections", "Inspection reports attached.", { evidence: true, optional: true }),
        c("photos", "Photographic evidence attached.", { evidence: true, optional: true }),
        c("breach", "Evidence of tenancy breach attached.", { evidence: true, optional: true }),
        c("witness", "Witness/contractor reports attached where relevant.", { evidence: true, optional: true }),
        c("landlord_evidence", "Landlord evidence/instructions attached.", { evidence: true, optional: true }),
        c("other_evidence", "Any other evidence supporting the ground has been uploaded.", { evidence: true, optional: true }),
      ],
    },
    {
      id: "risk",
      title: "Important Risk Check",
      note: "Does ANY of the following apply? Tick any that apply and provide details.",
      risk: true,
      lines: [
        c("r_repairs", "Outstanding repairs", { optional: true }),
        c("r_disrepair", "Tenant has reported disrepair", { optional: true }),
        c("r_complaint", "Formal tenant complaint", { optional: true }),
        c("r_council", "Council/local authority involvement", { optional: true }),
        c("r_env_health", "Environmental Health involvement", { optional: true }),
        c("r_deposit_dispute", "Deposit dispute", { optional: true }),
        c("r_deposit_protection", "Deposit protection issue", { optional: true }),
        c("r_disputes_arrears", "Tenant disputes the arrears", { optional: true }),
        c("r_disputes_breach", "Tenant disputes the alleged breach", { optional: true }),
        c("r_breathing_space", "Breathing Space / debt respite notification", { optional: true }),
        c("r_vulnerability", "Tenant vulnerability or safeguarding concern", { optional: true }),
        c("r_discrimination", "Discrimination/equality concern", { optional: true }),
        c("r_legal", "Ongoing legal dispute", { optional: true }),
        c("r_other", "Other matter that could affect possession proceedings", { optional: true }),
        f("risk_details", "Risk check details", "longtext", { optional: true }),
      ],
    },
    {
      id: "prep",
      title: "Notice Preparation",
      lines: [
        c("form_3a", "Correct current prescribed Section 8 Form 3A will be used."),
        c("names_checked", "All tenant names have been checked."),
        c("address_checked", "Property address has been checked."),
        c("grounds_stated", "Ground(s) have been correctly stated."),
        c("particulars", "Supporting particulars accurately explain why the ground applies."),
        c("period_identified", "Correct notice period has been identified for the ground(s)."),
        c("earliest_date", "Earliest permitted possession/proceedings date has been checked."),
        c("service_method", "Proposed method of service has been checked."),
      ],
    },
  ],
  declaration: [
    c("d_reviewed", "I confirm that I have reviewed the tenancy and property file."),
    c("d_supported", "I confirm that the ground(s) selected are supported by the evidence supplied."),
    c("d_accurate", "I confirm that the information submitted is accurate to the best of my knowledge."),
    c("d_uploaded", "All supporting documents have been uploaded."),
    c("d_not_served", "I have NOT served the Section 8 notice."),
    c("d_no_promise", "I have not promised the landlord that a notice will be served before Compliance approval."),
    c("d_understand", "I understand that Compliance approval is required before service."),
  ],
  compliance: [
    c("k_tenancy_docs", "Tenancy documentation checked"),
    c("k_instruction", "Landlord instruction checked"),
    c("k_grounds", "Ground(s) checked"),
    c("k_evidence", "Evidence checked"),
    c("k_rent_statement", "Rent statement independently checked where applicable"),
    c("k_property_issues", "Compliance/property issues reviewed"),
    c("k_repairs", "Repairs/complaints reviewed"),
    c("k_deposit", "Deposit position reviewed"),
    c("k_notice_period", "Correct notice period confirmed"),
    c("k_form_3a", "Form 3A checked"),
    c("k_service", "Proposed service method checked"),
  ],
  decisions: ["approved", "returned", "legal", "declined"],
  postService: [
    c("p_final_notice", "Copy of final notice uploaded", { evidence: true }),
    c("p_date_served", "Date served recorded"),
    c("p_method", "Method of service recorded"),
    c("p_proof", "Proof of service uploaded", { evidence: true }),
    c("p_expiry_diarised", "Notice expiry/relevant date diarised"),
    c("p_follow_up", "Follow up review diarised"),
  ],
  footer: [
    "Any material amendment to an approved notice must be returned to Compliance for reapproval before service.",
    "Approval to serve a Section 8 notice does not constitute automatic approval to commence possession proceedings. The file must be reviewed again before court action is started.",
  ],
};

export const SPECS: Record<NoticeKind, Spec> = { s13: S13, s8: S8 };

/** "None of these apply" on the Section 8 risk check. */
export const NO_RISKS = "r_none";

/* ------------------------------------------------------------ answers -- */

export interface Answers {
  /** Header and line fields, by id. Money is kept as typed ("1,250.00"). */
  fields: Record<string, string>;
  /** Ticked lines, by id. */
  checks: Record<string, boolean>;
  /** The agent's typed name as their signature. */
  signature: string;
  /**
   * Fields still as the home's record filled them in. Typing over one takes
   * it off, so Michael can see what the agent changed, and "Date submitted"
   * left alone becomes the day it is actually submitted.
   */
  auto: string[];
}

export const emptyAnswers = (): Answers => ({ fields: {}, checks: {}, signature: "", auto: [] });

/** Whatever was stored, as a whole Answers: old rows and bad input never throw. */
export function asAnswers(v: unknown): Answers {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Answers>;
  const fields: Record<string, string> = {};
  for (const [k, x] of Object.entries(o.fields ?? {})) if (typeof x === "string" || typeof x === "number") fields[k.slice(0, 60)] = String(x).slice(0, 4000);
  const checks: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(o.checks ?? {})) if (x === true) checks[k.slice(0, 60)] = true;
  return {
    fields,
    checks,
    signature: typeof o.signature === "string" ? o.signature.slice(0, 120) : "",
    auto: Array.isArray(o.auto) ? o.auto.filter((x): x is string => typeof x === "string").slice(0, 40) : [],
  };
}

export interface Review {
  checks: Record<string, boolean>;
  decision: Decision | null;
  comments: string;
}

export interface PostService {
  checks: Record<string, boolean>;
  servedOn: string;
  method: string;
}

/** "£1,250.50" or "1250.5" → 1250.5. Null when it is not a sum. */
export function money(v: string | undefined | null): number | null {
  const s = String(v ?? "").replace(/[£,\s]/g, "");
  if (!s || !/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export const pounds = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** The proposed increase, worked out rather than typed. */
export function increaseOf(a: Answers): number | null {
  const cur = money(a.fields.current_rent);
  const next = money(a.fields.proposed_rent);
  return cur == null || next == null ? null : Math.round((next - cur) * 100) / 100;
}

export const allChecks = (s: Spec): CheckLine[] => s.sections.flatMap((x) => x.lines.filter((l): l is CheckLine => l.type === "check"));
export const allFields = (s: Spec): FieldLine[] => s.sections.flatMap((x) => x.lines.filter((l): l is FieldLine => l.type === "field"));

/**
 * What still stands between the agent and Submit, in the order it appears.
 * `files` is how many files sit against each evidence line. The same answer
 * on the screen and on the server, so a submission the screen allowed is
 * never refused and one it refused is never taken.
 */
export function missingFor(spec: Spec, a: Answers, files: Record<string, number>): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const has = (id: string) => (a.fields[id] ?? "").trim().length > 0;

  for (const h of HEADER) if (!has(h.id)) out.push({ id: h.id, label: h.label });

  for (const sec of spec.sections) {
    if (sec.risk) {
      const ticked = sec.lines.filter((l) => l.type === "check" && a.checks[l.id]);
      if (!ticked.length && !a.checks[NO_RISKS]) out.push({ id: NO_RISKS, label: "Risk check: tick any that apply, or None of these apply" });
      if (ticked.length && !has("risk_details")) out.push({ id: "risk_details", label: "Risk check details" });
      continue;
    }
    for (const l of sec.lines) {
      if (l.type === "field") {
        if (l.computed) continue;
        if (l.input === "money" && has(l.id) && money(a.fields[l.id]) == null) out.push({ id: l.id, label: `${l.label} is not a sum of money` });
        else if (!l.optional && !has(l.id)) out.push({ id: l.id, label: l.label.replace(/ £$/, "") });
        continue;
      }
      if (l.evidence && a.checks[l.id] && !(files[l.id] > 0)) out.push({ id: l.id, label: `Attach the file for: ${l.label}` });
      else if (!l.optional && !a.checks[l.id]) out.push({ id: l.id, label: l.label });
    }
  }
  /* The arrears figure, once any rent line is ticked. */
  if (spec.kind === "s8" && ["rent_statement", "arrears_checked"].some((id) => a.checks[id]) && !has("arrears")) {
    out.push({ id: "arrears", label: "Current arrears" });
  }
  for (const l of spec.declaration) if (!a.checks[l.id]) out.push({ id: l.id, label: l.label });
  if (!a.signature.trim()) out.push({ id: "signature", label: "Signature (type your full name)" });
  return out;
}

/* ------------------------------------------------------------- dates -- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export const todayIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/**
 * Plain date sums the Section 13 can be checked against, said as warnings
 * rather than refusals: Michael decides, and the agent may know something the
 * dates do not (a renewal the record does not show, say). Today is read when
 * asked, never fixed, so the warning moves with the calendar.
 */
export function s13Warnings(a: Answers, today = todayIso()): string[] {
  const out: string[] = [];
  const start = a.fields.tenancy_start;
  const eff = a.fields.new_rent_start;
  const last = a.fields.last_increase;
  if (ISO.test(eff ?? "")) {
    if (eff < addMonths(today, 2)) out.push("The new rent starts less than 2 months from today. A notice served now cannot give 2 months.");
    if (ISO.test(start ?? "") && eff < addMonths(start, 12)) out.push("The new rent would start inside the first 12 months of the tenancy.");
    if (ISO.test(last ?? "") && eff < addMonths(last, 12)) out.push("The new rent would start less than 12 months after the last increase.");
  }
  const inc = increaseOf(a);
  if (inc != null && inc <= 0) out.push("The proposed rent is not more than the current rent.");
  return out;
}

export const dayLabel = (iso: string | null | undefined) => {
  if (!iso || !ISO.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

/* ------------------------------------------------------------ states -- */

export type NoticeStatus = "draft" | "submitted" | "approved" | "returned" | "legal" | "declined" | "served" | "withdrawn";

export const STATUS_LABEL: Record<NoticeStatus, string> = {
  draft: "Draft",
  submitted: "With compliance",
  approved: "Approved to serve",
  returned: "Returned to you",
  legal: "Referred for legal review",
  declined: "Declined - do not serve",
  served: "Served",
  withdrawn: "Withdrawn",
};

/** The agent may still change it: never once it is with Michael or decided. */
export const agentCanEdit = (s: NoticeStatus) => s === "draft" || s === "returned";

/* ------------------------------------------------------------ shapes -- */

export interface NoticeFile {
  id: string;
  lineId: string;
  side: "agent" | "compliance";
  name: string;
  mime: string;
  sizeBytes: number;
  byName: string;
  at: string;
  url: string;
  key: string;
}

export interface HistoryStep {
  at: string;
  by: string;
  what: string;
  note?: string;
}

export interface Notice {
  id: string;
  kind: NoticeKind;
  status: NoticeStatus;
  listingId: string;
  propertyId: string | null;
  propertyLabel: string;
  answers: Answers;
  review: Review;
  postService: PostService;
  history: HistoryStep[];
  agentId: string;
  agentName: string;
  agentEmail: string;
  test: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string;
  servedAt: string | null;
  files: NoticeFile[];
}
