import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The Bond process: six steps from a flagged door to a won instruction, and
 * where every door in the patch stands on it.
 *
 * James, 7 Sep 2026: "build it around those six steps" - flagged, postcard
 * or letter out, owner replied, call logged, appraisal booked, won - "and
 * track whether these leads are converting. If Bond is actually worth the
 * money, we're going to have to run a trial on it to prove that it works."
 *
 * ── Nothing is ticked ─────────────────────────────────────────────────────
 *
 * A door's step is READ from what happened, never set by hand:
 *
 *   1 flagged    the sweep scored it, or somebody added it
 *   2 sent       a card or letter went out (os_bond_postcards, or a campaign
 *                step marked sent)
 *   3 replied    the owner scanned the card and left their details
 *                (os_bond_qr_links.responses) - that is the moment a door
 *                becomes a lead in Leads, source "Bond postcard"
 *   4 called     somebody logged a call, text or visit on that lead
 *                (os_lead_touches), or moved the door to Contacted
 *   5 booked     an appraisal exists for that lead, or the door was moved
 *                to Appraisal booked
 *   6 won        the appraisal is won, or the door was moved to Won
 *
 * A door that was moved to Not interested or Do not contact leaves the
 * funnel and is counted as lost. The hand-set stage on the door still
 * counts, so a call made from a mobile and noted on the door is not lost
 * because it was not logged on the lead.
 *
 * ── Conversion ────────────────────────────────────────────────────────────
 *
 * Each step's count is doors that REACHED AT LEAST that step. The rate
 * between two steps is the second over the first. That is the number the
 * trial is judged on: of the doors written to, how many replied; of the
 * replies, how many became an appraisal; of those, how many were won.
 */

export const PROCESS_STEPS = [
  { id: "flagged", label: "Flagged", blurb: "Scored by the sweep, or added by hand." },
  { id: "sent", label: "Card out", blurb: "A postcard or letter has gone to the door." },
  { id: "replied", label: "Replied", blurb: "The owner scanned the card and left their details." },
  { id: "called", label: "Called", blurb: "A call, text or visit is logged." },
  { id: "booked", label: "Appraisal booked", blurb: "A visit is in the diary." },
  { id: "won", label: "Won", blurb: "Instructed. The door is ours." },
] as const;
export type ProcessStepId = (typeof PROCESS_STEPS)[number]["id"];

export interface ProcessFunnel {
  /** Doors that reached at least each step, in step order. */
  reached: number[];
  /** Conversion from the step before, as a whole percentage; null for the first. */
  rate: (number | null)[];
  /** Doors moved to Not interested or Do not contact. */
  lost: number;
  /** Which step each door is at (1-6), keyed by property_key. Doors with no step are absent. */
  doors: Record<string, number>;
  /** How many doors the funnel is over. */
  total: number;
}

const LOST = ["not_interested", "do_not_contact"];

export async function bondProcess(districts: string[] = []): Promise<ProcessFunnel> {
  const empty: ProcessFunnel = { reached: [0, 0, 0, 0, 0, 0], rate: [null, null, null, null, null, null], lost: 0, doors: {}, total: 0 };
  if (!hasDb()) return empty;

  /* One query, one row per flagged door, each fact as a boolean. The joins
     are all on property_key except the lead side, which goes door → QR link
     → contact → lead id ("os-" + contact id) → touches / appraisal. */
  const rows = await q<{
    property_key: string;
    stage: string;
    sent: boolean;
    replied: boolean;
    called: boolean;
    booked: boolean;
    won: boolean;
  }>(
    `WITH doors AS (
       SELECT property_key, stage
         FROM os_radar_prospects
        WHERE (score > 0 OR stage <> 'new')
          AND ($1::text[] = '{}' OR district = ANY($1::text[]))
     ),
     sent AS (
       SELECT property_key FROM os_bond_postcards WHERE status = 'sent'
       UNION
       SELECT property_key FROM os_bond_campaign_sends WHERE status = 'sent'
     ),
     replied AS (
       SELECT property_key, contact_id FROM os_bond_qr_links WHERE responses > 0 AND contact_id IS NOT NULL
     ),
     called AS (
       SELECT DISTINCT r.property_key
         FROM replied r
         JOIN os_lead_touches t ON t.lead_id = 'os-' || r.contact_id
        WHERE t.kind IN ('call', 'text', 'visit', 'email')
     ),
     booked AS (
       SELECT DISTINCT r.property_key, a.stage AS ma_stage
         FROM replied r
         JOIN os_market_appraisals a ON a.lead_id = 'os-' || r.contact_id
     )
     SELECT d.property_key, d.stage,
            EXISTS (SELECT 1 FROM sent s WHERE s.property_key = d.property_key) AS sent,
            EXISTS (SELECT 1 FROM replied r WHERE r.property_key = d.property_key) AS replied,
            EXISTS (SELECT 1 FROM called c WHERE c.property_key = d.property_key) AS called,
            EXISTS (SELECT 1 FROM booked b WHERE b.property_key = d.property_key) AS booked,
            EXISTS (SELECT 1 FROM booked b WHERE b.property_key = d.property_key AND b.ma_stage = 'won') AS won
       FROM doors d`,
    [districts]
  ).catch(() => []);

  const reached = [0, 0, 0, 0, 0, 0];
  const doors: Record<string, number> = {};
  let lost = 0;
  for (const r of rows) {
    if (LOST.includes(r.stage)) {
      lost += 1;
      continue;
    }
    /* The furthest step the facts support. The hand-set stage on the door
       lifts a door to Called, Booked or Won on its own. */
    let step = 1;
    if (r.sent) step = 2;
    if (r.replied) step = 3;
    if (r.called || r.stage === "contacted") step = Math.max(step, 4);
    if (r.booked || r.stage === "appraisal_booked") step = Math.max(step, 5);
    if (r.won || r.stage === "won") step = 6;
    doors[r.property_key] = step;
    for (let i = 0; i < step; i++) reached[i] += 1;
  }
  const rate = reached.map((n, i) => (i === 0 ? null : reached[i - 1] ? Math.round((n / reached[i - 1]) * 100) : null));
  return { reached, rate, lost, doors, total: rows.length };
}
