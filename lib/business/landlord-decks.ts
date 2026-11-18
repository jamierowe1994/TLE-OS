import { q } from "@/lib/db";
import { TEST_ADDRESS } from "@/lib/test-kits";

/**
 * The landlord decks on Company Figures (James, 18 Nov 2026): who is sending
 * them, whether the landlord opens them, and whether a valuation goes out with
 * its deck or without one.
 *
 * Read straight from os_presentations and os_market_appraisals for one month
 * (London time), so it rolls over on its own. A deck counts in the month it was
 * SENT; whether it has been opened is as of now, so a deck sent on the 30th
 * that the landlord opens on the 2nd still shows as opened under its own month.
 *
 * Opens are the landlord's only: /api/present/opened ignores anyone signed in
 * to the OS, so an agent presenting the deck on the day never counts.
 *
 * A valuation counts in the month it was recorded (valued_at). "With its deck"
 * means a post-appraisal deck exists for that appraisal at any time. The test
 * file's home and archived or cancelled appraisals are left out.
 */

export type DeckKind = "pre-appraisal" | "appraisal" | "post-appraisal";

export interface DeckKindFigures {
  sent: number;
  opened: number;
  /** Landlords who came back to it: opened two or more times. */
  cameBack: number;
  /** Median hours from sending to the landlord's first open; null with no opens. */
  medianHoursToOpen: number | null;
}

export interface DeckAgentRow {
  agent: string;
  pre: number;
  appraisal: number;
  post: number;
  opened: number;
  /** Appraisals of theirs this month (booked or valued in the month). */
  appraisals: number;
  valuations: number;
  valuationsWithDeck: number;
}

export interface ValuationWithoutDeck {
  id: string;
  address: string;
  agent: string;
  valuedAt: string;
  stage: string;
  /** False when the appraisal never had a visit date: marked won without one. */
  hadVisit: boolean;
}

export interface LandlordDeckFigures {
  month: string;
  asAt: string;
  kinds: Record<DeckKind, DeckKindFigures>;
  agentsSending: number;
  agentsWithAppraisals: number;
  answered: number;
  valuations: { total: number; withDeck: number; withoutDeck: number; withoutDeckNoVisit: number };
  agents: DeckAgentRow[];
  withoutDeck: ValuationWithoutDeck[];
}

const KINDS: DeckKind[] = ["pre-appraisal", "appraisal", "post-appraisal"];

/* The month as London sees it, as two instants. */
const BOUNDS = `(($1 || '-01')::date::timestamp AT TIME ZONE 'Europe/London')`;
const BOUNDS_END = `((($1 || '-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/London')`;
const IN_MONTH = (col: string) => `${col} >= ${BOUNDS} AND ${col} < ${BOUNDS_END}`;

/* Leaves the test file's home out, by its first line. */
const TEST_LINE = TEST_ADDRESS.split(",")[0].toLowerCase();
const NOT_TEST = (addr: string) => `lower(coalesce(${addr}, '')) NOT LIKE $2 || '%'`;

type Query = <Row extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<Row[]>;

/** `query` is the OS's own q; a read-only client can stand in to check live. */
export async function getLandlordDeckFigures(month: string, query: Query = q): Promise<LandlordDeckFigures> {
  const params = [month, TEST_LINE];

  const decks = query<{ kind: string; author: string; opened: boolean; opens: number; hours: number | null }>(
    `SELECT p.kind, coalesce(nullif(p.author_name, ''), 'Unknown') AS author,
            p.first_opened_at IS NOT NULL AS opened, p.opens,
            extract(epoch FROM p.first_opened_at - p.created_at) / 3600 AS hours
       FROM os_presentations p
       LEFT JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
      WHERE ${IN_MONTH("p.created_at")} AND ${NOT_TEST("a.address")}`,
    params
  );

  const answered = query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM os_present_answers x
       JOIN os_presentations p USING (token)
       LEFT JOIN os_market_appraisals a ON a.id = 'lead-' || p.ref
      WHERE ${IN_MONTH("x.answered_at")} AND ${NOT_TEST("a.address")}`,
    params
  );

  const appraisals = query<{
    id: string; agent: string; address: string; stage: string; valued: boolean; valued_at: string | null;
    in_month: boolean; had_visit: boolean; has_post: boolean;
  }>(
    `SELECT a.id, coalesce(nullif(a.agent, ''), 'Unknown') AS agent, a.address, a.stage,
            a.valued_at IS NOT NULL AND ${IN_MONTH("a.valued_at")} AS valued,
            a.valued_at,
            (${IN_MONTH("a.created_at")}) OR (a.appointment_at IS NOT NULL AND ${IN_MONTH("a.appointment_at")}) AS in_month,
            a.appointment_at IS NOT NULL AS had_visit,
            EXISTS (SELECT 1 FROM os_presentations p WHERE 'lead-' || p.ref = a.id AND p.kind = 'post-appraisal') AS has_post
       FROM os_market_appraisals a
      WHERE a.archived_at IS NULL AND a.cancelled_at IS NULL AND ${NOT_TEST("a.address")}
        AND ((${IN_MONTH("a.created_at")})
          OR (a.appointment_at IS NOT NULL AND ${IN_MONTH("a.appointment_at")})
          OR (a.valued_at IS NOT NULL AND ${IN_MONTH("a.valued_at")}))`,
    params
  );

  const [deckRows, answerRows, apprRows] = await Promise.all([decks, answered, appraisals]);

  const kinds = Object.fromEntries(
    KINDS.map((k) => {
      const rows = deckRows.filter((r) => r.kind === k);
      const hours = rows.filter((r) => r.opened && r.hours != null).map((r) => Number(r.hours)).sort((x, y) => x - y);
      const mid = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;
      return [k, {
        sent: rows.length,
        opened: rows.filter((r) => r.opened).length,
        cameBack: rows.filter((r) => Number(r.opens) >= 2).length,
        medianHoursToOpen: mid == null ? null : Math.round(mid * 10) / 10,
      }];
    })
  ) as Record<DeckKind, DeckKindFigures>;

  const byAgent = new Map<string, DeckAgentRow>();
  const row = (agent: string) => {
    let r = byAgent.get(agent);
    if (!r) byAgent.set(agent, (r = { agent, pre: 0, appraisal: 0, post: 0, opened: 0, appraisals: 0, valuations: 0, valuationsWithDeck: 0 }));
    return r;
  };
  for (const d of deckRows) {
    const r = row(d.author);
    if (d.kind === "pre-appraisal") r.pre++;
    else if (d.kind === "appraisal") r.appraisal++;
    else if (d.kind === "post-appraisal") r.post++;
    if (d.opened) r.opened++;
  }
  const valued = apprRows.filter((a) => a.valued);
  for (const a of apprRows) {
    const r = row(a.agent);
    if (a.in_month) r.appraisals++;
    if (a.valued) {
      r.valuations++;
      if (a.has_post) r.valuationsWithDeck++;
    }
  }

  const withoutDeck = valued
    .filter((a) => !a.has_post)
    .map((a) => ({
      id: a.id,
      address: a.address,
      agent: a.agent,
      valuedAt: a.valued_at ? new Date(a.valued_at).toISOString() : "",
      stage: a.stage,
      hadVisit: a.had_visit,
    }))
    .sort((x, y) => y.valuedAt.localeCompare(x.valuedAt));

  const agents = [...byAgent.values()].sort(
    (x, y) => y.pre + y.appraisal + y.post - (x.pre + x.appraisal + x.post) || y.valuations - x.valuations || x.agent.localeCompare(y.agent)
  );

  return {
    month,
    asAt: new Date().toISOString(),
    kinds,
    agentsSending: new Set(deckRows.map((d) => d.author)).size,
    agentsWithAppraisals: new Set(apprRows.filter((a) => a.in_month || a.valued).map((a) => a.agent)).size,
    answered: answerRows[0]?.n ?? 0,
    valuations: {
      total: valued.length,
      withDeck: valued.filter((a) => a.has_post).length,
      withoutDeck: withoutDeck.length,
      withoutDeckNoVisit: withoutDeck.filter((a) => !a.hadVisit).length,
    },
    agents,
    withoutDeck,
  };
}
