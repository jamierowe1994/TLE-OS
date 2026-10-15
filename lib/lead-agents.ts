import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexConfigured } from "@/lib/rex";

/**
 * Every agent a lead can be passed to, with where their work is (Dan
 * Richards, 15 Oct 2026: "a reassign list of all the agents and their
 * locations").
 *
 * WHO: Letting Experts in REX (lib/rex-agents lettingsAgents) and everybody
 * with an OS account linked to a REX user, merged by email - an agent with no
 * OS account yet still has a board waiting for them, keyed by their REX id.
 *
 * WHERE: nobody's patch is written down anywhere, so it is read from their
 * work: the towns of the homes their leads asked about over the last six
 * months (os_leads joined to the listings book on file), busiest first. An
 * agent with no leads on a listed home says so rather than guessing.
 */

export interface LeadAgent {
  /** What the picker sends back: their REX id, or their email when they have none. */
  key: string;
  name: string;
  email: string;
  rexUserId: string | null;
  /** Busiest first, at most three. */
  towns: string[];
}

const G = globalThis as unknown as { __leadAgents?: { at: number; rows: LeadAgent[] } };
const TTL_MS = 60 * 60 * 1000;

/** A postcode at the end of a locality ("Bristol BS16 4LT") is not part of the town. */
const POSTCODE_TAIL = "\\s*[A-Z]{1,2}[0-9][0-9A-Z]?\\s*[0-9][A-Z]{2}\\s*$";

async function townsByAgent(): Promise<Map<string, string[]>> {
  if (!hasDb()) return new Map();
  const rows = await q<{ assignee_id: string; town: string }>(
    `WITH homes AS (
       SELECT x->>'id' AS id, trim(regexp_replace(COALESCE(x->>'locality', ''), $1, '')) AS town
         FROM os_cache, jsonb_array_elements(COALESCE(payload->'book'->'listings', '[]'::jsonb)) x
        WHERE key = 'listings:v4:all'
     ), t AS (
       SELECT l.assignee_id, h.town, COUNT(*) AS n,
              row_number() OVER (PARTITION BY l.assignee_id ORDER BY COUNT(*) DESC, h.town) AS rk
         FROM os_leads l JOIN homes h ON h.id = l.listing_id
        WHERE l.assignee_id IS NOT NULL AND h.town <> '' AND l.received_at > NOW() - INTERVAL '180 days'
        GROUP BY 1, 2
     )
     SELECT assignee_id, town FROM t WHERE rk <= 3 ORDER BY assignee_id, rk`,
    [POSTCODE_TAIL]
  ).catch(() => []);
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.assignee_id, [...(out.get(r.assignee_id) ?? []), r.town]);
  return out;
}

export async function leadAgents(): Promise<LeadAgent[]> {
  const held = G.__leadAgents;
  if (held && Date.now() - held.at < TTL_MS) return held.rows;

  const byEmail = new Map<string, { name: string; email: string; rexUserId: string | null }>();
  if (rexConfigured()) {
    const { lettingsAgents } = await import("@/lib/rex-agents");
    for (const a of await lettingsAgents().catch(() => [])) {
      byEmail.set(a.email, { name: a.name, email: a.email, rexUserId: a.id || null });
    }
  }
  if (hasDb()) {
    /* OS accounts with the agent role (Bernadine Williams signs in to REX on
       a Property Experts address, so REX's own list leaves her out). The
       office's own accounts are not agents a lead goes to. Locked accounts
       are not offered. */
    const users = await q<{ email: string; name: string; rex_user_id: string | null }>(
      `SELECT email, name, rex_user_id FROM os_users
        WHERE locked_at IS NULL AND role = 'agent'`
    ).catch(() => []);
    for (const u of users) {
      const email = u.email.trim().toLowerCase();
      const had = byEmail.get(email) ?? [...byEmail.values()].find((a) => u.rex_user_id && a.rexUserId === u.rex_user_id);
      if (had) {
        /* Their OS address is the one they sign in with, so it is the one
           a hand-added lead passed to them is matched on. */
        had.rexUserId ??= u.rex_user_id;
        had.email = email;
        continue;
      }
      byEmail.set(email, { name: u.name?.trim() || email, email, rexUserId: u.rex_user_id });
    }
  }
  const towns = await townsByAgent();
  const rows = [...byEmail.values()]
    .map((a) => ({ key: a.rexUserId ?? a.email, ...a, towns: a.rexUserId ? towns.get(a.rexUserId) ?? [] : [] }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  if (rows.length) G.__leadAgents = { at: Date.now(), rows };
  return rows;
}
