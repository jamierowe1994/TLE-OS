import { q } from "@/lib/db";
import { TEST_ADDRESS } from "@/lib/test-kits";

/**
 * The landlord decks on Company Figures (James, 18 Nov 2026): who is sending
 * them, whether the landlord opens them, whether a valuation goes out with its
 * deck, what each contract came after, and whether the landlord then uses
 * their portal.
 *
 * Read straight from os_presentations, os_market_appraisals, os_terms and
 * os_portal_accounts for one month (London time), so it rolls over on its
 * own. A deck counts in the month it was SENT; whether it has been opened is
 * as of now.
 *
 * Opens are the landlord's only: /api/present/opened ignores anyone signed in
 * to the OS, so an agent presenting the deck on the day never counts.
 *
 * STRAIGHT TO LISTING. New Listing (app/api/listings/new) makes an appraisal
 * file behind every home it lists, with the advertised rent recorded as the
 * figure and no visit, and marks it os_case_state 'direct-listing'. Those
 * homes never had a valuation to send, so they are counted apart from the
 * real ones (James, 18 Nov 2026: kept on the screen, not dropped).
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
  /** Appraisals of theirs this month (booked or valued in the month), straight-to-listing homes left out. */
  appraisals: number;
  /** Real valuations only. */
  valuations: number;
  valuationsWithDeck: number;
  /** Homes they listed straight from New Listing this month. */
  direct: number;
}

export interface ValuationWithoutDeck {
  id: string;
  address: string;
  agent: string;
  valuedAt: string;
  stage: string;
  /** False when the appraisal never had a visit date. */
  hadVisit: boolean;
  /** Listed straight from New Listing: there was never a valuation to send. */
  direct: boolean;
}

/** What a contract came after. */
export type ContractRoute = "deck" | "visit-no-deck" | "direct" | "no-visit" | "none";

export interface ContractRow {
  id: string;
  address: string;
  agent: string;
  sentAt: string;
  signedAt: string | null;
  route: ContractRoute;
  appraisalId: string | null;
  /** The valuation deck behind it was opened by the landlord. */
  deckOpened: boolean;
  /** A landlord on it has a portal account they have signed in to. */
  portal: boolean;
}

export interface LandlordDeckFigures {
  month: string;
  asAt: string;
  kinds: Record<DeckKind, DeckKindFigures>;
  agentsSending: number;
  agentsWithAppraisals: number;
  answered: number;
  /** total / withDeck / withoutDeck are real valuations; direct counts straight-to-listing homes apart. */
  valuations: { total: number; withDeck: number; withoutDeck: number; withoutDeckNoVisit: number; direct: number };
  agents: DeckAgentRow[];
  withoutDeck: ValuationWithoutDeck[];
  /** Contracts sent this month (os_terms), each traced back to what came before it. */
  contracts: { sent: number; signed: number; byRoute: Record<ContractRoute, { sent: number; signed: number }>; rows: ContractRow[] };
  /** Landlord portal accounts: invited and first signed in this month; every account to date. */
  portal: { invited: number; signedIn: number; accounts: number; everSignedIn: number };
}

const KINDS: DeckKind[] = ["pre-appraisal", "appraisal", "post-appraisal"];
const ROUTES: ContractRoute[] = ["deck", "visit-no-deck", "direct", "no-visit", "none"];

/* The month as London sees it, as two instants. */
const BOUNDS = `(($1 || '-01')::date::timestamp AT TIME ZONE 'Europe/London')`;
const BOUNDS_END = `((($1 || '-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/London')`;
const IN_MONTH = (col: string) => `${col} >= ${BOUNDS} AND ${col} < ${BOUNDS_END}`;

/* Leaves the test file's home out, by its first line. */
const TEST_LINE = TEST_ADDRESS.split(",")[0].toLowerCase();
const NOT_TEST = (addr: string) => `lower(coalesce(${addr}, '')) NOT LIKE $2 || '%'`;

/* An appraisal file New Listing made (no visit, the advert's rent as the figure). */
const DIRECT = (id: string) => `EXISTS (SELECT 1 FROM os_case_state cs WHERE cs.kind = 'direct-listing' AND cs.record_id = ${id})`;
const VAL_DECK = (id: string) => `EXISTS (SELECT 1 FROM os_presentations p WHERE 'lead-' || p.ref = ${id} AND p.kind = 'post-appraisal')`;
const LIVE_MA = `a.stage <> 'lost' AND a.cancelled_at IS NULL AND a.archived_at IS NULL`;

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
    in_month: boolean; had_visit: boolean; has_post: boolean; direct: boolean;
  }>(
    `SELECT a.id, coalesce(nullif(a.agent, ''), 'Unknown') AS agent, a.address, a.stage,
            a.valued_at IS NOT NULL AND ${IN_MONTH("a.valued_at")} AS valued,
            a.valued_at,
            (${IN_MONTH("a.created_at")}) OR (a.appointment_at IS NOT NULL AND ${IN_MONTH("a.appointment_at")}) AS in_month,
            a.appointment_at IS NOT NULL AS had_visit,
            ${VAL_DECK("a.id")} AS has_post,
            ${DIRECT("a.id")} AS direct
       FROM os_market_appraisals a
      WHERE a.archived_at IS NULL AND a.cancelled_at IS NULL AND ${NOT_TEST("a.address")}
        AND ((${IN_MONTH("a.created_at")})
          OR (a.appointment_at IS NOT NULL AND ${IN_MONTH("a.appointment_at")})
          OR (a.valued_at IS NOT NULL AND ${IN_MONTH("a.valued_at")}))`,
    params
  );

  /* Each contract sent this month, traced to the appraisal behind it: its own
     link first, then the file New Listing made for the same listing, then the
     appraisal on the same property. Read only - os_terms is never written. */
  const contracts = query<{
    id: string; address: string; agent: string; created_at: string; completed_at: string | null;
    linked: string | null; direct: boolean; had_visit: boolean | null; val_deck: boolean; deck_opened: boolean; portal: boolean;
  }>(
    `WITH t AS (
       SELECT t.*,
              coalesce(
                t.appraisal_id,
                (SELECT cs.record_id FROM os_case_state cs
                  WHERE cs.kind = 'direct-listing' AND t.listing_id IS NOT NULL AND cs.payload->>'listingId' = t.listing_id
                  ORDER BY cs.updated_at DESC LIMIT 1),
                (SELECT a.id FROM os_market_appraisals a
                  WHERE t.property_id IS NOT NULL AND a.rex_property_id = t.property_id AND ${LIVE_MA}
                  ORDER BY (a.stage = 'won') DESC, a.updated_at DESC NULLS LAST LIMIT 1)
              ) AS linked
         FROM os_terms t
        WHERE t.cancelled_at IS NULL AND ${IN_MONTH("t.created_at")} AND ${NOT_TEST("t.property_address")}
     )
     SELECT t.id, t.property_address AS address, coalesce(nullif(t.agent_name, ''), 'Unknown') AS agent,
            t.created_at, t.completed_at, t.linked,
            (t.linked IS NOT NULL AND ${DIRECT("t.linked")}) AS direct,
            (SELECT a.appointment_at IS NOT NULL FROM os_market_appraisals a WHERE a.id = t.linked) AS had_visit,
            (t.linked IS NOT NULL AND ${VAL_DECK("t.linked")}) AS val_deck,
            EXISTS (SELECT 1 FROM os_presentations p WHERE 'lead-' || p.ref = t.linked AND p.kind = 'post-appraisal' AND p.first_opened_at IS NOT NULL) AS deck_opened,
            EXISTS (SELECT 1 FROM os_portal_accounts pa, jsonb_array_elements(CASE WHEN jsonb_typeof(t.parties) = 'array' THEN t.parties ELSE '[]'::jsonb END) pp
                     WHERE pa.kind = 'landlord' AND pa.activated_at IS NOT NULL AND lower(pa.email) = lower(pp->>'email')) AS portal
       FROM t`,
    params
  );

  const portal = query<{ invited: number; signed_in: number; accounts: number; ever: number }>(
    `SELECT count(*) FILTER (WHERE ${IN_MONTH("invited_at")})::int AS invited,
            count(*) FILTER (WHERE activated_at IS NOT NULL AND ${IN_MONTH("activated_at")})::int AS signed_in,
            count(*) FILTER (WHERE invited_at < ${BOUNDS_END})::int AS accounts,
            count(*) FILTER (WHERE activated_at IS NOT NULL AND activated_at < ${BOUNDS_END})::int AS ever
       FROM os_portal_accounts
      WHERE kind = 'landlord' AND $2::text IS NOT NULL`,
    params
  );

  const [deckRows, answerRows, apprRows, contractRows, portalRows] = await Promise.all([decks, answered, appraisals, contracts, portal]);

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
    if (!r) byAgent.set(agent, (r = { agent, pre: 0, appraisal: 0, post: 0, opened: 0, appraisals: 0, valuations: 0, valuationsWithDeck: 0, direct: 0 }));
    return r;
  };
  for (const d of deckRows) {
    const r = row(d.author);
    if (d.kind === "pre-appraisal") r.pre++;
    else if (d.kind === "appraisal") r.appraisal++;
    else if (d.kind === "post-appraisal") r.post++;
    if (d.opened) r.opened++;
  }
  for (const a of apprRows) {
    const r = row(a.agent);
    if (a.direct) {
      if (a.in_month || a.valued) r.direct++;
      continue;
    }
    if (a.in_month) r.appraisals++;
    if (a.valued) {
      r.valuations++;
      if (a.has_post) r.valuationsWithDeck++;
    }
  }

  const valued = apprRows.filter((a) => a.valued);
  const real = valued.filter((a) => !a.direct);
  const withoutDeck = valued
    .filter((a) => !a.has_post)
    .map((a) => ({
      id: a.id,
      address: a.address,
      agent: a.agent,
      valuedAt: a.valued_at ? new Date(a.valued_at).toISOString() : "",
      stage: a.stage,
      hadVisit: a.had_visit,
      direct: a.direct,
    }))
    /* The real ones first: they are the ones an agent can still put right. */
    .sort((x, y) => Number(x.direct) - Number(y.direct) || y.valuedAt.localeCompare(x.valuedAt));

  const agents = [...byAgent.values()].sort(
    (x, y) => y.pre + y.appraisal + y.post - (x.pre + x.appraisal + x.post) || y.valuations - x.valuations || x.agent.localeCompare(y.agent)
  );

  const routeOf = (c: (typeof contractRows)[number]): ContractRoute =>
    !c.linked ? "none" : c.direct ? "direct" : c.val_deck ? "deck" : c.had_visit ? "visit-no-deck" : "no-visit";
  const cRows: ContractRow[] = contractRows
    .map((c) => ({
      id: c.id,
      address: c.address,
      agent: c.agent,
      sentAt: new Date(c.created_at).toISOString(),
      signedAt: c.completed_at ? new Date(c.completed_at).toISOString() : null,
      route: routeOf(c),
      appraisalId: c.linked,
      deckOpened: Boolean(c.deck_opened),
      portal: Boolean(c.portal),
    }))
    .sort((x, y) => y.sentAt.localeCompare(x.sentAt));
  const byRoute = Object.fromEntries(
    ROUTES.map((r) => {
      const rows = cRows.filter((c) => c.route === r);
      return [r, { sent: rows.length, signed: rows.filter((c) => c.signedAt).length }];
    })
  ) as Record<ContractRoute, { sent: number; signed: number }>;

  const p = portalRows[0];

  return {
    month,
    asAt: new Date().toISOString(),
    kinds,
    agentsSending: new Set(deckRows.map((d) => d.author)).size,
    agentsWithAppraisals: new Set(apprRows.filter((a) => !a.direct && (a.in_month || a.valued)).map((a) => a.agent)).size,
    answered: answerRows[0]?.n ?? 0,
    valuations: {
      total: real.length,
      withDeck: real.filter((a) => a.has_post).length,
      withoutDeck: real.filter((a) => !a.has_post).length,
      withoutDeckNoVisit: real.filter((a) => !a.has_post && !a.had_visit).length,
      direct: valued.length - real.length,
    },
    agents,
    withoutDeck,
    contracts: { sent: cRows.length, signed: cRows.filter((c) => c.signedAt).length, byRoute, rows: cRows },
    portal: { invited: p?.invited ?? 0, signedIn: p?.signed_in ?? 0, accounts: p?.accounts ?? 0, everSignedIn: p?.ever ?? 0 },
  };
}
