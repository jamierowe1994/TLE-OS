import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import type { WorksOrder } from "@/lib/works-orders";
import { propertyAgentFor } from "@/lib/works-property-agent";
import { neverSendsOut } from "@/lib/not-a-sender";

/**
 * Whose name a job's emails go out in when the move came from a public page
 * (the contractor's, the tenant's) or the works sweep rather than from a
 * signed-in person. The email goes from that person's own mailbox, so it has
 * to be somebody who works the job:
 *
 *   1. the person who raised it, when that is one of our people
 *   2. the last of our people to move the job - who the contractor dealt with
 *   3. the home's agent (lib/works-property-agent)
 *
 * Nobody else, and never an owner by default (28 Oct 2026). This used to fall
 * back to "the first owner" for a job a tenant raised, which was James: the
 * "All done?" on job #1019 went to Sean McMahon's contractor from James's
 * Recruitment Experts mailbox, signed by him. null means nobody fits, and the
 * caller sends nothing rather than guess.
 */
type Row = { id: string; email: string; name: string; role: string; rex_user_id: string | null; photo: string | null; created_at: Date };

const toUser = (r: Row) =>
  ({ id: r.id, email: r.email, name: r.name, role: r.role, rexUserId: r.rex_user_id, photo: r.photo, createdAt: r.created_at }) as unknown as OsUser;

/** One unlocked login answering to this name or email; two is a guess, so none. */
async function personCalled(nameOrEmail: string): Promise<OsUser | null> {
  const key = nameOrEmail.trim();
  if (!key) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, role, rex_user_id, photo, created_at FROM os_users
      WHERE locked_at IS NULL AND email <> '' AND (lower(name) = lower($1) OR lower(email) = lower($1))
      LIMIT 2`,
    [key]
  ).catch(() => []);
  /* James is never the one a job's email goes out as (lib/not-a-sender): the next in line is. */
  return rows.length === 1 && !neverSendsOut(rows[0].email) ? toUser(rows[0]) : null;
}

export async function agentFor(o: WorksOrder): Promise<OsUser | null> {
  if (!hasDb()) return null;

  const raiser = await personCalled(o.raisedBy);
  if (raiser) return raiser;

  /* The timeline's "by" is the person's name; "TLE OS" and the contractor's
     or tenant's own lines never match a login. */
  const movers = await q<{ by_name: string }>(
    `SELECT by_name FROM os_works_order_events WHERE order_id = $1 AND by_name <> 'TLE OS' ORDER BY at DESC LIMIT 40`,
    [o.id]
  ).catch(() => []);
  const tried = new Set<string>();
  for (const m of movers) {
    const name = m.by_name.trim().toLowerCase();
    if (!name || tried.has(name)) continue;
    tried.add(name);
    const who = await personCalled(m.by_name);
    if (who) return who;
  }

  const home = await propertyAgentFor(o).catch(() => null);
  return home ? await personCalled(home.email) : null;
}
