import { houseKeyOf, isRoomAddress, houseNameFrom, parseAddress } from "@/lib/address-parse";
import type { CompProperty } from "@/lib/compliance";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";

/** Anything the grouping can read: a Portfolio listing, a compliance record. */
export interface Addressed {
  name: string;
  locality: string;
}
export interface HouseReaders<T extends Addressed> {
  id: (t: T) => string;
  tenants: (t: T) => Party[];
  /** When the let began, ISO. Orders re-lets; the latest stands for a room. */
  since: (t: T) => string | null;
}
export const MANAGED_READERS: HouseReaders<ManagedProperty> = {
  id: (p) => String(p.listingId),
  tenants: (p) => p.tenants,
  since: (p) => p.letSince,
};
export const COMPLIANCE_READERS: HouseReaders<CompProperty> = {
  id: (p) => p.id,
  tenants: (p) => (p.tenant ? [{ contactId: p.tenant, name: p.tenant, email: null, phone: null }] : []),
  since: () => null,
};

/**
 * A shared house and its rooms, read from the managed book by address alone
 * (James, 6 Sep 2026: "flip between the different rooms within that house").
 *
 * REX lets each room as its own listing - "Room 2, 2 Norwich Street" - and
 * sometimes holds the house as a listing too. Portfolio shows the house once,
 * with the rooms as tabs inside it. No stored link: the grouping is the
 * postcode + building number + street the rooms share, so a room added to
 * REX tomorrow joins its house on its own.
 */

export interface House<T extends Addressed = ManagedProperty> {
  key: string;
  /** "rooms": REX names the rooms. "lets": REX holds the same address as
      several leased listings, one per let, and names no rooms. */
  kind: "rooms" | "lets";
  /** "2 Norwich Street" - the house's own line. */
  name: string;
  locality: string;
  /** REX's record for the house itself, when it holds one. */
  house: T | null;
  /** The rooms, in room order. */
  rooms: T[];
  /** The house record first, then the rooms: one listing per room. */
  members: T[];
  /** Every listing at the house, earlier lets of the same room included. */
  all: T[];
}

const addrOf = (p: Addressed) => `${p.name}, ${p.locality}`;

/** "Room 2, 2 Norwich Street" → "Room 2"; a house record → "The house". */
export function roomLabel(p: Addressed): string {
  const m = p.name.match(/^\s*(?:(?:apartment|flat)\s+)?((?:room|studio|bed(?:room)?)\s*[a-z0-9]+)/i) ?? p.name.match(/^\s*((?:flat|apartment|unit)\s*[a-z0-9]+)/i);
  return m ? m[1].replace(/\s+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : p.name;
}

const roomOrder = (p: Addressed) => {
  const u = parseAddress(addrOf(p)).unit;
  const n = Number.parseInt(String(u ?? ""), 10);
  return Number.isFinite(n) ? n : 999;
};

/** One record per label: the let one, else the latest. */
function dedupe<T extends Addressed>(list: T[], r: HouseReaders<T>, labelOf: (p: T) => string): T[] {
  const current = (a: T, b: T) =>
    (r.tenants(b).length > 0 ? 1 : 0) - (r.tenants(a).length > 0 ? 1 : 0) || String(r.since(b) ?? "").localeCompare(String(r.since(a) ?? ""));
  const by = new Map<string, T>();
  for (const p of [...list].sort(current)) {
    const k = labelOf(p).toLowerCase();
    if (!by.has(k)) by.set(k, p);
  }
  return [...by.values()];
}

/** Every house in the book with at least one room, keyed by house key. */
export function housesIn<T extends Addressed>(properties: T[], r: HouseReaders<T>): Map<string, House<T>> {
  const byKey = new Map<string, T[]>();
  for (const p of properties) {
    const key = houseKeyOf(addrOf(p));
    if (!key) continue;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(p);
  }
  const out = new Map<string, House<T>>();
  for (const [key, members] of byKey) {
    /* REX keeps a leased listing per let, so a room re-let three times is
       three records: one tab per room, the current let (a tenant, else the
       latest) standing for it. */
    const rooms = dedupe(members.filter((p) => isRoomAddress(addrOf(p))), r, roomLabel)
      .sort((a, b) => roomOrder(a) - roomOrder(b) || a.name.localeCompare(b.name, "en-GB"));
    if (!rooms.length) continue;
    const rest = members.filter((p) => !isRoomAddress(addrOf(p)));
    /* A record for the building itself (no flat number) is the house; flats
       at the same number make it a block, not a shared house. */
    if (rest.some((p) => parseAddress(addrOf(p)).unit != null)) continue;
    const house = rest.length ? dedupe(rest, r, () => "house")[0] : null;
    /* One room let twice with no house record is still one home: show it once. */
    if (!house && rooms.length < 2 && members.length < 2) continue;
    const name = house ? house.name : houseNameFrom(rooms[0].name);
    out.set(key, { key, kind: "rooms", name, locality: (house ?? rooms[0]).locality, house, rooms, members: house ? [house, ...rooms] : rooms, all: members });
  }
  /* 166 Gloucester Road North: fifteen leased listings with the same name,
     one property, a room's rent on each and a different tenant on each. REX
     holds a shared house as one let per room and names no rooms. Show the
     address once, with the lets as its tabs, newest first. A plain home let
     twice collapses the same way: one row, its lets inside. */
  const grouped = new Set([...out.values()].flatMap((h) => h.all.map((m) => r.id(m))));
  const byAddr = new Map<string, T[]>();
  for (const p of properties) {
    if (grouped.has(r.id(p)) || isRoomAddress(addrOf(p))) continue;
    const k = addrOf(p).toLowerCase().replace(/\s+/g, " ").trim();
    (byAddr.get(k) ?? byAddr.set(k, []).get(k)!).push(p);
  }
  for (const [k, lets] of byAddr) {
    if (lets.length < 2) continue;
    const sorted = [...lets].sort((a, b) => String(r.since(b) ?? "").localeCompare(String(r.since(a) ?? "")) || r.id(b).localeCompare(r.id(a)));
    out.set(`lets|${k}`, { key: `lets|${k}`, kind: "lets", name: sorted[0].name, locality: sorted[0].locality, house: null, rooms: sorted, members: sorted, all: sorted });
  }
  return out;
}

const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "date not set");

/** The tab's name: the room, or for a let the tenant the let is really for -
    the one on the fewest of the house's lets. Two names stay on every let of
    166 Gloucester Road North; the third is the room's. */
export function tabLabel<T extends Addressed>(house: House<T>, p: T, r: HouseReaders<T>): string {
  if (house.kind === "rooms") return roomLabel(p);
  const own = ownTenants(house, p, r);
  if (!own.length) return `Let ${shortDate(r.since(p))}`;
  const label = own.map((t) => t.name).join(", ");
  /* The same tenant on two lets (a renewal): the date tells them apart. */
  const twice = house.rooms.some((o) => o !== p && ownTenants(house, o, r).map((t) => t.name).join(", ") === label);
  return twice ? `${label} · ${shortDate(r.since(p))}` : label;
}

/** The tenants a let is really for: those on the fewest of the house's lets. */
export function ownTenants<T extends Addressed>(house: House<T>, p: T, r: HouseReaders<T>): Party[] {
  const mine = r.tenants(p);
  if (house.kind === "rooms" || !mine.length) return mine;
  const count = (id: string) => house.rooms.filter((o) => r.tenants(o).some((t) => t.contactId === id)).length;
  const least = Math.min(...mine.map((t) => count(t.contactId)));
  return mine.filter((t) => count(t.contactId) === least);
}

/** A let's tenants with its own first, then the names shared across the house. */
export function tenantsInOrder<T extends Addressed>(house: House<T> | null, p: T, r: HouseReaders<T>): Party[] {
  const mine = r.tenants(p);
  if (!house || house.kind === "rooms") return mine;
  const own = new Set(ownTenants(house, p, r).map((t) => t.contactId));
  return [...mine].sort((a, b) => Number(own.has(b.contactId)) - Number(own.has(a.contactId)));
}

/** listingId → the house it belongs to, every let of every room included. */
export function houseByListing<T extends Addressed>(houses: Map<string, House<T>>, r: HouseReaders<T>): Map<string, House<T>> {
  const m = new Map<string, House<T>>();
  for (const h of houses.values()) for (const p of h.all) m.set(r.id(p), h);
  return m;
}

/** What the room picker shows for one room or let: the tenant, and where. */
export function pickerOption<T extends Addressed>(house: House<T>, p: T, r: HouseReaders<T>): { name: string; where: string } {
  const tenants = house.kind === "rooms" ? r.tenants(p) : ownTenants(house, p, r);
  const name = tenants.length ? `${tenants[0].name}${tenants.length > 1 ? ` +${tenants.length - 1}` : ""}` : "Empty";
  const where = house.kind === "rooms" ? roomLabel(p) : `let ${shortDate(r.since(p))}`;
  return { name, where };
}
