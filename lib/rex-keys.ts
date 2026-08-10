import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";

/**
 * Who can actually get into the property.
 *
 * REX keeps a real key register — 5,639 key sets, each with a label, a
 * shelf it lives on, and a history of who took it out. That's far better
 * than the note field we were going to invent, so Access is read from it.
 *
 * What REX does NOT give us, and is therefore not shown as fact:
 *   • the landlord's name — `legal_vendor_name` is populated on 0% of the
 *     rental book, so the drawer says it isn't recorded rather than
 *     guessing from the agent or the office
 *   • `inspection_notes` / `inspection_alarm_code` — also 0%, so no alarm
 *     codes or access notes exist to show
 */

export interface KeySet {
  id: string;
  label: string;
  /** Where it lives when nobody has it — "Office", a safe, a keybox. */
  location: string | null;
  /** Currently signed out to whom, if anyone. */
  heldBy: string | null;
  /** Why they took it, and when — the register records both. */
  reason: string | null;
  since: string | null;
}

interface RexKey extends Record<string, unknown> {
  id?: string | number;
  label?: string | null;
  location?: { name?: string } | null;
  property?: { id?: string | number } | number | null;
  latest_history?: {
    reason?: string | null;
    system_checked_out_time?: number | null;
    system_checked_in_time?: number | null;
    checked_out_to_contact?: { name?: string } | null;
    checked_out_to_user?: { name?: string } | null;
    system_checked_out_user?: { name?: string } | null;
  } | null;
}

function heldByOf(h: RexKey["latest_history"]): { who: string | null; since: string | null; reason: string | null } {
  // Checked in again means it's back on the shelf, whatever the history says.
  if (!h || h.system_checked_in_time) return { who: null, since: null, reason: null };
  const who =
    h.checked_out_to_contact?.name ??
    h.checked_out_to_user?.name ??
    h.system_checked_out_user?.name ??
    null;
  return {
    who,
    since: h.system_checked_out_time ? new Date(h.system_checked_out_time * 1000).toISOString() : null,
    reason: h.reason ?? null,
  };
}

/** Key sets for a set of properties, keyed by property id. */
export async function fetchKeys(propertyIds: string[]): Promise<Record<string, KeySet[]>> {
  const out: Record<string, KeySet[]> = {};
  if (!rexConfigured() || !propertyIds.length) return out;

  // Same chunking manners as the compliance walk — this service dislikes
  // long id lists.
  for (let i = 0; i < propertyIds.length; i += 20) {
    const chunk = propertyIds.slice(i, i + 20);
    const res = await rexCall("KeyRegister", "search", {
      criteria: [{ name: "property_id", type: "in", value: chunk }],
      limit: 100,
    });
    if (!res.ok) continue;
    for (const k of rexRows(res.result) as RexKey[]) {
      const pid = String(
        typeof k.property === "object" && k.property ? (k.property as { id?: string }).id : k.property
      );
      if (!pid || pid === "undefined") continue;
      const held = heldByOf(k.latest_history);
      (out[pid] ??= []).push({
        id: String(k.id ?? ""),
        label: k.label ?? "Key set",
        location: k.location?.name ?? null,
        heldBy: held.who,
        reason: held.reason,
        since: held.since,
      });
    }
  }
  return out;
}
