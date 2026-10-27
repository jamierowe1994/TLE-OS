import "server-only";
import { rexCall, rexWritesLocked, isExpiredToken } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { invalidateListingBook } from "@/lib/listings-cache";
import { forgetListing } from "@/lib/listing-details";
import type { AddressParts } from "@/lib/os-property-address";

/**
 * A HOME'S ADDRESS, CHANGED IN REX AS WELL (James, 27 Oct 2026: Lianna changed
 * 12 Chesters View to 12 South Chesters Lane three times in the OS and the
 * listing kept its old name, because the name every screen and portal shows
 * is read off REX's property record. "It should obviously change the address
 * and then change the title address as well.")
 *
 * Change address now writes the REX property's own address fields - unit,
 * street number, street name, town, postcode - and only the ones that
 * changed. REX rebuilds the listing's name from them, and a live advert takes
 * it to the portals. The OS's own copy (lib/os-property-address) is saved
 * first, so a refused write never loses what was typed.
 */

type Fields = { adr_unit_number: string | null; adr_street_number: string | null; adr_street_name: string; adr_suburb_or_town: string; adr_postcode: string };

/**
 * "3f1 44 South Bridge", "Flat 2, 5 Canter Close", "12a High Street" into
 * REX's fields. REX keeps the flat (unit) apart from the number and street,
 * and makes the name "unit number street". A line with no house number
 * ("Rose Cottage, Main Street") goes whole into the street name.
 */
export function rexAddressFields(parts: AddressParts): Fields {
  const line = parts.name.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();
  const m = line.match(/^(?:((?:flat|apartment|apt|unit|room)\.?\s*\S+|\S*\d\S*[a-z]\S*|\S+\/\S+)\s+)?(\d+[a-z]?(?:-\d+[a-z]?)?)\s+(.+)$/i);
  return {
    adr_unit_number: m?.[1]?.trim() || null,
    adr_street_number: m ? m[2] : null,
    adr_street_name: m ? m[3].trim() : parts.name.trim(),
    adr_suburb_or_town: parts.town,
    adr_postcode: parts.postcode,
  };
}

const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export type RexAddressOutcome =
  /** REX holds the new address; `name` is what it now calls the home. */
  | { ok: true; name: string | null; unchanged?: boolean }
  /** Kept in the OS only; `why` is said on screen. */
  | { ok: false; why: string };

/**
 * Write it. As the person pressing where they have a REX sign-in, so REX's
 * history names them; otherwise as the office. Read back, never trusted.
 */
export async function pushAddressToRex(rexPropertyId: string, parts: AddressParts, by: { id: string } | null): Promise<RexAddressOutcome> {
  if (!/^\d+$/.test(rexPropertyId)) return { ok: false, why: "This home isn't on the listings system, so its address lives in the OS alone." };
  if (rexWritesLocked("Properties", "update")) return { ok: false, why: "Saved in the OS. Changing it on the listing isn't switched on yet." };
  const read = await rexCall("Properties", "read", { id: Number(rexPropertyId) });
  const cur = (read.ok ? (read.result as Record<string, unknown> | null) : null) ?? null;
  if (!cur) return { ok: false, why: "Saved in the OS. The listing couldn't be read just now, so it still shows the old address. Try again in a minute." };
  const want = rexAddressFields(parts);
  const data: Record<string, unknown> = { id: Number(rexPropertyId) };
  for (const [k, v] of Object.entries(want)) if (!same(cur[k], v)) data[k] = v;
  if (Object.keys(data).length === 1) return { ok: true, name: typeof cur.system_search_key === "string" ? cur.system_search_key : null, unchanged: true };

  const token = by ? await rexTokenFor(by.id).catch(() => null) : null;
  let w = await rexCall("Properties", "update", { data }, token);
  /* A lapsed REX sign-in is theirs to fix another day, not a reason the
     address stays wrong: the office account makes the same write. */
  if (!w.ok && token && isExpiredToken(w)) w = await rexCall("Properties", "update", { data });
  if (!w.ok && w.queuedId) return { ok: false, why: "Saved in the OS. The listing system is down, so the new address goes to the listing as soon as it's back." };
  if (!w.ok) return { ok: false, why: "Saved in the OS, but the listing refused the new address, so it still shows the old one. Ask James to look." };

  const back = await rexCall("Properties", "read", { id: Number(rexPropertyId) });
  const now = (back.ok ? (back.result as Record<string, unknown> | null) : null) ?? null;
  await invalidateListingBook().catch(() => {});
  return { ok: true, name: now && typeof now.system_search_key === "string" ? now.system_search_key : null };
}

/** After a change: the listing's own two-minute read forgets it too. */
export function forgetListingAddress(listingId: string | null | undefined): void {
  if (listingId && /^\d+$/.test(listingId)) forgetListing(listingId);
}
