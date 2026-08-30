import "server-only";
import { hasDb, q } from "@/lib/db";
import type { CheckId } from "@/lib/plc";
import type { Verdict } from "@/lib/plc-rules";

/**
 * The shadow log: what the rules said, and what the person actually decided.
 *
 * ── The one question it exists to answer ───────────────────────────────────
 *
 * "Could we let this run itself?" is not answerable by opinion, and it is not
 * answerable by how good the scan FEELS after a few good days. It is answerable
 * by one number:
 *
 *     how many times did the rules say it looked fine, and the person said no?
 *
 * Every one of those is a tenancy that would have gone through on a document
 * somebody should have stopped. If that number is zero over a hundred real
 * packs there is a conversation to have. If it is three, you have just learned
 * three rules you did not have — which is worth more than the automation.
 *
 * ── Why it records, and never acts ─────────────────────────────────────────
 *
 * Nothing in this file changes a case, gates a decision, or is read by any
 * screen a compliance officer uses while deciding. Showing somebody the
 * recommendation's track record WHILE they decide would poison the very
 * measurement being taken: a person told "the rules are right 98% of the time"
 * is no longer an independent check, they are agreeing with a number.
 *
 * So the log is written at two moments and read in one place — a stats page
 * nobody consults mid-decision.
 *
 * ── Recording never throws ─────────────────────────────────────────────────
 *
 * Same rule as the audit trail. A log write that could fail a decision would
 * mean a database hiccup stops Kirstie approving a tenancy, which is far worse
 * than a missing row.
 */

/* ─────────────────────────────── the shape ─────────────────────────────── */

export type ShadowRow = {
  caseId: string;
  address: string;
  recommended: Verdict | null;
  headline: string;
  perCheck: { checkId: CheckId; verdict: Verdict; line: string }[];
  scannedAt: string | null;
  decision: "approved" | "deferred" | "declined" | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  agreement: Agreement | null;
  /** Submission to decision, in hours. Null if it was never submitted through us. */
  hoursToDecide: number | null;
};

/**
 * How the recommendation and the decision line up.
 *
 * Five outcomes rather than agree/disagree, because the ones that matter are
 * not symmetrical:
 *
 *   `missed`     — rules said fine, person said no. THE number. Every one is a
 *                  rule that does not exist yet.
 *   `over_flagged` — rules objected, person approved anyway. Cheap: it costs
 *                  attention, not a tenancy. Too many and people stop reading.
 *   `agreed_pass` / `agreed_stop` — the two that build the case.
 *   `deferred_to_human` — the rules explicitly asked for a person, and got
 *                  one. Working as designed, and NOT counted as either a hit
 *                  or a miss; folding it into "agreed" would flatter the
 *                  numbers with cases the rules never claimed to answer.
 */
export type Agreement =
  | "agreed_pass"
  | "agreed_stop"
  | "missed"
  | "over_flagged"
  | "deferred_to_human";

export function compare(
  recommended: Verdict | null,
  decision: "approved" | "deferred" | "declined" | null
): Agreement | null {
  if (!recommended || !decision) return null;
  const stopped = decision === "deferred" || decision === "declined";

  if (recommended === "review") return "deferred_to_human";
  if (recommended === "pass") return stopped ? "missed" : "agreed_pass";
  return stopped ? "agreed_stop" : "over_flagged";
}

/* ──────────────────────────────── writing ──────────────────────────────── */

/** The recommendation, at the moment the scan finished. */
export async function recordRecommendation(e: {
  caseId: string;
  address: string;
  verdict: Verdict;
  headline: string;
  perCheck: { checkId: CheckId; verdict: Verdict; line: string }[];
  /** When the agent handed it over. The clock the turnaround figure runs on. */
  submittedAt: string | null;
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_plc_shadow (case_id, address, recommended, headline, per_check, scanned_at, submitted_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), $6)
       ON CONFLICT (case_id) DO UPDATE SET
         address     = EXCLUDED.address,
         recommended = EXCLUDED.recommended,
         headline    = EXCLUDED.headline,
         per_check   = EXCLUDED.per_check,
         scanned_at  = NOW(),
         submitted_at = EXCLUDED.submitted_at,
         -- A re-scan is a new prediction about a pack that has not been
         -- decided yet, so any half-written decision is cleared rather than
         -- left attached to a recommendation it was never made against.
         decision    = NULL,
         decided_by  = NULL,
         decided_at  = NULL,
         agreement   = NULL`,
      [e.caseId, e.address, e.verdict, e.headline, JSON.stringify(e.perCheck), e.submittedAt]
    );
  } catch (err) {
    console.error("[plc-shadow] could not record the recommendation", e.caseId, err);
  }
}

/** The decision, when a person makes one. */
export async function recordDecision(e: {
  caseId: string;
  decision: "approved" | "deferred" | "declined";
  decidedBy: string;
  note: string;
}): Promise<void> {
  if (!hasDb()) return;
  try {
    /* The comparison is computed in SQL against the recommendation ALREADY on
       the row, not passed in. Otherwise a caller could record a decision
       against a recommendation that was never made, and the one number this
       table exists for would be unfalsifiable. */
    const rows = await q<{ recommended: string | null; submitted_at: string | null }>(
      `SELECT recommended, submitted_at FROM os_plc_shadow WHERE case_id = $1`,
      [e.caseId]
    );
    /* No row means the pack was decided without ever being scanned — a real
       and interesting case, so it is recorded rather than dropped. It just has
       nothing to compare against. */
    const recommended = (rows[0]?.recommended ?? null) as Verdict | null;
    const agreement = compare(recommended, e.decision);

    /* Computed here and stored, not derived on read. This figure gets quoted
       to agents - "we have got it down to 24 hours" - so it has to keep meaning
       the same thing even if the timestamps around it ever change. */
    const submitted = rows[0]?.submitted_at ?? null;
    const hours = submitted
      ? Math.max(0, (Date.now() - new Date(submitted).getTime()) / 3_600_000)
      : null;

    await q(
      `INSERT INTO os_plc_shadow (case_id, address, decision, decided_by, decided_at, decision_note, agreement, hours_to_decide)
       VALUES ($1, '', $2, $3, NOW(), $4, $5, $6)
       ON CONFLICT (case_id) DO UPDATE SET
         decision        = EXCLUDED.decision,
         decided_by      = EXCLUDED.decided_by,
         decided_at      = NOW(),
         decision_note   = EXCLUDED.decision_note,
         agreement       = EXCLUDED.agreement,
         hours_to_decide = EXCLUDED.hours_to_decide`,
      [e.caseId, e.decision, e.decidedBy, e.note, agreement, hours]
    );
  } catch (err) {
    console.error("[plc-shadow] could not record the decision", e.caseId, err);
  }
}

/* ──────────────────────────────── reading ──────────────────────────────── */

export type ShadowStats = {
  /** Packs that were both scanned and decided. The only ones that count. */
  compared: number;
  agreedPass: number;
  agreedStop: number;
  missed: number;
  overFlagged: number;
  deferredToHuman: number;
  /**
   * The matrix, as percentages of what the rules SAID.
   *
   * Read as: of the packs the rules called fine, what share did a person also
   * approve. That is the direction that matters - the other direction ("of the
   * approvals, how many did we predict") flatters the number whenever most
   * packs are fine, which they are.
   *
   * Null rather than zero when the rules never said that thing. A denominator
   * of zero printed as 0% reads as total failure when it means no data.
   */
  saidPass: { n: number; agreed: number; pct: number | null };
  saidStop: { n: number; agreed: number; pct: number | null };
  /** Every miss, in full. These are the cases worth reading one by one. */
  misses: ShadowRow[];
  /**
   * Turnaround, submission to decision. The figure worth quoting to agents.
   *
   * Median as well as mean, and the median is the honest one: one pack that sat
   * over a bank holiday weekend drags a mean of twenty into the forties, and
   * the agent asking "how long will mine take" is asking about the median.
   */
  turnaround: { n: number; meanHours: number | null; medianHours: number | null };
  /** Month by month, so a trend is visible rather than asserted. */
  byMonth: { month: string; decided: number; medianHours: number | null; missed: number }[];
  /** Plain English, because a ratio on its own invites the wrong conclusion. */
  verdict: string;
};

export async function stats(): Promise<ShadowStats> {
  const empty: ShadowStats = {
    compared: 0,
    agreedPass: 0,
    agreedStop: 0,
    missed: 0,
    overFlagged: 0,
    deferredToHuman: 0,
    saidPass: { n: 0, agreed: 0, pct: null },
    saidStop: { n: 0, agreed: 0, pct: null },
    misses: [],
    turnaround: { n: 0, meanHours: null, medianHours: null },
    byMonth: [],
    verdict: "Nothing recorded yet.",
  };
  if (!hasDb()) return empty;

  try {
    const counts = await q<{ agreement: string; n: string }>(
      `SELECT agreement, COUNT(*)::text AS n
         FROM os_plc_shadow
        WHERE agreement IS NOT NULL
        GROUP BY agreement`
    );
    const by = (k: string) => Number(counts.find((c) => c.agreement === k)?.n ?? 0);

    const misses = await q<Record<string, unknown>>(
      `SELECT case_id, address, recommended, headline, per_check, scanned_at,
              decision, decided_by, decided_at, decision_note, agreement,
              hours_to_decide
         FROM os_plc_shadow
        WHERE agreement = 'missed'
        ORDER BY decided_at DESC
        LIMIT 50`
    );

    /* Every decided pack that has a turnaround on it. NULLs are excluded
       rather than counted as zero - a pack decided before submitted_at existed
       has no turnaround, and calling it instant would be a lie in our favour. */
    const times = await q<{ h: string }>(
      `SELECT hours_to_decide::text AS h
         FROM os_plc_shadow
        WHERE hours_to_decide IS NOT NULL
        ORDER BY hours_to_decide`
    );
    const hours = times.map((t) => Number(t.h)).filter((n) => Number.isFinite(n));

    const months = await q<{ month: string; decided: string; median: string | null; missed: string }>(
      `SELECT to_char(date_trunc('month', decided_at), 'YYYY-MM') AS month,
              COUNT(*)::text AS decided,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY hours_to_decide)::text AS median,
              COUNT(*) FILTER (WHERE agreement = 'missed')::text AS missed
         FROM os_plc_shadow
        WHERE decided_at IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 24`
    );

    const out: ShadowStats = {
      ...empty,
      agreedPass: by("agreed_pass"),
      agreedStop: by("agreed_stop"),
      missed: by("missed"),
      overFlagged: by("over_flagged"),
      deferredToHuman: by("deferred_to_human"),
      misses: misses.map(toRow),
      turnaround: {
        n: hours.length,
        meanHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
        medianHours: median(hours),
      },
      byMonth: months.map((m) => ({
        month: m.month,
        decided: Number(m.decided),
        medianHours: m.median === null ? null : Number(m.median),
        missed: Number(m.missed),
      })),
    };

    /* Of what the rules SAID, how often a person agreed. Note the
       denominators: saidPass counts agreed_pass + missed, because those are
       exactly the packs the rules called fine. Anything else in the
       denominator would be measuring a different question. */
    const passN = out.agreedPass + out.missed;
    const stopN = out.agreedStop + out.overFlagged;
    out.saidPass = { n: passN, agreed: out.agreedPass, pct: passN ? (out.agreedPass / passN) * 100 : null };
    out.saidStop = { n: stopN, agreed: out.agreedStop, pct: stopN ? (out.agreedStop / stopN) * 100 : null };

    out.compared =
      out.agreedPass + out.agreedStop + out.missed + out.overFlagged + out.deferredToHuman;
    out.verdict = readOut(out);
    return out;
  } catch (err) {
    console.error("[plc-shadow] could not read the stats", err);
    return empty;
  }
}

/**
 * What the numbers actually support, said in a sentence.
 *
 * Deliberately conservative and deliberately not a percentage. A bare "97%
 * agreement" reads as a green light; the useful question is how many packs the
 * rules have seen and whether any of them were let through wrongly.
 */
function readOut(s: ShadowStats): string {
  if (s.compared === 0) return "Nothing recorded yet.";
  if (s.missed > 0) {
    return `${s.missed} pack${s.missed === 1 ? "" : "s"} the rules called fine and a person stopped. Read ${s.missed === 1 ? "it" : "them"} — each one is a rule that does not exist yet.`;
  }
  if (s.compared < 50) {
    return `No misses in ${s.compared} pack${s.compared === 1 ? "" : "s"}. Too few to conclude anything yet.`;
  }
  return `No misses in ${s.compared} packs. Worth a conversation about what could run itself — starting with the checks that have never needed a person.`;
}

function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toRow(r: Record<string, unknown>): ShadowRow {
  const d = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    caseId: String(r.case_id ?? ""),
    address: String(r.address ?? ""),
    recommended: (r.recommended as Verdict) ?? null,
    headline: String(r.headline ?? ""),
    perCheck: Array.isArray(r.per_check) ? (r.per_check as ShadowRow["perCheck"]) : [],
    hoursToDecide: r.hours_to_decide === null || r.hours_to_decide === undefined ? null : Number(r.hours_to_decide),
    scannedAt: d(r.scanned_at),
    decision: (r.decision as ShadowRow["decision"]) ?? null,
    decidedBy: (r.decided_by as string) ?? null,
    decidedAt: d(r.decided_at),
    decisionNote: String(r.decision_note ?? ""),
    agreement: (r.agreement as Agreement) ?? null,
  };
}
