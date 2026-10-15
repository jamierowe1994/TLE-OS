import "server-only";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import type { Who } from "@/lib/admin";
import type { Lead } from "@/lib/leads-sample";

/**
 * Who has a lead, when it is not who REX says (15 Oct 2026).
 *
 * Dan Richards: "I've had one mistakenly assigned to me and instead of
 * marking it lost so the other partner agent potentially misses out, I'd
 * rather mark it unassigned or not mine so that it goes back into a central
 * pool ... or a reassign list of all the agents and their locations."
 *
 * So a lead can be passed on from the OS, two ways:
 *   - to a named agent, who gets it on their board and a line in the bell;
 *   - back to the office: nobody's, sitting in "not assigned" on the board
 *     owners and the office see, until one of them gives it to somebody.
 *
 * ── Held in the OS, not written to REX ────────────────────────────────────
 *
 * os_lead_owners holds the current holder and wins over REX's assignee
 * everywhere a lead is scoped: the board (app/api/leads), who may open it
 * (lib/lead-access), the ledger's own reads and the bell (lib/lead-ledger).
 * REX's assignee is left as it was: changing it would be a new kind of REX
 * write (memory james-rex-hands-off), so it is not done at all. The next scan
 * still writes REX's assignee into os_leads; this table is read over it.
 *
 * Every move is also a line on the lead's own log (os_lead_touches, kind
 * "moved"), so the Activity panel says who passed it to whom and why.
 */

export interface LeadOwner {
  leadId: string;
  toRexUserId: string | null;
  toEmail: string | null;
  toName: string;
  pool: boolean;
  reason: string;
  fromName: string;
  byName: string;
  at: string;
}

interface Row extends Record<string, unknown> {
  lead_id: string;
  to_rex_user_id: string | null;
  to_email: string | null;
  to_name: string;
  pool: boolean;
  reason: string;
  from_name: string;
  by_name: string;
  at: Date | string;
}

const toOwner = (r: Row): LeadOwner => ({
  leadId: r.lead_id,
  toRexUserId: r.to_rex_user_id,
  toEmail: r.to_email,
  toName: r.to_name,
  pool: r.pool,
  reason: r.reason,
  fromName: r.from_name,
  byName: r.by_name,
  at: new Date(r.at).toISOString(),
});

/** What the board calls a lead with nobody on it (lib/rex-leads). */
export const UNASSIGNED = "Unassigned";

/**
 * "This lead is this REX user's", in SQL: REX's assignee unless the lead has
 * been passed on in the OS, and then the OS's holder. A lead back with the
 * office is nobody's, so it is on no agent's board. Written as two halves
 * rather than a COALESCE so the assignee index still does the work on a
 * ledger of tens of thousands. `a` is the os_leads alias, `param` the
 * placeholder holding the REX user id.
 */
export const leadHeldBySql = (a: string, param: string) =>
  `((${a}.assignee_id = ${param} AND NOT EXISTS (SELECT 1 FROM os_lead_owners o WHERE o.lead_id = ${a}.id))
    OR ${a}.id IN (SELECT o.lead_id FROM os_lead_owners o WHERE NOT o.pool AND o.to_rex_user_id = ${param}))`;

/** Has this lead been passed on in the OS at all? SQL, `a` the alias of a table with an `id`. */
export const passedOnSql = (a: string) => `EXISTS (SELECT 1 FROM os_lead_owners o WHERE o.lead_id = ${a}.id)`;

export async function ownersOf(ids: string[]): Promise<Map<string, LeadOwner>> {
  if (!hasDb() || !ids.length) return new Map();
  const rows = await q<Row>(`SELECT * FROM os_lead_owners WHERE lead_id = ANY($1::text[])`, [ids]);
  return new Map(rows.map((r) => [r.lead_id, toOwner(r)]));
}

export async function ownerOf(id: string): Promise<LeadOwner | null> {
  return (await ownersOf([id])).get(id) ?? null;
}

/** The leads passed TO this person, by REX id or by email. */
export async function passedTo(me: { rexUserId: string | null; email: string | null }): Promise<LeadOwner[]> {
  if (!hasDb() || (!me.rexUserId && !me.email)) return [];
  const rows = await q<Row>(
    `SELECT * FROM os_lead_owners
      WHERE NOT pool AND ((to_rex_user_id IS NOT NULL AND to_rex_user_id = $1) OR (to_email IS NOT NULL AND lower(to_email) = lower($2)))
      ORDER BY at DESC LIMIT 500`,
    [me.rexUserId ?? "", me.email ?? ""]
  );
  return rows.map(toOwner);
}

/** Every lead back with the office. */
export async function poolLeads(): Promise<LeadOwner[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_lead_owners WHERE pool ORDER BY at DESC LIMIT 500`);
  return rows.map(toOwner);
}

/** Is this holder the person in front of us? */
export function heldBy(o: LeadOwner, me: { rexUserId: string | null; email: string | null }): boolean {
  if (o.pool) return false;
  if (o.toRexUserId && me.rexUserId && String(o.toRexUserId) === String(me.rexUserId)) return true;
  return Boolean(o.toEmail && me.email && o.toEmail.trim().toLowerCase() === me.email.trim().toLowerCase());
}

/** Owners and the office (any role that sees the whole business) reassign any lead and work the pool. */
export function worksThePool(who: Pick<Who, "actor" | "viewingAs">): boolean {
  const a = who.actor;
  if (!a || who.viewingAs) return false;
  return a.role === "owner" || can(a.role, "see:everything");
}

/**
 * The board, with the OS's holders laid over REX's.
 *
 *   whole business  every lead stays; a passed-on one wears its new agent's
 *                   name, or "Unassigned" when it is back with the office,
 *                   so the board's own "not assigned" chip finds the pool
 *   one person      leads passed away from them leave; leads passed to them
 *                   join, read from the ledger (REX's walk for their scope
 *                   never returns them) and from the hand-added contacts
 */
export async function overlayOwners<L extends Lead>(
  leads: L[],
  scope: { everything: boolean; rexUserId: string | null },
  me: { email: string | null },
  fetchMine: (ids: string[]) => Promise<L[]>
): Promise<L[]> {
  if (!hasDb()) return leads;
  const owners = await ownersOf(leads.map((l) => l.id)).catch(() => new Map<string, LeadOwner>());
  const who = { rexUserId: scope.rexUserId, email: me.email };
  const dress = (l: L, o: LeadOwner): L => ({
    ...l,
    agent: o.pool ? UNASSIGNED : o.toName || l.agent,
    assigneeId: o.pool ? undefined : o.toRexUserId ?? l.assigneeId,
    passedOn: { toName: o.pool ? null : o.toName, byName: o.byName, fromName: o.fromName, at: o.at, reason: o.reason, pool: o.pool },
  });
  if (scope.everything) {
    const dressed = leads.map((l) => (owners.has(l.id) ? dress(l, owners.get(l.id)!) : l));
    /* The office's pool is always on their board, however old the lead:
       the board carries the newest 500, and a lead sent back from last
       month would otherwise wait where nobody could see it. */
    const have = new Set(leads.map((l) => l.id));
    const pool = (await poolLeads().catch(() => [])).filter((o) => !have.has(o.leadId));
    if (!pool.length) return dressed;
    const extra = await fetchMine(pool.map((o) => o.leadId)).catch(() => [] as L[]);
    const byId = new Map(pool.map((o) => [o.leadId, o]));
    return [...extra.map((l) => dress(l, byId.get(l.id)!)), ...dressed].sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
  }

  const kept = leads.filter((l) => {
    const o = owners.get(l.id);
    return !o || heldBy(o, who);
  }).map((l) => (owners.has(l.id) ? dress(l, owners.get(l.id)!) : l));
  const have = new Set(kept.map((l) => l.id));
  const mine = (await passedTo(who).catch(() => [])).filter((o) => !have.has(o.leadId));
  if (!mine.length) return kept;
  const extra = await fetchMine(mine.map((o) => o.leadId)).catch(() => [] as L[]);
  const byId = new Map(mine.map((o) => [o.leadId, o]));
  const joined = extra.map((l) => dress(l, byId.get(l.id)!));
  return [...joined, ...kept].sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
}

/** Record a move. Overwrites the holder; the log line is the caller's. */
export async function setOwner(p: {
  leadId: string;
  to: { rexUserId: string | null; email: string | null; name: string } | null;
  reason: string;
  fromName: string;
  by: { email: string; name: string };
}): Promise<LeadOwner> {
  const rows = await q<Row>(
    `INSERT INTO os_lead_owners (lead_id, to_rex_user_id, to_email, to_name, pool, reason, from_name, by_email, by_name, at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (lead_id) DO UPDATE SET
       to_rex_user_id = EXCLUDED.to_rex_user_id, to_email = EXCLUDED.to_email, to_name = EXCLUDED.to_name,
       pool = EXCLUDED.pool, reason = EXCLUDED.reason, from_name = EXCLUDED.from_name,
       by_email = EXCLUDED.by_email, by_name = EXCLUDED.by_name, at = NOW()
     RETURNING *`,
    [
      p.leadId,
      p.to?.rexUserId ?? null,
      p.to?.email?.trim().toLowerCase() || null,
      p.to?.name ?? "",
      !p.to,
      p.reason.trim().slice(0, 500),
      p.fromName,
      p.by.email.trim().toLowerCase(),
      p.by.name,
    ]
  );
  return toOwner(rows[0]);
}

/**
 * Leads passed to somebody in the last week, for their bell; and, for owners
 * and the office, leads sent back to the office that are still there.
 */
export async function movesForBell(p: { rexUserId: string | null; email: string; pool: boolean }): Promise<(LeadOwner & { name: string })[]> {
  if (!hasDb()) return [];
  const rows = await q<Row & { name: string | null }>(
    `SELECT o.*, COALESCE((SELECT l.name FROM os_leads l WHERE l.id = o.lead_id),
                          (SELECT c.name FROM os_contacts c WHERE 'os-' || c.id = o.lead_id)) AS name
       FROM os_lead_owners o
      WHERE o.at > NOW() - INTERVAL '7 days'
        AND lower(o.by_email) <> lower($2)
        AND ((NOT o.pool AND ((o.to_rex_user_id IS NOT NULL AND o.to_rex_user_id = $1) OR lower(COALESCE(o.to_email, '')) = lower($2)))
             OR (o.pool AND $3))
      ORDER BY o.at DESC LIMIT 25`,
    [p.rexUserId ?? "", p.email, p.pool]
  ).catch(() => []);
  return rows.map((r) => ({ ...toOwner(r), name: r.name?.trim() || "" }));
}
