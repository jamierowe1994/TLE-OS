import { houseKeyOf, isRoomAddress, houseNameFrom, parseAddress } from "@/lib/address-parse";
import type { ManagedProperty } from "@/lib/portfolio-types";

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
  /** "2 Norwich Street" - the house's own line. */
  name: string;
  locality: string;
  /** REX's record for the house itself, when it holds one. */
  house: ManagedProperty | null;
  /** The rooms, in room order. */
  rooms: ManagedProperty[];
  /** The house record first, then the rooms: every listing in the group. */
  members: ManagedProperty[];
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
    const rooms = members.filter((p) => isRoomAddress(addrOf(p))).sort((a, b) => roomOrder(a) - roomOrder(b) || a.name.localeCompare(b.name, "en-GB"));
    if (!rooms.length) continue;
    const rest = members.filter((p) => !isRoomAddress(addrOf(p)));
    /* One non-room record at the same building is the house itself; more
       than one (flats in a block that also has rooms) is not a house. */
    const house = rest.length === 1 ? rest[0] : null;
    if (rest.length > 1 || (!house && rooms.length < 2)) continue;
    const name = house ? house.name : houseNameFrom(rooms[0].name);
    out.set(key, { key, name, locality: (house ?? rooms[0]).locality, house, rooms, members: house ? [house, ...rooms] : rooms });
  }
  return out;
}

/** listingId → the house it belongs to. */
export function houseByListing(houses: Map<string, House>): Map<string, House> {
  const m = new Map<string, House>();
  for (const h of houses.values()) for (const p of h.members) m.set(String(p.listingId), h);
  return m;
}
