import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Campaigns: a sequence of cards and letters around a moment.
 *
 * Spectre's shape, which is the right one: a campaign has a trigger (the
 * anniversary, a purchase, a private listing), and steps at offsets from it
 * ("12 weeks before, postcard, active"). Every morning the queue is built:
 * for each active step, every door whose trigger date plus the offset falls
 * today or in the last week, not already queued for that step, becomes a
 * send. Then the checks: a landlord marked Do not send, a door marked do not
 * contact, a step with no copy, no owner address to write to, a card to the
 * same door inside 21 days - each is a HOLD with its reason on the row, not
 * a silent skip. Only a queued row with an address goes to the print house,
 * and the print house is not connected yet, so today everything that would
 * go sits as queued and the Postcards room shows exactly what would have
 * gone and why the rest did not.
 *
 * Copy carries merge fields: {address}, {postcode}, {agent}, {anniversary},
 * {landlord}, {since}. The template is plain text; the card design around it
 * is James's.
 */

export type MailType = "postcard" | "letter";
export type Trigger = "anniversary" | "just_bought" | "self_managing";

export interface Campaign {
  id: number;
  key: string;
  name: string;
  trigger: Trigger;
  active: boolean;
  fallback_to_property: boolean;
  steps: Step[];
  stats: { queued: number; held: number; sent: number; due_7: number };
}

export interface Step {
  id: number;
  campaign_id: number;
  title: string;
  offset_days: number;
  mail_type: MailType;
  active: boolean;
  copy: string;
  sort: number;
}

export interface Send extends Record<string, unknown> {
  id: number;
  campaign_id: number;
  step_id: number;
  campaign_name: string;
  step_title: string;
  mail_type: MailType;
  property_key: string;
  address: string;
  to_name: string | null;
  to_address: string | null;
  due_on: string;
  status: "queued" | "held" | "sent" | "skipped" | "cancelled";
  reason: string | null;
  created_at: string;
  sent_at: string | null;
  /** The card's QR code, and what came of it. */
  qr_token: string | null;
  scans: number;
  responses: number;
}

const TRIGGER_LABEL: Record<Trigger, string> = {
  anniversary: "Tenancy anniversary",
  just_bought: "Just bought",
  self_managing: "Self-managing listing",
};
export { TRIGGER_LABEL };

/** The two campaigns every branch starts with. Copy is a draft for James to sign. */
const DEFAULTS: Array<{ key: string; name: string; trigger: Trigger; steps: Array<Omit<Step, "id" | "campaign_id">> }> = [
  {
    key: "renewal",
    name: "1 Year Renewal",
    trigger: "anniversary",
    steps: [
      {
        title: "12 weeks before",
        offset_days: -84,
        mail_type: "postcard",
        active: true,
        sort: 1,
        copy:
          "Your tenancy at {address} comes up for renewal around {anniversary}. If you would like a second opinion on the rent, or a hand with the renewal paperwork, we are a short walk away. The Lettings Experts, {phone}.",
      },
      { title: "8 weeks before", offset_days: -56, mail_type: "postcard", active: false, sort: 2, copy: "" },
      {
        title: "6 weeks before",
        offset_days: -42,
        mail_type: "postcard",
        active: true,
        sort: 3,
        copy:
          "Six weeks to the anniversary at {address}. Rents on your street have moved since {since}; we can tell you where yours sits, free and with no obligation. The Lettings Experts, {phone}.",
      },
      {
        title: "4 weeks before",
        offset_days: -28,
        mail_type: "letter",
        active: true,
        sort: 4,
        copy:
          "Dear {landlord},\n\nThe tenancy at {address} reaches its anniversary around {anniversary}. This is the moment most landlords review the rent and the service they are getting.\n\nWe manage homes across your area and would be glad to show you what a switch would look like: the rent we would set, what we charge, and how we handle the changeover so your tenant barely notices.\n\nIf now is not the time, keep this letter for when it is.\n\nKind regards,\nThe Lettings Experts",
      },
    ],
  },
  {
    key: "just_bought",
    name: "Just Bought",
    trigger: "just_bought",
    steps: [
      {
        title: "As soon as we see it",
        offset_days: 0,
        mail_type: "letter",
        active: true,
        sort: 1,
        copy:
          "Dear {landlord},\n\nCongratulations on {address}. If it is going to be let, the first few weeks decide how the next few years go: the right rent, the right tenant, the compliance sorted before anybody moves in.\n\nWe would be glad to help with any of it, from a free rent check to full management.\n\nKind regards,\nThe Lettings Experts",
      },
      { title: "Two weeks later", offset_days: 14, mail_type: "postcard", active: true, sort: 2, copy: "Still deciding how to run {address}? A ten-minute call with us will settle the rent question. The Lettings Experts, {phone}." },
    ],
  },
];

export async function seedCampaigns(): Promise<void> {
  if (!hasDb()) return;
  for (const c of DEFAULTS) {
    const [row] = await q<{ id: number }>(
      `INSERT INTO os_bond_campaigns (key, name, trigger) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key RETURNING id`,
      [c.key, c.name, c.trigger]
    );
    const [{ n }] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_bond_campaign_steps WHERE campaign_id = $1`, [row.id]);
    if (Number(n) > 0) continue;
    for (const s of c.steps) {
      await q(
        `INSERT INTO os_bond_campaign_steps (campaign_id, title, offset_days, mail_type, active, copy, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [row.id, s.title, s.offset_days, s.mail_type, s.active, s.copy, s.sort]
      );
    }
  }
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (!hasDb()) return [];
  await seedCampaigns();
  const cs = await q<Record<string, unknown>>(`SELECT * FROM os_bond_campaigns ORDER BY id`);
  const steps = await q<Record<string, unknown>>(`SELECT * FROM os_bond_campaign_steps ORDER BY campaign_id, sort, id`);
  const stats = await q<{ campaign_id: number; status: string; n: string; due7: string }>(
    `SELECT campaign_id, status, count(*) AS n,
            count(*) FILTER (WHERE status = 'queued' AND due_on <= CURRENT_DATE + 7) AS due7
       FROM os_bond_campaign_sends GROUP BY campaign_id, status`
  );
  return cs.map((c) => {
    const id = Number(c.id);
    const mine = stats.filter((s) => Number(s.campaign_id) === id);
    const n = (st: string) => Number(mine.find((s) => s.status === st)?.n ?? 0);
    return {
      id,
      key: String(c.key),
      name: String(c.name),
      trigger: c.trigger as Trigger,
      active: Boolean(c.active),
      fallback_to_property: Boolean(c.fallback_to_property),
      steps: steps
        .filter((s) => Number(s.campaign_id) === id)
        .map((s) => ({
          id: Number(s.id),
          campaign_id: id,
          title: String(s.title),
          offset_days: Number(s.offset_days),
          mail_type: s.mail_type === "letter" ? "letter" : "postcard",
          active: Boolean(s.active),
          copy: String(s.copy ?? ""),
          sort: Number(s.sort),
        })),
      stats: { queued: n("queued"), held: n("held"), sent: n("sent"), due_7: Number(mine.find((s) => s.status === "queued")?.due7 ?? 0) },
    };
  });
}

export async function updateStep(id: number, patch: { title?: unknown; offset_days?: unknown; mail_type?: unknown; active?: unknown; copy?: unknown }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (patch.title !== undefined) { vals.push(String(patch.title).trim().slice(0, 80)); sets.push(`title = $${vals.length}`); }
  if (patch.offset_days !== undefined) {
    const d = Math.round(Number(patch.offset_days));
    if (!Number.isFinite(d) || d < -365 || d > 365) throw new Error("The offset must be within a year either side.");
    vals.push(d); sets.push(`offset_days = $${vals.length}`);
  }
  if (patch.mail_type !== undefined) { vals.push(patch.mail_type === "letter" ? "letter" : "postcard"); sets.push(`mail_type = $${vals.length}`); }
  if (patch.active !== undefined) { vals.push(Boolean(patch.active)); sets.push(`active = $${vals.length}`); }
  if (patch.copy !== undefined) { vals.push(String(patch.copy ?? "").slice(0, 4000)); sets.push(`copy = $${vals.length}`); }
  if (!sets.length) throw new Error("Nothing to change.");
  await q(`UPDATE os_bond_campaign_steps SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, vals);
}

export async function updateCampaign(id: number, patch: { active?: unknown; fallback_to_property?: unknown; name?: unknown }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (patch.active !== undefined) { vals.push(Boolean(patch.active)); sets.push(`active = $${vals.length}`); }
  if (patch.fallback_to_property !== undefined) { vals.push(Boolean(patch.fallback_to_property)); sets.push(`fallback_to_property = $${vals.length}`); }
  if (patch.name !== undefined) { vals.push(String(patch.name).trim().slice(0, 80)); sets.push(`name = $${vals.length}`); }
  if (!sets.length) throw new Error("Nothing to change.");
  await q(`UPDATE os_bond_campaigns SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, vals);
}

/**
 * Build today's queue. Idempotent: a door gets one row per step per
 * trigger date, so running twice does nothing the second time.
 */
export async function queueSends(): Promise<{ queued: number; held: number }> {
  if (!hasDb()) return { queued: 0, held: 0 };
  await seedCampaigns();
  /* A hold is a verdict on the morning it was given. An owner recorded on
     Tuesday should free Monday's card, so recent holds are thrown away and
     judged again; a queued or sent row is never touched. */
  await q(`DELETE FROM os_bond_campaign_sends WHERE status = 'held' AND due_on >= CURRENT_DATE - 30`);
  const campaigns = (await listCampaigns()).filter((c) => c.active);
  let queued = 0;
  let held = 0;

  for (const c of campaigns) {
    for (const step of c.steps) {
      /* The doors whose trigger date plus the offset is today, or was in
         the last seven days (a missed morning must not lose the step). */
      const triggerSql =
        c.trigger === "anniversary"
          ? `p.next_anniversary IS NOT NULL AND (p.next_anniversary + ($1 || ' days')::interval)::date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE`
          : c.trigger === "just_bought"
            ? `p.signals @> '[{"key":"just_bought"}]'::jsonb AND (p.first_flagged::date + ($1 || ' days')::interval)::date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE`
            : `p.signals @> '[{"key":"self_managing"}]'::jsonb AND (p.first_flagged::date + ($1 || ' days')::interval)::date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE`;
      const dueExpr =
        c.trigger === "anniversary"
          ? `(p.next_anniversary + ($1 || ' days')::interval)::date`
          : `(p.first_flagged::date + ($1 || ' days')::interval)::date`;

      const doors = await q<{
        property_key: string; address: string; postcode: string; stage: string; due_on: string;
        owner_name: string | null; owner_address: string | null;
        landlord_name: string | null; landlord_address: string | null; landlord_status: string | null;
        recent: string | null;
      }>(
        `SELECT p.property_key, coalesce(p.resolved_address, p.address) AS address, p.postcode, p.stage,
                ${dueExpr}::text AS due_on,
                o.owner_name, o.correspondence_address AS owner_address,
                l.name AS landlord_name, l.address AS landlord_address, l.marketing_status AS landlord_status,
                (SELECT max(s.created_at)::text FROM os_bond_campaign_sends s
                  WHERE s.property_key = p.property_key AND s.status IN ('queued','sent') AND s.created_at > NOW() - INTERVAL '21 days') AS recent
           FROM os_radar_prospects p
           LEFT JOIN LATERAL (
             SELECT owner_name, correspondence_address FROM os_bond_owner_lookups
              WHERE property_key = p.property_key AND status = 'found'
              ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1) o ON TRUE
           LEFT JOIN LATERAL (
             SELECT l.name, l.address, l.marketing_status FROM os_bond_landlord_doors d JOIN os_bond_landlords l ON l.landlord_key = d.landlord_key
              WHERE d.property_key = p.property_key ORDER BY l.score DESC LIMIT 1) l ON TRUE
          WHERE ${triggerSql}
            AND NOT EXISTS (
              SELECT 1 FROM os_bond_campaign_sends s
               WHERE s.step_id = $2 AND s.property_key = p.property_key AND s.due_on = ${dueExpr})`,
        [String(step.offset_days), step.id]
      );

      for (const d of doors) {
        const toName = d.owner_name ?? d.landlord_name ?? null;
        const toAddress = d.owner_address ?? d.landlord_address ?? null;
        let status: "queued" | "held" = "queued";
        let reason: string | null = null;
        if (!step.active) { status = "held"; reason = "Step switched off"; }
        else if (!step.copy.trim()) { status = "held"; reason = "No copy on this step yet"; }
        else if (d.landlord_status === "do_not_send") { status = "held"; reason = "Landlord marked Do not send"; }
        else if (d.stage === "do_not_contact") { status = "held"; reason = "Door marked do not contact"; }
        else if (d.recent) { status = "held"; reason = "Written to inside 21 days"; }
        else if (!toAddress && !c.fallback_to_property) { status = "held"; reason = "No owner address on file"; }
        const finalAddress = toAddress ?? (c.fallback_to_property ? `The Owner, ${d.address}, ${d.postcode}` : null);
        await q(
          `INSERT INTO os_bond_campaign_sends
             (campaign_id, step_id, property_key, address, to_name, to_address, due_on, status, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [c.id, step.id, d.property_key, `${d.address}, ${d.postcode}`.replace(/^, /, ""), toName, finalAddress, d.due_on, status, reason]
        );
        if (status === "queued") queued++;
        else held++;
      }
    }
  }
  return { queued, held };
}

export async function listSends(limit = 300): Promise<Send[]> {
  if (!hasDb()) return [];
  const rows = await q<Send>(
    `SELECT s.*, c.name AS campaign_name, st.title AS step_title, st.mail_type, coalesce(l.scans, 0) AS scans, coalesce(l.responses, 0) AS responses
       FROM os_bond_campaign_sends s
       JOIN os_bond_campaigns c ON c.id = s.campaign_id
       JOIN os_bond_campaign_steps st ON st.id = s.step_id
       LEFT JOIN os_bond_qr_links l ON l.send_id = s.id
      ORDER BY CASE s.status WHEN 'queued' THEN 0 WHEN 'held' THEN 1 ELSE 2 END, s.due_on, s.id DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    due_on: String(r.due_on).slice(0, 10),
    created_at: new Date(r.created_at as string).toISOString(),
    sent_at: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
    qr_token: (r.qr_token as string) ?? null,
    scans: Number(r.scans ?? 0),
    responses: Number(r.responses ?? 0),
  }));
}

/** Fill the merge fields for a preview. */
export function mergeCopy(copy: string, f: Record<string, string | null | undefined>): string {
  return copy.replace(/\{(\w+)\}/g, (_, k: string) => (f[k] && String(f[k]).trim()) || `{${k}}`);
}
