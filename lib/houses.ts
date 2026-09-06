import { houseKeyOf, isRoomAddress, houseNameFrom, parseAddress } from "@/lib/address-parse";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";

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

export interface House {
  key: string;
  /** "rooms": REX names the rooms. "lets": REX holds the same address as
      several leased listings, one per let, and names no rooms. */
  kind: "rooms" | "lets";
  /** "2 Norwich Street" - the house's own line. */
  name: string;
  locality: string;
  /** REX's record for the house itself, when it holds one. */
  house: ManagedProperty | null;
  /** The rooms, in room order. */
  rooms: ManagedProperty[];
  /** The house record first, then the rooms: one listing per room. */
  members: ManagedProperty[];
  /** Every listing at the house, earlier lets of the same room included. */
  all: ManagedProperty[];
}

const addrOf = (p: ManagedProperty) => `${p.name}, ${p.locality}`;

/** "Room 2, 2 Norwich Street" → "Room 2"; a house record → "The house". */
export function roomLabel(p: ManagedProperty): string {
  const m = p.name.match(/^\s*((?:room|studio|bed(?:room)?|flat|apartment|unit)\s*[a-z0-9]+)/i);
  return m ? m[1].replace(/\s+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : p.name;
}

const roomOrder = (p: ManagedProperty) => {
  const u = parseAddress(addrOf(p)).unit;
  const n = Number.parseInt(String(u ?? ""), 10);
  return Number.isFinite(n) ? n : 999;
};

const current = (a: ManagedProperty, b: ManagedProperty) =>
  (b.tenants.length > 0 ? 1 : 0) - (a.tenants.length > 0 ? 1 : 0) || String(b.letSince ?? "").localeCompare(String(a.letSince ?? ""));

/** One record per label: the let one, else the latest. */
function dedupe(list: ManagedProperty[], labelOf: (p: ManagedProperty) => string): ManagedProperty[] {
  const by = new Map<string, ManagedProperty>();
  for (const p of [...list].sort(current)) {
    const k = labelOf(p).toLowerCase();
    if (!by.has(k)) by.set(k, p);
  }
  return [...by.values()];
}

/** Every house in the book with at least one room, keyed by house key. */
export function housesIn(properties: ManagedProperty[]): Map<string, House> {
  const byKey = new Map<string, ManagedProperty[]>();
  for (const p of properties) {
    const key = houseKeyOf(addrOf(p));
    if (!key) continue;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(p);
  }
  const out = new Map<string, House>();
  for (const [key, members] of byKey) {
    /* REX keeps a leased listing per let, so a room re-let three times is
       three records: one tab per room, the current let (a tenant, else the
       latest) standing for it. */
    const rooms = dedupe(members.filter((p) => isRoomAddress(addrOf(p))), roomLabel)
      .sort((a, b) => roomOrder(a) - roomOrder(b) || a.name.localeCompare(b.name, "en-GB"));
    if (!rooms.length) continue;
    const rest = members.filter((p) => !isRoomAddress(addrOf(p)));
    /* A record for the building itself (no flat number) is the house; flats
       at the same number make it a block, not a shared house. */
    if (rest.some((p) => parseAddress(addrOf(p)).unit != null)) continue;
    const house = rest.length ? dedupe(rest, () => "house")[0] : null;
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
  const grouped = new Set([...out.values()].flatMap((h) => h.all.map((m) => String(m.listingId))));
  const byAddr = new Map<string, ManagedProperty[]>();
  for (const p of properties) {
    if (grouped.has(String(p.listingId)) || isRoomAddress(addrOf(p))) continue;
    const k = addrOf(p).toLowerCase().replace(/\s+/g, " ").trim();
    (byAddr.get(k) ?? byAddr.set(k, []).get(k)!).push(p);
  }
  for (const [k, lets] of byAddr) {
    if (lets.length < 2) continue;
    const sorted = [...lets].sort((a, b) => String(b.letSince ?? "").localeCompare(String(a.letSince ?? "")) || String(b.listingId).localeCompare(String(a.listingId)));
    out.set(`lets|${k}`, { key: `lets|${k}`, kind: "lets", name: sorted[0].name, locality: sorted[0].locality, house: null, rooms: sorted, members: sorted, all: sorted });
  }
  return out;
}

const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "date not set");

/** The tab's name: the room, or for a let the tenant the let is really for -
    the one on the fewest of the house's lets. Two names stay on every let of
    166 Gloucester Road North; the third is the room's. */
export function tabLabel(house: House, p: ManagedProperty): string {
  if (house.kind === "rooms") return roomLabel(p);
  const own = ownTenants(house, p);
  if (!own.length) return `Let ${shortDate(p.letSince)}`;
  const label = own.map((t) => t.name).join(", ");
  /* The same tenant on two lets (a renewal): the date tells them apart. */
  const twice = house.rooms.some((r) => r !== p && ownTenants(house, r).map((t) => t.name).join(", ") === label);
  return twice ? `${label} · ${shortDate(p.letSince)}` : label;
}

/** The tenants a let is really for: those on the fewest of the house's lets. */
export function ownTenants(house: House, p: ManagedProperty): Party[] {
  if (house.kind === "rooms" || !p.tenants.length) return p.tenants;
  const count = (id: string) => house.rooms.filter((r) => r.tenants.some((t) => t.contactId === id)).length;
  const least = Math.min(...p.tenants.map((t) => count(t.contactId)));
  return p.tenants.filter((t) => count(t.contactId) === least);
}

/** A let's tenants with its own first, then the names shared across the house. */
export function tenantsInOrder(house: House | null, p: ManagedProperty): Party[] {
  if (!house || house.kind === "rooms") return p.tenants;
  const own = new Set(ownTenants(house, p).map((t) => t.contactId));
  return [...p.tenants].sort((a, b) => Number(own.has(b.contactId)) - Number(own.has(a.contactId)));
}

/** listingId → the house it belongs to, every let of every room included. */
export function houseByListing(houses: Map<string, House>): Map<string, House> {
  const m = new Map<string, House>();
  for (const h of houses.values()) for (const p of h.all) m.set(String(p.listingId), h);
  return m;
}
