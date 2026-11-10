import "server-only";
import { listingRead } from "@/lib/listing-details";
import { hasDb, q } from "@/lib/db";
import type { HomeLandlord } from "@/lib/landlords-for-home";

/**
 * The landlord of a property — the REAL one.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Because the OS spent a while believing REX had no landlords, and inventing
 * them instead. `lib/journey.ts` held five made-up people and picked one by
 * hashing the property id; the viewing booker used that to address a landlord
 * confirmation EMAIL, and the listing drawer put it into the PLC handover.
 *
 * The belief came from a true fact about the wrong field. `legal_vendor_name`
 * IS empty on the whole rental book — that is measured and recorded in
 * lib/rex-keys.ts. But the landlord was never stored there. It lives on the
 * listing's CONTACT RELATIONSHIP: `related.contact_reln_listing`, the entry
 * whose `reln_type.id` is "owner". lib/deal-handoff.ts has read it correctly
 * all along; nothing else knew.
 *
 * MEASURED 1 Sep 2026, 25 current rentals read at random:
 *   • 22 of 25 (88%) have an owner contact
 *   • 22 of 22 of those have an email address
 *   • 21 of 22 have a phone number
 *
 * So the honest default is a real name, and "not recorded" is the exception
 * — roughly one property in eight, which callers must still handle.
 *
 * ── Read-only, and one listing at a time ──────────────────────────────────
 *
 * `Listings/read` is on the read allowlist in lib/rex.ts. There is no bulk
 * form of this: the owner relationship only comes back on a full read, not in
 * a search projection, so a book-wide landlord column would be one HTTP call
 * per property. Fetch it when a screen actually needs it.
 *
 * ── One reader since 10 Nov 2026 ──────────────────────────────────────────
 *
 * This file used to do its own read: the FIRST owner on the listing, never
 * the property's own owners, and "no landlord" held for twelve hours. So a
 * second owner was missing from the listing and its terms, and the Propoly
 * push (which read every place) found a landlord the listing and the let said
 * was missing. `landlordForListing` now asks lib/landlords-for-home, the
 * reader the push uses, and names the first of everybody it finds; the whole
 * list comes back beside it.
 */

export type Landlord = {
  /** REX contact id — the join to terms, e-sign and the handover. */
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  /** "record" = REX CRM holds no owner, so this is the OS property record's
   *  landlord (REX PM's name for them), with the email and mobile typed there.
   *  "os" = an agent changed the landlord in the OS (lib/landlord-change):
   *  the OS writes to them, REX still holds the old owner.
   *  "joint" = nobody else is held anywhere, so this is the first joint
   *  landlord kept on the home in the OS (lib/property-people). */
  from?: "rex" | "record" | "os" | "joint";
  /** For "os": a company, an estate or a private owner, and the change behind it. */
  kind?: "company" | "executor" | "private";
  changeId?: string;
};

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s : null;
};

/* What REX said about a listing's owners is held by lib/landlords-for-home,
   under this key, with the listing's REX property beside it. v4 (10 Nov 2026):
   every owner, not the first. */
export const heldKey = (listingId: string) => `landlord:v4:${listingId}`;
const cacheKey = heldKey;

/** The REX property kept beside a held landlord read, of any age: a listing never moves property. */
async function cached(listingId: string): Promise<{ propertyId?: string | null } | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { propertyId?: string | null } }>("SELECT payload FROM os_cache WHERE key = $1", [cacheKey(listingId)]);
    return rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

/**
 * Forget the held landlord for a listing (20 Oct 2026): a landlord's details
 * changed on a let, through REX, must read back changed at once, or the
 * let's card is redrawn with the old number from up to twelve hours ago.
 */
export async function forgetLandlord(listingId: string): Promise<void> {
  if (!hasDb()) return;
  await q("DELETE FROM os_cache WHERE key = $1", [cacheKey(listingId)]).catch(() => undefined);
}

/* Which listings are on which home, from the held reads alone (Lianna Denholm,
   4 Nov 2026, lib/home-aliases). Every landlord read keeps the listing's REX
   property beside it, so os_cache already says which listings stand on a
   property without asking REX. A listing never moves property, so a held read
   of any age - and under any version of the key - still says it. */
const HELD = /^landlord:v\d+:(.+)$/;

/** The REX property behind each of these listings, where a landlord read is held. No call to REX. */
export async function heldPropertyIds(listingIds: string[]): Promise<string[]> {
  const ids = [...new Set(listingIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!hasDb() || !ids.length) return [];
  const rows = await q<{ pid: string | null }>(
    `SELECT DISTINCT payload->>'propertyId' AS pid FROM os_cache
      WHERE key LIKE 'landlord:v%' AND split_part(key, ':', 3) = ANY($1) AND payload->>'propertyId' IS NOT NULL`,
    [ids]
  );
  return rows.map((r) => (r.pid ?? "").trim()).filter(Boolean);
}

/** The listings held as standing on these REX properties. No call to REX. */
export async function heldListingsOn(propertyIds: string[]): Promise<string[]> {
  const ids = [...new Set(propertyIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!hasDb() || !ids.length) return [];
  const rows = await q<{ key: string }>(`SELECT key FROM os_cache WHERE key LIKE 'landlord:v%' AND payload->>'propertyId' = ANY($1)`, [ids]);
  return [...new Set(rows.map((r) => HELD.exec(r.key)?.[1] ?? "").filter(Boolean))];
}

/**
 * The REX property behind a listing - the key every screen keeps a home's
 * extra landlords and points of contact under (lib/property-people, 20 Oct
 * 2026). From the held landlord read where there is one, else the listing.
 */
export async function propertyIdForListing(listingId: string): Promise<string | null> {
  const hit = await cached(listingId);
  if (hit?.propertyId) return hit.propertyId;
  const id = Number(listingId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const res = await listingRead(id, "Listings", "read", { id }).catch(() => null);
  if (!res?.ok) return null;
  const r = (res.result ?? {}) as Row;
  const prop = (r.property ?? null) as Row | null;
  return str(prop?.id) ?? str(r.property_id);
}

export type LandlordAnswer =
  /** REX answered. `landlord` null means nobody is held anywhere. `landlords`
   *  is everybody (lib/landlords-for-home), `landlord` the first of them. */
  | { ok: true; landlord: Landlord | null; landlords: HomeLandlord[] }
  /** REX did NOT answer. Distinct from "no landlord" on purpose — see below. */
  | { ok: false; problem: string };

/** One of the home's landlords in the shape the older screens read. */
export function asLandlordOf(l: HomeLandlord): Landlord {
  const base = { contactId: l.contactId, name: l.name, email: l.email, phone: l.phone };
  if (l.from === "changed") return { ...base, contactId: null, from: "os", ...(l.kind ? { kind: l.kind } : {}), ...(l.changeId ? { changeId: l.changeId } : {}) };
  if (l.from === "record") return { ...base, contactId: null, from: "record" };
  if (l.from === "joint") return { ...base, contactId: null, from: "joint" };
  return base;
}

/**
 * One listing's landlord: the first of everybody lib/landlords-for-home finds
 * (a landlord changed in the OS, else the listing's owners, the property's
 * owners, the home's record, then the joint landlords kept on the home).
 *
 * A failed call and an empty owner are DIFFERENT answers and are kept apart
 * all the way to the screen. Collapsing them would mean a REX outage renders
 * as "this property has no landlord", which reads like a fact about the
 * property rather than a fault on our side — and the agent would stop
 * expecting the landlord to be told.
 */
export async function landlordForListing(listingId: string): Promise<LandlordAnswer> {
  const id = Number(listingId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, problem: "That listing has no reference in the listings system, so its landlord can't be looked up." };
  }
  const { landlordsOfHome } = await import("@/lib/landlords-for-home");
  const all = await landlordsOfHome({ listingId });
  if (!all.ok) return all;
  return { ok: true, landlord: all.landlords[0] ? asLandlordOf(all.landlords[0]) : null, landlords: all.landlords };
}
