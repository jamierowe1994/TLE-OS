import "server-only";
import { hasDb, q } from "@/lib/db";
import { firstNamesIn, initialOnly, nameFromEmail } from "@/lib/first-names";
import { nameKey } from "@/lib/tenant-contacts";

/**
 * A JOB'S TENANTS BY THEIR WHOLE NAMES (Lianna Denholm, 11 Nov 2026,
 * 1 Marchmont Road).
 *
 * A job keeps its own copy of the home's tenants from the day it was raised
 * (os_works_orders.tenants), so a name put right afterwards never reached a
 * job already open: the page, the works order and the contractor's link all
 * went on saying "A George". Every read of a job now lays the whole name over
 * an initial, from the same two places the home's page uses:
 *
 *   the name an agent typed for them (os_tenant_contacts.shown_as), found by
 *   their email and the record's spelling
 *   else their own email, where it says the first name plainly (lib/first-names)
 *
 * Only ever an initial becoming a whole name. A name typed on the job itself,
 * or one already whole, is never touched, and nothing is written back.
 */

type Named = { name: string; email: string };

let heldAt = 0;
let held: { shown: Map<string, string>; known: Set<string> } | null = null;

async function load(): Promise<{ shown: Map<string, string>; known: Set<string> }> {
  if (held && Date.now() - heldAt < 60_000) return held;
  const rows = await q<{ name: string; name_key: string; email: string | null; shown_as: string | null }>(
    `SELECT name, name_key, email, shown_as FROM os_tenant_contacts`
  ).catch(() => []);
  const shown = new Map<string, string>();
  for (const r of rows) if (r.shown_as && r.email) shown.set(`${r.email.trim().toLowerCase()}|${r.name_key}`, r.shown_as);
  /* Every first name the OS already holds, beside the common ones, to recognise one in an address. */
  const known = firstNamesIn(rows.flatMap((r) => [initialOnly(r.name) ? null : r.name, r.shown_as]));
  held = { shown, known };
  heldAt = Date.now();
  return held;
}

/** After a name is typed in: the next read sees it. */
export function forgetFullNames(): void {
  held = null;
}

/** The whole name for one tenant held by an initial, or null to leave them as they are. */
function fullName(t: Named, src: { shown: Map<string, string>; known: Set<string> }): string | null {
  if (!initialOnly(t.name)) return null;
  const email = t.email.trim().toLowerCase();
  return (email && src.shown.get(`${email}|${nameKey(t.name)}`)) || nameFromEmail(t.name, email, src.known);
}

/** The same people, each initial spelled out where the OS knows the name. The list itself is returned when nothing changes. */
export async function withFullNames<T extends Named>(tenants: T[]): Promise<T[]> {
  if (!hasDb() || !tenants.some((t) => initialOnly(t.name))) return tenants;
  const src = await load();
  let changed = false;
  const out = tenants.map((t) => {
    const full = fullName(t, src);
    if (!full) return t;
    changed = true;
    return { ...t, name: full };
  });
  return changed ? out : tenants;
}
