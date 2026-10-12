import "server-only";
import { rexCall, rexWritesLocked } from "@/lib/rex";
import { switchOn } from "@/lib/switches";

/**
 * THE LANDLORD ON THE LISTING (12 Oct 2026).
 *
 * Push to Propoly reads the landlord off the REX listing's own contacts
 * (lib/handover, related.contact_reln_listing), and nothing in the OS ever
 * put one there: Add new listing made the listing with no owner, and so did
 * the appraisal route. Every OS-made listing stopped at "No owner is attached
 * to the listing" until somebody opened REX.
 *
 * The shape is the one REX itself shows on 4 Williams Court (listing 843312,
 * read 12 Oct): `{ reln_type: { id: "owner", text: "Listing Owner" }, contact
 * }`. It is written the way lib/handover already writes tenants onto a
 * listing, live since 9 Oct - a nested Listings/update with `contact_id` and
 * `reln_type_id` - which ADDS to the contacts there and never removes one
 * (843312 kept its owner when the tenant went on).
 *
 * Who the landlord is, in order: the contact the caller names (the landlord
 * just picked in New listing), else the owners already on the property, which
 * is where an appraisal's signed terms put them (lib/rex-instruct).
 *
 * Behind the rex_listing_owner switch and Listings/update on REX_ALLOW_WRITES.
 * Never throws: the listing is made either way, and the answer says what
 * happened so the screen can say "add the landlord in REX" when it did not.
 */

export type OwnerOutcome =
  | { state: "added"; contactIds: string[] }
  | { state: "already"; contactIds: string[] }
  | { state: "off" | "locked" | "none" | "failed"; detail: string };

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v).trim());

function ownersIn(relns: unknown): string[] {
  return ((Array.isArray(relns) ? relns : []) as Row[])
    .filter((r) => {
      const t = (r.reln_type ?? null) as Row | null;
      return [str(t?.id), str((t?.parent_type as Row | null)?.id)].some((x) => x.toLowerCase() === "owner");
    })
    .map((r) => str((r.contact as Row | null)?.id ?? r.contact_id))
    .filter(Boolean);
}

/** The owners REX holds against a property. Read-only; empty when it cannot say. */
export async function propertyOwners(propertyId: string): Promise<string[]> {
  const res = await rexCall("Properties", "read", { id: propertyId, extra_fields: ["contacts"] }).catch(() => null);
  if (!res?.ok) return [];
  const p = (res.result ?? {}) as Row;
  return ownersIn(((p.related ?? {}) as Row).contact_reln_property);
}

async function listingOwners(listingId: string): Promise<string[] | null> {
  const res = await rexCall("Listings", "read", { id: listingId, extra_fields: ["contacts"] }).catch(() => null);
  if (!res?.ok) return null;
  return ownersIn(((((res.result ?? {}) as Row).related ?? {}) as Row).contact_reln_listing);
}

export async function putOwnerOnListing(listingId: string, opts: { contactId?: string | null; propertyId?: string | null }): Promise<OwnerOutcome> {
  if (!(await switchOn("rex_listing_owner").catch(() => false))) {
    return { state: "off", detail: "Putting the landlord on new listings is switched off, so add them to the listing in REX." };
  }
  if (rexWritesLocked("Listings", "update")) {
    return { state: "locked", detail: "REX_ALLOW_WRITES does not include Listings/update." };
  }
  let wanted = opts.contactId ? [str(opts.contactId)] : [];
  if (!wanted.length && opts.propertyId) wanted = await propertyOwners(String(opts.propertyId));
  wanted = [...new Set(wanted.filter(Boolean))];
  if (!wanted.length) return { state: "none", detail: "No landlord is known for this home yet, so nobody was added to the listing." };

  const there = await listingOwners(listingId);
  const missing = wanted.filter((id) => !(there ?? []).includes(id));
  if (!missing.length) return { state: "already", contactIds: wanted };

  const res = await rexCall("Listings", "update", {
    data: { id: String(listingId), related: { contact_reln_listing: missing.map((contact_id) => ({ contact_id, reln_type_id: "owner" })) } },
  }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "REX did not answer." }));
  if (!res.ok) return { state: "failed", detail: `REX did not take the landlord: ${"error" in res && res.error ? res.error : "refused"}` };
  return { state: "added", contactIds: missing };
}
