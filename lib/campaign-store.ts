import "server-only";
import { hasDb, q } from "@/lib/db";
import { CAMPAIGNS, campaignsForReason, type Campaign, type CampaignAudience } from "@/lib/campaigns";

/**
 * Campaigns as they actually are: the built-in set, with marketing's edits
 * laid over the top, plus the ones marketing wrote from scratch.
 *
 * ── Overrides ─────────────────────────────────────────────────────────────
 *
 * A row in os_campaigns with a built-in's id REPLACES that built-in. That is
 * how Francesca edits a campaign that ships in code without a deploy: the
 * code copy is the starting point and the fallback, the row is what runs.
 * Deleting the row reverts to the code, which is the cheapest undo there is.
 *
 * ── One loader ────────────────────────────────────────────────────────────
 *
 * The scheduler, the marketing screen, the agent's picker and the lead spine
 * all ask THIS for the list, so none of them can disagree about which
 * campaign is live or what its steps are.
 */

export type ListedCampaign = Campaign & {
  /** built-in | overridden | written here */
  source: "built-in" | "overridden" | "written here";
};

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  audience: string;
  reasons: unknown;
  aim: string;
  status: string;
  steps: unknown;
}

const fromRow = (r: Row): Campaign => ({
  id: r.id,
  name: r.name,
  audience: r.audience === "lost" ? "lost" : "nurture",
  reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
  aim: r.aim,
  status: r.status === "live" ? "live" : "draft",
  steps: Array.isArray(r.steps) ? (r.steps as Campaign["steps"]) : [],
});

export async function loadCampaigns(): Promise<ListedCampaign[]> {
  const stored = hasDb()
    ? await q<Row>(`SELECT id, name, audience, reasons, aim, status, steps FROM os_campaigns ORDER BY created_at`).catch(
        () => [] as Row[]
      )
    : [];
  const byId = new Map(stored.map((r) => [r.id, fromRow(r)]));
  const out: ListedCampaign[] = CAMPAIGNS.map((c) => {
    const over = byId.get(c.id);
    if (over) {
      byId.delete(c.id);
      return { ...over, source: "overridden" };
    }
    return { ...c, source: "built-in" };
  });
  for (const c of byId.values()) out.push({ ...c, source: "written here" });
  return out;
}

export async function campaignsById(): Promise<Map<string, Campaign>> {
  const all = await loadCampaigns();
  return new Map(all.map((c) => [c.id, c]));
}

/* ─────────────────────────── enrolling a lead ─────────────────────────── */

export interface LeadFacts {
  leadId: string;
  name: string;
  email: string;
  /** The REX contact the sends go to, when the lead has one. */
  rexContactId: string | null;
}

export interface Enrolled {
  campaign: Campaign;
  /** The other live campaigns on the same reason - the test this one is part of. */
  alternatives: Campaign[];
  already: boolean;
}

/**
 * Put a lead on the campaign written for its reason.
 *
 * Balanced, not random: with two live campaigns on one reason the next lead
 * goes to whichever has fewer people on it, so the two halves of a test stay
 * the same size. One active enrolment per lead across ALL campaigns - a lead
 * is nurtured by one sequence at a time, or two campaigns would both write
 * to the same landlord.
 */
export async function enrolLead(
  facts: LeadFacts,
  reason: string,
  audience: CampaignAudience,
  source: string
): Promise<Enrolled | null> {
  if (!hasDb()) return null;
  const all = await loadCampaigns();
  const fits = campaignsForReason(reason, audience, all);
  if (!fits.length) return null;

  const active = await activeEnrolment(facts.leadId);
  if (active) {
    const campaign = all.find((c) => c.id === active.campaign_id);
    if (campaign) return { campaign, alternatives: fits.filter((c) => c.id !== campaign.id), already: true };
  }

  const counts = await q<{ campaign_id: string; n: string }>(
    `SELECT campaign_id, COUNT(*)::text AS n FROM os_campaign_enrolments
      WHERE campaign_id = ANY($1) GROUP BY campaign_id`,
    [fits.map((c) => c.id)]
  );
  const n = new Map(counts.map((r) => [r.campaign_id, Number(r.n)]));
  const pick = [...fits].sort((a, b) => (n.get(a.id) ?? 0) - (n.get(b.id) ?? 0))[0];

  await q(
    `INSERT INTO os_campaign_enrolments
       (id, campaign_id, record_type, record_id, name, email, reason, rex_contact_id, source)
     VALUES ($1, $2, 'lead', $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [
      `${pick.id}:${facts.leadId}:${Date.now()}`,
      pick.id,
      facts.leadId,
      facts.name,
      facts.email,
      reason,
      facts.rexContactId,
      source,
    ]
  );
  return { campaign: pick, alternatives: fits.filter((c) => c.id !== pick.id), already: false };
}

export interface ActiveEnrolment extends Record<string, unknown> {
  id: string;
  campaign_id: string;
  reason: string;
  enrolled_at: Date;
  last_step_sent: number;
}

export async function activeEnrolment(leadId: string): Promise<ActiveEnrolment | null> {
  if (!hasDb()) return null;
  const rows = await q<ActiveEnrolment>(
    `SELECT id, campaign_id, reason, enrolled_at, last_step_sent
       FROM os_campaign_enrolments
      WHERE record_id = $1 AND status = 'active'
      ORDER BY enrolled_at DESC LIMIT 1`,
    [leadId]
  );
  return rows[0] ?? null;
}

/** What the lead is on, named, for the drawer. */
export async function campaignOn(leadId: string): Promise<{ id: string; name: string; since: string; step: number } | null> {
  const row = await activeEnrolment(leadId);
  if (!row) return null;
  const c = (await campaignsById()).get(row.campaign_id);
  return {
    id: row.campaign_id,
    name: c?.name ?? row.campaign_id,
    since: new Date(row.enrolled_at).toISOString(),
    step: row.last_step_sent + 1,
  };
}

/**
 * Take a lead off every campaign it is on, saying why.
 *
 * The row stays. "replied" and "booked" are the whole point of the exercise,
 * and a campaign that deleted its successes could never be judged.
 */
export async function stopLeadCampaigns(leadId: string, why: string): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ id: string }>(
    `UPDATE os_campaign_enrolments
        SET status = 'stopped', stopped_at = NOW(), stopped_reason = $2
      WHERE record_id = $1 AND status = 'active'
      RETURNING id`,
    [leadId, why]
  );
  return rows.length;
}

/* ─────────────────────────── how they did ─────────────────────────── */

export interface CampaignResult {
  live: number;
  total: number;
  replied: number;
  booked: number;
  finished: number;
}

/** Per campaign: who is on it now, and what happened to the rest. */
export async function campaignResults(): Promise<Record<string, CampaignResult>> {
  if (!hasDb()) return {};
  const rows = await q<{ campaign_id: string; live: string; total: string; replied: string; booked: string; finished: string }>(
    `SELECT campaign_id,
            COUNT(*) FILTER (WHERE status = 'active')::text AS live,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE stopped_reason IN ('replied', 'back on the spine'))::text AS replied,
            COUNT(*) FILTER (WHERE stopped_reason = 'booked')::text AS booked,
            COUNT(*) FILTER (WHERE status = 'finished')::text AS finished
       FROM os_campaign_enrolments GROUP BY campaign_id`
  );
  const out: Record<string, CampaignResult> = {};
  for (const r of rows) {
    out[r.campaign_id] = {
      live: Number(r.live),
      total: Number(r.total),
      replied: Number(r.replied),
      booked: Number(r.booked),
      finished: Number(r.finished),
    };
  }
  return out;
}
