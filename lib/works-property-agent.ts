import "server-only";
import { hasDb, q } from "@/lib/db";
import { heldComplianceBook } from "@/lib/compliance-cache";
import type { WorksOrder } from "@/lib/works-orders";

/**
 * The agent who looks after a job's home, for the copy of every contractor
 * email (James, 9 Oct 2026: "CC the property agent into the contractor
 * emails"). Not the person who pressed Send - that is often the office.
 *
 * The home's agent is read the way Michael's view reads it: the compliance
 * book's agent (the one on the home's latest listing), else the name Susan's
 * PayProp sweep put on os_properties. Held copies only, never a REX walk, so
 * a send never waits on it.
 *
 * The name is then matched to an OS login, because a copy needs an address
 * and only our own people have one here. The book spells names its own way
 * ("Lianna Denholm" for "Lianna Jane Denholm"), so first and last name are
 * enough. An agent with no login (Sean McMahon's homes, say) gets no copy,
 * and null says so rather than guessing at somebody else.
 */
export async function propertyAgentFor(o: Pick<WorksOrder, "propertyId">): Promise<{ name: string; email: string } | null> {
  if (!hasDb() || !o.propertyId) return null;
  const id = o.propertyId;

  let name: string | null = null;
  const held = await heldComplianceBook().catch(() => null);
  name = held?.book.properties.find((p) => p.id === id)?.agent?.trim() || null;
  if (!name) {
    const rows = await q<{ agent_name: string | null }>(
      `SELECT agent_name FROM os_properties
        WHERE (id = $1 OR rex_property_id = $1) AND COALESCE(agent_name, '') <> ''
        ORDER BY (id = $1) DESC LIMIT 1`,
      [id]
    ).catch(() => []);
    name = rows[0]?.agent_name?.trim() || null;
  }
  if (!name) return null;

  const users = await q<{ name: string; email: string; role: string }>(
    `SELECT name, email, role FROM os_users WHERE email <> ''`
  ).catch(() => []);
  const words = (s: string) => s.toLowerCase().replace(/[^a-z\s-]/g, "").split(/[\s-]+/).filter(Boolean);
  const want = words(name);
  if (want.length === 0) return null;
  const exact = users.filter((u) => words(u.name).join(" ") === want.join(" "));
  const loose = users.filter((u) => {
    const w = words(u.name);
    return w.length >= 2 && want.length >= 2 && w[0] === want[0] && w[w.length - 1] === want[want.length - 1];
  });
  /* Two logins answering to one name is a guess either way: no copy. */
  const pick = exact.length === 1 ? exact[0] : exact.length === 0 && loose.length === 1 ? loose[0] : null;
  return pick ? { name: pick.name, email: pick.email.trim() } : null;
}
