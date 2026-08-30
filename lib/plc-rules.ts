import type { CheckId, Finding } from "@/lib/plc";

/**
 * What makes a document pass, fail, or need a person.
 *
 * ── The split that makes this trustworthy ──────────────────────────────────
 *
 * The model EXTRACTS. This file DECIDES.
 *
 * Asking a model "is this compliant" produces a judgement that cannot be
 * audited, cannot be tested, and quietly changes when the model changes. Ask
 * it instead "what expiry date is printed on this" and you get a fact - one
 * you can check by opening the document, and one a rule can act on.
 *
 * So everything below is ordinary code operating on extracted facts. Given the
 * same facts it returns the same verdict every time, the reason is a sentence
 * naming the rule, and when Kirstie disagrees the fix is a line here rather
 * than a prompt nobody can reason about.
 *
 * ── Three outcomes, not two ────────────────────────────────────────────────
 *
 * "Pass or fail" is the natural way to ask for this and the wrong shape to
 * build. The dangerous case is not the certificate that is clearly expired -
 * it is the one where a field was blank, or illegible, or the model was not
 * sure. Forced into two buckets that becomes a pass, because nothing is
 * obviously wrong with it.
 *
 * So a missing fact returns REVIEW, never PASS. A pass has to be positively
 * earned by facts that are actually present.
 */

/* ─────────────────────────────── the facts ─────────────────────────────── */

/**
 * What the reader is asked to pull off a document.
 *
 * Deliberately one flat shape for every check rather than a type per
 * certificate. The reader fills what it can see and leaves the rest null, and
 * the rules below only consult the fields their own check cares about. A
 * per-check shape would mean a per-check tool schema, and nine schemas drift.
 */
export type DocFacts = {
  /** What the document actually is, in its own words. */
  documentType: string | null;
  /** Does it appear to be the certificate this check asked for? */
  isExpectedType: "yes" | "no" | "unclear";
  issueDate: string | null;
  /** The expiry as PRINTED. Never derived - see the rules for why. */
  expiryDate: string | null;
  /** Whether the reader derived the expiry rather than reading it. */
  expiryWasDerived: boolean;
  addressOnDocument: string | null;
  addressMatches: "yes" | "no" | "unclear";
  /** The overall result printed on it, where the certificate has one. */
  outcome: "satisfactory" | "unsatisfactory" | "not stated" | "other";
  /** EPC only: the letter band. */
  ratingLetter: string | null;
  /** Anything the certificate itself flags as outstanding, at risk, or a
   *  defect - C1/C2/FI on an EICR, "at risk" on a CP12. */
  outstandingDefects: string[];
  /** Signed, dated and complete on its face. */
  signed: "yes" | "no" | "unclear";
  /** Everybody the document names, for the checks that are about people. */
  peopleNamed: string[];
};

export const EMPTY_FACTS: DocFacts = {
  documentType: null,
  isExpectedType: "unclear",
  issueDate: null,
  expiryDate: null,
  expiryWasDerived: false,
  addressOnDocument: null,
  addressMatches: "unclear",
  outcome: "not stated",
  ratingLetter: null,
  outstandingDefects: [],
  signed: "unclear",
  peopleNamed: [],
};

/* ────────────────────────────── the verdict ────────────────────────────── */

export type Verdict = "pass" | "fail" | "review";

export type RuleResult = {
  verdict: Verdict;
  /** Which rule fired, in the words that go on the screen. */
  reasons: { verdict: Verdict; rule: string; because: string }[];
};

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Whole days from a to b. Both are plain dates, so no clocks and no zones. */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * How close to the move-in date an expiry may fall before it is worth saying
 * something. Not a failure - a certificate valid on the day is valid - but a
 * tenancy that starts eleven days before the gas cert runs out is a chase
 * nobody has booked yet, and the point of reading these is to see it early.
 */
const TIGHT_DAYS = 30;

/* ──────────────────────────────── the rules ────────────────────────────── */

/**
 * Rules shared by every check, applied first.
 *
 * These are the ones that make a document the wrong document, and they matter
 * more than the check-specific ones: a perfectly valid EICR filed against the
 * gas safety check would otherwise sail through on dates alone.
 */
function universal(f: DocFacts, moveInDate: string | null): RuleResult["reasons"] {
  const out: RuleResult["reasons"] = [];

  if (f.isExpectedType === "no") {
    out.push({
      verdict: "fail",
      rule: "Wrong document",
      because: `this looks like ${f.documentType ?? "something else"}, not what this check asks for.`,
    });
  } else if (f.isExpectedType === "unclear") {
    out.push({
      verdict: "review",
      rule: "Document type unclear",
      because: "I could not tell what this document is.",
    });
  }

  if (f.addressMatches === "no") {
    out.push({
      verdict: "fail",
      rule: "Wrong property",
      because: `it is for ${f.addressOnDocument ?? "a different address"}, not this property.`,
    });
  } else if (f.addressMatches === "unclear") {
    out.push({
      verdict: "review",
      rule: "Address not confirmed",
      because: "I could not match the address on it to the property.",
    });
  }

  if (f.signed === "no") {
    out.push({
      verdict: "fail",
      rule: "Not signed",
      because: "it is not signed, and an unsigned certificate is not a certificate.",
    });
  }

  /* An expiry the reader worked out rather than read is never a pass. A
     certificate type usually lasts twelve months; the one in front of you
     might not, and the arithmetic is exactly the kind of thing that is right
     ninety-nine times and expensive the hundredth. */
  if (f.expiryWasDerived && isDate(f.expiryDate)) {
    out.push({
      verdict: "review",
      rule: "Expiry not printed",
      because: "the expiry was not printed, so I worked it out — which is not good enough to rely on.",
    });
  }

  if (moveInDate === null) {
    out.push({
      verdict: "review",
      rule: "No move-in date",
      because: "without a move-in date, nothing can be checked for being in date on the right day.",
    });
  }

  return out;
}

/** Is it in date on the day the tenants move in? The question every date check asks. */
function dateRules(f: DocFacts, moveInDate: string | null): RuleResult["reasons"] {
  if (!isDate(f.expiryDate)) {
    return [
      {
        verdict: "review",
        rule: "No expiry found",
        because: "no expiry or next-due date could be read off it.",
      },
    ];
  }
  if (!isDate(moveInDate)) return [];

  const days = daysBetween(moveInDate, f.expiryDate);
  if (days < 0) {
    return [
      {
        verdict: "fail",
        rule: "Out of date on the move-in date",
        because: `it expires ${f.expiryDate}, which is ${Math.abs(days)} days before the tenancy starts.`,
      },
    ];
  }
  if (days <= TIGHT_DAYS) {
    return [
      {
        verdict: "review",
        rule: "Expires soon after move-in",
        because: `it is valid on the day, but only for ${days} more days. Worth booking the renewal now.`,
      },
    ];
  }
  return [
    {
      verdict: "pass",
      rule: "In date",
      because: `Valid until ${f.expiryDate}, ${days} days past the move-in date.`,
    },
  ];
}

/** Anything the certificate itself says is wrong. */
function outcomeRules(f: DocFacts, label: string): RuleResult["reasons"] {
  const out: RuleResult["reasons"] = [];
  if (f.outcome === "unsatisfactory") {
    out.push({
      verdict: "fail",
      rule: "Unsatisfactory result",
      because: `the ${label} records an unsatisfactory result.`,
    });
  }
  if (f.outstandingDefects.length) {
    /* Not a pass even when the overall outcome says satisfactory. An EICR can
       be marked satisfactory and still carry a C2, and the C2 is the thing
       that matters. */
    out.push({
      verdict: "fail",
      rule: "Defects outstanding",
      because: f.outstandingDefects.join("; "),
    });
  }
  if (f.outcome === "not stated") {
    out.push({
      verdict: "review",
      rule: "No result stated",
      because: `no overall result could be read off the ${label}.`,
    });
  }
  return out;
}

/**
 * The per-check rules.
 *
 * Every entry answers one question: given what we read, what should happen?
 * Nothing here consults the model, and nothing here reads the network.
 */
const CHECK_RULES: Partial<Record<CheckId, (f: DocFacts, moveIn: string | null) => RuleResult["reasons"]>> = {
  "gas-safety": (f, moveIn) => [
    ...dateRules(f, moveIn),
    ...outcomeRules(f, "gas safety record"),
  ],

  eicr: (f, moveIn) => [
    ...dateRules(f, moveIn),
    ...outcomeRules(f, "EICR"),
  ],

  epc: (f, moveIn) => {
    const out = dateRules(f, moveIn);
    const band = (f.ratingLetter ?? "").trim().toUpperCase().slice(0, 1);
    if (!band) {
      out.push({
        verdict: "review",
        rule: "No rating read",
        because: "the energy rating band could not be read off it.",
      });
    } else if (band > "E") {
      /* F and G. Lettable only with a registered exemption, which is its own
         document and is not this one. */
      out.push({
        verdict: "fail",
        rule: "Below band E",
        because: `it is rated ${band}, which cannot be let without a registered exemption — and that is a separate document.`,
      });
    } else {
      out.push({
        verdict: "pass",
        rule: "Band E or above",
        because: `Rated ${band}.`,
      });
    }
    return out;
  },

  licensing: (f, moveIn) => [
    ...dateRules(f, moveIn),
    /* No outcome rules. A licence does not have a satisfactory/unsatisfactory
       result, and running them would make every licence a review for "no
       result stated". */
  ],

  "landlord-id-aml": (f) => {
    const out: RuleResult["reasons"] = [];
    if (!f.peopleNamed.length) {
      out.push({
        verdict: "review",
        rule: "Nobody named",
        because: "no person could be read off it, so it cannot be matched to an owner.",
      });
    } else {
      out.push({
        verdict: "review",
        rule: "Names read, not verified",
        because: `it names ${f.peopleNamed.join(", ")}, and whether they are the owners is not something I can know.`,
      });
    }
    return out;
  },

  "tenant-checks": (f) => [
    ...outcomeRules(f, "reference"),
    {
      verdict: "review",
      rule: "Affordability is a judgement",
      because: `whether the outcome is good enough is a judgement, not a rule.`,
    },
  ],

  "guarantor-checks": (f) => [
    ...outcomeRules(f, "guarantee"),
    {
      verdict: "review",
      rule: "Enforceability is a judgement",
      because: "whether this guarantee is enforceable is a legal question, not a readable fact.",
    },
  ],

  "tenancy-agreement": (f) => {
    const out: RuleResult["reasons"] = [];
    if (f.signed === "yes") {
      out.push({ verdict: "pass", rule: "Signed", because: "The agreement is signed." });
    }
    out.push({
      verdict: "review",
      rule: "Terms are a judgement",
      because: "the names and dates read cleanly, but whether the terms are right is not a rule.",
    });
    return out;
  },
};

/* ─────────────────────────────── the answer ────────────────────────────── */

/**
 * Fail beats review beats pass.
 *
 * Deliberately pessimistic, and it is the single most important line in the
 * file. Any other precedence lets one confident pass bury a fact nobody read,
 * which is the failure mode that ends with a tenancy starting on an expired
 * gas certificate.
 */
function worst(reasons: RuleResult["reasons"]): Verdict {
  if (reasons.some((r) => r.verdict === "fail")) return "fail";
  if (reasons.some((r) => r.verdict === "review")) return "review";
  return reasons.length ? "pass" : "review";
}

/** What should happen to this document, and why. */
export function judge(
  checkId: CheckId,
  facts: DocFacts,
  moveInDate: string | null
): RuleResult {
  const specific = CHECK_RULES[checkId];
  const reasons = [
    ...universal(facts, moveInDate),
    ...(specific ? specific(facts, moveInDate) : []),
  ];
  /* No rules for this check at all means REVIEW, not PASS. A check that has
     not been thought about must never look like one that has been cleared. */
  if (!specific) {
    reasons.push({
      verdict: "review",
      rule: "No rules for this check",
      because: "Nothing here can be decided automatically. Read it.",
    });
  }
  return { verdict: worst(reasons), reasons };
}

/* ────────────────────────────── saying it out loud ─────────────────────── */

/**
 * One line per check, in the words somebody would use.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * The rules produce a verdict and a list of reasons, and it is tempting to put
 * that straight on the screen. Nine checks times four reasons each is thirty-
 * six rows of yes and no, and a screen like that does not get read - it gets
 * scrolled past, which is worse than not having it, because everybody assumes
 * somebody looked.
 *
 * So: "Gas safety looks fine." One line. The detail is still there underneath
 * for the checks that need it, and only for those.
 *
 * ── The wording rule ───────────────────────────────────────────────────────
 *
 * "Looks fine" and not "passed". The scan is recommending, and the sentence
 * has to carry that even when everything is clean, because the person reading
 * it is about to put their name to a legal judgement. "Passed" invites them to
 * agree; "looks fine" invites them to check.
 */
export function summarise(
  checkLabel: string,
  result: RuleResult
): { line: string; verdict: Verdict; concerns: RuleResult["reasons"] } {
  /* Only the things worth raising. A pass reason ("valid until 2026-03-12")
     is the evidence for the line, not a separate thing to read. */
  const concerns = result.reasons.filter((r) => r.verdict !== "pass");

  if (result.verdict === "fail") {
    const first = concerns.find((r) => r.verdict === "fail");
    return {
      /* The harm, in the line itself. Somebody scanning the summary should
         learn WHAT is wrong without opening anything. */
      line: `${checkLabel} — ${first?.because ?? "something here would stop the let."}`,
      verdict: "fail",
      concerns,
    };
  }

  if (result.verdict === "review") {
    const first = concerns[0];
    return {
      line: `${checkLabel} needs your eyes — ${first?.because ?? "the reader could not settle it."}`,
      verdict: "review",
      concerns,
    };
  }

  return { line: `${checkLabel} looks fine.`, verdict: "pass", concerns: [] };
}

/**
 * The recommendation for a whole pack.
 *
 * Note what it is called. A recommendation is not a decision, and the wording
 * on every screen has to keep that true - see PLC_TRANSITIONS, which has no
 * path to `approved` that does not go through a person.
 */
export function recommend(perCheck: { checkId: CheckId; result: RuleResult }[]): {
  verdict: Verdict;
  headline: string;
} {
  const verdict = worst(perCheck.flatMap((p) => p.result.reasons));
  const fails = perCheck.filter((p) => p.result.verdict === "fail").length;
  const reviews = perCheck.filter((p) => p.result.verdict === "review").length;

  /* Every headline is phrased as a recommendation and none of them tells the
     reader what to do. "Not ready to let" would be the OS reaching a legal
     conclusion; "I would not let this yet" is the scan saying what it thinks,
     which is all it is entitled to say. */
  if (fails) {
    return {
      verdict: "fail",
      headline:
        fails === 1
          ? "One thing here would stop the let. I would send this back."
          : `${fails} things here would stop the let. I would send this back.`,
    };
  }
  if (reviews) {
    return {
      verdict: "review",
      headline:
        reviews === 1
          ? "Nothing obviously wrong, but one check needs your eyes."
          : `Nothing obviously wrong, but ${reviews} checks need your eyes.`,
    };
  }
  return {
    verdict: "pass",
    headline: "Everything I can check looks fine. The decision is still yours.",
  };
}

/** Rule results, as findings, so one list reaches the screen in one order. */
export function reasonsAsFindings(
  checkId: CheckId,
  result: RuleResult,
  documentName: string
): Finding[] {
  return result.reasons.map((r) => ({
    checkId,
    level: r.verdict === "fail" ? "blocker" : r.verdict === "review" ? "query" : "ok",
    message: `${r.rule}: ${r.because}`,
    documentName,
    foundDate: null,
  }));
}
