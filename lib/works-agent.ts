import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import type { WorksOrder } from "@/lib/works-orders";

/**
 * Whose name a job's emails go out in when the move came from a public page
 * (the contractor's, the tenant's) rather than from a signed-in person: the
 * agent who raised the job, matched by name, else the first owner.
 */
export async function agentFor(o: WorksOrder): Promise<OsUser | null> {
  if (!hasDb()) return null;
  const rows = await q<{ id: string; email: string; name: string; role: string; rex_user_id: string | null; photo: string | null; created_at: Date }>(
    `SELECT id, email, name, role, rex_user_id, photo, created_at FROM os_users
      WHERE lower(name) = lower($1) OR lower(email) = lower($1)
      UNION ALL
      SELECT id, email, name, role, rex_user_id, photo, created_at FROM os_users WHERE role = 'owner'
      LIMIT 1`,
    [o.raisedBy]
  ).catch(() => []);
  const r = rows[0];
  return r ? ({ id: r.id, email: r.email, name: r.name, role: r.role, rexUserId: r.rex_user_id, photo: r.photo, createdAt: r.created_at } as unknown as OsUser) : null;
}
