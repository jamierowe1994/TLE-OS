import "server-only";
import { hasDb, q } from "@/lib/db";
import { fetchKeys } from "@/lib/rex-keys";
import { rexConfigured } from "@/lib/rex";
import { getOsProperty, isOsPropertyId } from "@/lib/os-properties";

/**
 * A home's key numbers: REX's key register, read live, plus any the OS
 * recorded itself (os_home_keys). Moved out of /api/property/keys on 23 Oct
 * 2026 so the viewing booker's access step and the contractor emails read
 * the same list the home's page shows. Who may see them is the caller's to
 * decide - /api/property/keys still guards its own reads.
 */
export type Key = { id: string; label: string; description: string | null; location: string | null; heldBy: string | null; since: string | null; reason: string | null; source: "rex" | "os"; by?: string; at?: string };

/** REX's id for the home: the OS's own homes carry it on their record. */
export async function rexIdOf(propertyId: string): Promise<string | null> {
  if (/^\d+$/.test(propertyId)) return propertyId;
  if (!isOsPropertyId(propertyId)) return null;
  return (await getOsProperty(propertyId).catch(() => null))?.rexPropertyId ?? null;
}

export async function keysFor(propertyId: string): Promise<{ keys: Key[]; rexFailed: boolean }> {
  const rexId = await rexIdOf(propertyId);
  let rexFailed = false;
  const fromRex: Key[] = [];
  if (rexId && rexConfigured()) {
    try {
      for (const k of (await fetchKeys([rexId]))[rexId] ?? []) {
        fromRex.push({ id: `rex-${k.id}`, label: k.label, description: k.description, location: k.location, heldBy: k.heldBy, since: k.since, reason: k.reason, source: "rex" });
      }
    } catch {
      rexFailed = true;
    }
  }
  const ours = hasDb()
    ? await q<{ id: string; label: string; location: string; by_name: string; created_at: Date }>(
        `SELECT id, label, location, by_name, created_at FROM os_home_keys WHERE home_key = ANY($1) AND removed_at IS NULL ORDER BY created_at`,
        [[propertyId, ...(rexId && rexId !== propertyId ? [rexId] : [])]]
      )
    : [];
  return {
    keys: [
      ...fromRex,
      ...ours.map((r) => ({ id: r.id, label: r.label, description: null, location: r.location || null, heldBy: null, since: null, reason: null, source: "os" as const, by: r.by_name, at: new Date(r.created_at).toISOString() })),
    ],
    rexFailed,
  };
}


/** "FM23, DJ D17" - the tag numbers, for a line in an email. Empty when none or unreadable. */
export async function keyNumbersFor(propertyId: string | null | undefined): Promise<string> {
  if (!propertyId) return "";
  const { keys } = await keysFor(propertyId).catch(() => ({ keys: [] as Key[] }));
  return [...new Set(keys.map((k) => k.label.trim()).filter(Boolean))].join(", ");
}
