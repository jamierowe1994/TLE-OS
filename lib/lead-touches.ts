import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import {
  foldSpine,
  type LeadTouch,
  type Spine,
  type TouchKind,
  type TouchOutcome,
} from "@/lib/lead-spine";

/**
 * The lead log - reading and writing os_lead_touches.
 *
 * A lead id is whatever the book uses: `rex-<id>` for a REX enquiry,
 * `os-<uuid>` for somebody added here. The log does not care which; the
 * prefix keeps them apart, as lib/contacts-as-leads explains.
 */

interface Row extends Record<string, unknown> {
  id: string;
  lead_id: string;
  kind: string;
  outcome: string | null;
  body: string;
  by_name: string;
  at: Date;
}

const toTouch = (r: Row): LeadTouch => ({
  id: r.id,
  leadId: r.lead_id,
  kind: r.kind as TouchKind,
  outcome: (r.outcome as TouchOutcome | null) ?? null,
  body: r.body,
  byName: r.by_name,
  at: new Date(r.at).toISOString(),
});

export async function listTouches(leadId: string): Promise<LeadTouch[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `select id, lead_id, kind, outcome, body, by_name, at
       from os_lead_touches where lead_id = $1 order by at desc`,
    [leadId]
  );
  return rows.map(toTouch);
}

export async function addTouch(p: {
  leadId: string;
  kind: TouchKind;
  outcome: TouchOutcome | null;
  body: string;
  byId: string | null;
  byName: string;
}): Promise<LeadTouch> {
  const rows = await q<Row>(
    `insert into os_lead_touches (id, lead_id, kind, outcome, body, by_id, by_name)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, lead_id, kind, outcome, body, by_name, at`,
    [uid(), p.leadId, p.kind, p.outcome, p.body.trim(), p.byId, p.byName]
  );
  return toTouch(rows[0]);
}

/** Whether an appraisal has been booked off this lead. */
export async function appraisalBooked(leadId: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ n: string }>(
    `select count(*)::text as n from os_market_appraisals where lead_id = $1`,
    [leadId]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function spineFor(leadId: string): Promise<{ touches: LeadTouch[]; spine: Spine }> {
  const [touches, booked] = await Promise.all([listTouches(leadId), appraisalBooked(leadId)]);
  return { touches, spine: foldSpine(touches, booked) };
}

/**
 * Every lead that has anything logged or booked, folded. For the list's
 * Stage column: a lead with nothing against it keeps REX's own word, so this
 * only ever returns the ones the OS knows something about. Small by nature.
 */
export async function allSpines(): Promise<Record<string, Spine>> {
  if (!hasDb()) return {};
  const [rows, booked] = await Promise.all([
    q<Row>(`select id, lead_id, kind, outcome, body, by_name, at from os_lead_touches order by at desc`),
    q<{ lead_id: string }>(`select distinct lead_id from os_market_appraisals where lead_id is not null`),
  ]);
  const byLead = new Map<string, LeadTouch[]>();
  for (const r of rows) {
    const list = byLead.get(r.lead_id) ?? [];
    list.push(toTouch(r));
    byLead.set(r.lead_id, list);
  }
  const bookedIds = new Set(booked.map((b) => b.lead_id));
  const out: Record<string, Spine> = {};
  for (const id of new Set([...byLead.keys(), ...bookedIds])) {
    out[id] = foldSpine(byLead.get(id) ?? [], bookedIds.has(id));
  }
  return out;
}
