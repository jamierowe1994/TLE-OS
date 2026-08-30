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
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_plc_shadow (case_id, address, recommended, headline, per_check, scanned_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (case_id) DO UPDATE SET
         address     = EXCLUDED.address,
         recommended = EXCLUDED.recommended,
         headline    = EXCLUDED.headline,
         per_check   = EXCLUDED.per_check,
         scanned_at  = NOW(),
         -- A re-scan is a new prediction about a pack that has not been
         -- decided yet, so any half-written decision is cleared rather than
         -- left attached to a recommendation it was never made against.
         decision    = NULL,
         decided_by  = NULL,
         decided_at  = NULL,
         agreement   = NULL`,
      [e.caseId, e.address, e.verdict, e.headline, JSON.stringify(e.perCheck)]
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
    const rows = await q<{ recommended: string | null }>(
      `SELECT recommended FROM os_plc_shadow WHERE case_id = $1`,
      [e.caseId]
    );
    /* No row means the pack was decided without ever being scanned — a real
       and interesting case, so it is recorded rather than dropped. It just has
       nothing to compare against. */
    const recommended = (rows[0]?.recommended ?? null) as Verdict | null;
    const agreement = compare(recommended, e.decision);

    await q(
      `INSERT INTO os_plc_shadow (case_id, address, decision, decided_by, decided_at, decision_note, agreement)
       VALUES ($1, '', $2, $3, NOW(), $4, $5)
       ON CONFLICT (case_id) DO UPDATE SET
         decision      = EXCLUDED.decision,
         decided_by    = EXCLUDED.decided_by,
         decided_at    = NOW(),
         decision_note = EXCLUDED.decision_note,
         agreement     = EXCLUDED.agreement`,
      [e.caseId, e.decision, e.decidedBy, e.note, agreement]
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
  /** Every miss, in full. These are the cases worth reading one by one. */
  misses: ShadowRow[];
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
    misses: [],
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
              decision, decided_by, decided_at, decision_note, agreement
         FROM os_plc_shadow
        WHERE agreement = 'missed'
        ORDER BY decided_at DESC
        LIMIT 50`
    );

    const out: ShadowStats = {
      ...empty,
      agreedPass: by("agreed_pass"),
      agreedStop: by("agreed_stop"),
      missed: by("missed"),
      overFlagged: by("over_flagged"),
      deferredToHuman: by("deferred_to_human"),
      misses: misses.map(toRow),
    };
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

function toRow(r: Record<string, unknown>): ShadowRow {
  const d = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    caseId: String(r.case_id ?? ""),
    address: String(r.address ?? ""),
    recommended: (r.recommended as Verdict) ?? null,
    headline: String(r.headline ?? ""),
    perCheck: Array.isArray(r.per_check) ? (r.per_check as ShadowRow["perCheck"]) : [],
    scannedAt: d(r.scanned_at),
    decision: (r.decision as ShadowRow["decision"]) ?? null,
    decidedBy: (r.decided_by as string) ?? null,
    decidedAt: d(r.decided_at),
    decisionNote: String(r.decision_note ?? ""),
    agreement: (r.agreement as Agreement) ?? null,
  };
}
