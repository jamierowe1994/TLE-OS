import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Notice } from "@/lib/notices";
import { ensure } from "@/lib/automations/store";

/**
 * What the bell says about automations, read from the runs themselves (the
 * bell has no table of its own - lib/notifications):
 *
 *   - a first send waiting for its owner to check (until they answer)
 *   - a "tell someone in the bell" action, to whoever it named
 */
export async function automationNotices(userId: string): Promise<Notice[]> {
  if (!hasDb()) return [];
  await ensure();
  const previews = await q<{ id: string; created_at: Date; name: string; who: string }>(
    `SELECT r.id, r.created_at, a.name, r.subject->>'name' AS who
       FROM os_automation_runs r JOIN os_automations a ON a.id = r.automation_id
      WHERE r.user_id = $1 AND r.state = 'preview' ORDER BY r.created_at DESC LIMIT 5`,
    [userId]
  );
  const told = await q<{ id: string; at: Date; name: string; detail: string }>(
    `SELECT r.id, r.finished_at AS at, a.name, o->>'detail' AS detail
       FROM os_automation_runs r JOIN os_automations a ON a.id = r.automation_id
       CROSS JOIN LATERAL jsonb_array_elements(r.outcomes) o
      WHERE r.state = 'done' AND o->>'toId' = $1 AND o->>'action' = 'Tell someone in the bell' AND r.finished_at > NOW() - INTERVAL '3 days'
      ORDER BY r.finished_at DESC LIMIT 10`,
    [userId]
  );
  return [
    ...previews.map((p): Notice => ({
      id: `automation-preview:${p.id}`,
      kind: "automation",
      at: new Date(p.created_at).toISOString(),
      title: `Check before it sends: ${p.name}`,
      body: `Your automation's first message${p.who ? ` to ${p.who}` : ""} is waiting for you. Nothing goes until you say so.`,
      href: `/profile?tab=automations&preview=${encodeURIComponent(p.id)}`,
      tone: "warn",
    })),
    ...told.map((t): Notice => ({
      id: `automation-told:${t.id}`,
      kind: "automation",
      at: new Date(t.at).toISOString(),
      title: t.name,
      body: t.detail,
      href: "/profile?tab=automations",
      tone: "none",
    })),
  ];
}
