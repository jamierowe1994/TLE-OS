import { currentLets, MANAGED_SERVICES } from "@/lib/current-lets";
import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { activeOsProperties, pmManagedHomes, type OsProperty, type PmHome } from "@/lib/os-properties";
import { getPortfolioBook, rentKey } from "@/lib/business/payprop-portfolio";
import { isFresh, matchHome, payPropRent, rentBook } from "@/lib/rent-status";
import { attach, payPropPeople, personKey } from "@/lib/business/payprop-tenant-contacts";
import { nameKey, tenantContacts } from "@/lib/tenant-contacts";
import { acceptedLetsByProperty, sittingTenantsByProperty } from "@/lib/rex-tenants";
import { addrOf, parseAddress, postcodeOf, sameDoor, sameHome, type Parsed } from "@/lib/address-parse";
import { q } from "@/lib/db";
import { introOnlyIds } from "@/lib/intro-only";
import { tidyAddressLine } from "@/lib/address-tidy";
import type {
  ManagedBook,
  ManagedCounts,
  ManagedLandlord,
  ManagedProperty,
  Party,
} from "@/lib/portfolio-types";

/**
 * The managed book out of REX — see lib/portfolio-types.ts for what it is and
 * why it is REX rather than PayProp.
 *
 * ── One call per page, and everything comes inline ────────────────────────
 *
 * The landlord and the tenant both live on the listing's contact
 * relationships (`related.contact_reln_listing`, reln_type "owner" and
 * "purchtenant"), and REX will return those inline on a search when asked via
 * extra_fields. So the whole book, with landlords, tenants and photographs,
 * is five searches of a hundred rows — about ten seconds cold, measured — and
 * not one Listings/read per property. lib/rex-landlord.ts does the per-listing
 * read for the drawer; this deliberately does not.
 *
 * ── A short page is the end; a failed page is a failure ──────────────────
 *
 * fetchListingBook breaks out quietly on a failed page and returns what it
 * has. This one throws. A portfolio that shows 300 of 449 properties with no
 * error anywhere is a portfolio somebody will make a decision on, and the
 * live-figures rule is that a source that fails shows an error, never a
 * smaller number.
 */

const PAGE = 100;
/* 1,200 rows. The book is 449 (2 Sep 2026); this is a runaway guard, not a
   ceiling anybody expects to reach. */
const MAX_PAGES = 12;

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s : null;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const https = (u: unknown): string | null => {
  if (typeof u !== "string" || !u) return null;
  return u.startsWith("//") ? `https:${u}` : u;
};
const isoDay = (epochSeconds: unknown): string | null => {
  const n = num(epochSeconds);
  return n && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
};
const labelOf = (v: unknown): string | null =>
  typeof v === "string" ? str(v) : str((v as { text?: unknown } | null)?.text);

function party(c: Row | null | undefined): Party | null {
  if (!c) return null;
  const id = str(c.id);
  const name = str(c.name);
  /* A relationship row with no named contact is a broken record, not a person
     called "". It counts as nobody. */
  if (!id || !name) return null;
  return { contactId: id, name, email: str(c.email_address), phone: str(c.phone_number) };
}

function partiesOf(r: Row, type: string): Party[] {
  const related = (r.related ?? {}) as Row;
  const relns = related.contact_reln_listing;
  if (!Array.isArray(relns)) return [];
  const out: Party[] = [];
  for (const x of relns as Row[]) {
    const t = str((x.reln_type as Row | null)?.id);
    if (t !== type) continue;
    const p = party(x.contact as Row | null);
    if (p && !out.some((o) => o.contactId === p.contactId)) out.push(p);
  }
  return out;
}

function photosOf(r: Row): { image: string | null; images: string[] } {
  const related = (r.related ?? {}) as Row;
  const rows = Array.isArray(related.listing_images) ? (related.listing_images as Row[]) : [];
  const ordered = [...rows].sort((a, b) => Number(a.priority ?? 999) - Number(b.priority ?? 999));
  const thumb = (img: Row, size: string) => {
    const thumbs = (img.thumbs ?? {}) as Record<string, { url?: string }>;
    return https(thumbs[size]?.url) ?? https(img.url);
  };
  const images = ordered.map((i) => thumb(i, "800x600")).filter((u): u is string => !!u);
  const image = ordered[0] ? thumb(ordered[0], "400x300") : null;
  return { image, images };
}

/**
 * PHOTOS FROM THE HOME'S OTHER LISTINGS (James, 23 Oct 2026). Lianna
 * Denholm's Portfolio showed photos on 4 of her 35 homes, though REX held
 * them for 7 more: a home's photos were only ever its let listing's, and a
 * home REX PM brings into the book has no let listing at all (6 Ruskin
 * Place's 10 photos sit on its current listing, 5 Douglas Gardens Mews' 16
 * on another). So a home with none takes the photos of the newest REX
 * listing for the same property that has any, whatever its state.
 *
 * Then the same door (James, 23 Oct 2026, Sean's and Rhiannon's books): a
 * home with no REX link, or whose own REX record has no photos, takes them
 * from the one other REX record at its door - the 19 Sep sync made new REX
 * records beside older ones that held the photos (8/95 Springthorpe Green,
 * 5 Reeves Close), and Sean's New Bells Court and St Triduanas Rest flats are
 * in REX under addresses lib/address-parse does not see as theirs. Never a
 * record another home in the book stands on. Read only.
 */
export async function fillPhotosFromOtherListings(properties: ManagedProperty[]): Promise<void> {
  const noPhotos = properties.filter((p) => !p.images.length && !p.image && !p.test);
  const held = new Set(properties.map((p) => p.propertyId).filter(Boolean) as string[]);
  const rexId = (p: ManagedProperty) => (p.propertyId && /^\d+$/.test(p.propertyId) ? p.propertyId : null);
  const best = new Map<string, { at: number; photos: { image: string | null; images: string[] } }>();
  const give = (p: ManagedProperty, id: string) => {
    const got = best.get(id);
    if (!got) return;
    p.image = got.photos.image;
    p.images = got.photos.images;
  };

  const own = noPhotos.filter((p) => rexId(p));
  await readListingPhotos([...new Set(own.map((p) => rexId(p)!))], best);
  for (const p of own) give(p, rexId(p)!);

  /* A home typed without its postcode borrows the one every other home on its
     street in the book has ("Newbells Court, Flat 5, 1, Edinburgh" beside
     Sean's other New Bells Court flats, all EH6 6RY). Two postcodes on the
     street, or none, and it is left alone. */
  const streetPostcodes = new Map<string, Set<string>>();
  for (const p of properties) {
    const line = p.address || p.name;
    const pc = postcodeOf(line);
    const key = pc ? streetKey(line, pc) : "";
    if (!key) continue;
    if (!streetPostcodes.has(key)) streetPostcodes.set(key, new Set());
    streetPostcodes.get(key)!.add(pc!);
  }
  const postcodeFor = (line: string): string | null => {
    const own = postcodeOf(line);
    if (own) return own;
    const seen = streetPostcodes.get(streetKey(line, null));
    return seen?.size === 1 ? [...seen][0] : null;
  };
  const door = new Map<ManagedProperty, string>();
  const still = noPhotos.filter((p) => !p.images.length && postcodeFor(p.address || p.name));
  await eachLimited(still, 3, async (p) => {
    const id = await rexDoorFor(p.address || p.name, rexId(p), postcodeFor(p.address || p.name)!);
    if (id && !held.has(id)) door.set(p, id);
  });
  await readListingPhotos([...new Set(door.values())], best);
  for (const [p, id] of door) give(p, id);
}

/** The newest listing with photos for each REX property, into `best`. */
async function readListingPhotos(ids: string[], best: Map<string, { at: number; photos: { image: string | null; images: string[] } }>): Promise<void> {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await rexCall("Listings", "search", {
        criteria: [{ name: "property_id", type: "in", value: chunk.map(Number) }],
        limit: PAGE,
        offset: page * PAGE,
        extra_options: { extra_fields: ["related.listing_images"] },
      });
      if (!res.ok) throw new Error(res.error ?? `REX refused the listing photos (HTTP ${res.status}).`);
      const batch = rexRows(res.result) as Row[];
      for (const r of batch) {
        const photos = photosOf(r);
        if (!photos.images.length) continue;
        const prop = (r.property ?? null) as Row | null;
        const pid = String(prop?.id ?? r.property_id ?? "");
        const at = Number(r.system_ctime ?? 0);
        const had = best.get(pid);
        if (pid && (!had || at > had.at)) best.set(pid, { at, photos });
      }
      if (batch.length < PAGE) break;
    }
  }
}

/**
 * The door's numbers, postcode left out, sorted: "17/7" and "Flat 7, 17" both
 * read 7,17. Letters and Scottish floor-flat stay on their number (23 Oct
 * 2026: 283 and 283a Lichfield Road, 39a and 39b Lerowe Road read as one door).
 */
const doorNumbers = (line: string, postcode: string) =>
  (line.toUpperCase().replace(postcode, " ").replace(postcode.replace(" ", ""), " ").match(/\d+(?:F\d+|[A-Z](?![A-Z]))?/g) ?? [])
    .map((n) => n.toLowerCase())
    .sort()
    .join(",");
/* A street's own name, for borrowing a postcode: "New Bell's Court" and
   "Newbells Court" are both "newbells". Street types and the big towns are
   left out, so "Court" alone never ties two streets together. */
const STREET_TYPES = /^(street|road|place|lane|avenue|gardens|close|drive|terrace|crescent|court|way|house|flat|rest|park|grove|square|row|mews|hill|green|view|walk|edinburgh|glasgow|london|city|the|and|room)$/;
const streetKey = (line: string, postcode: string | null) =>
  (postcode ? line.toUpperCase().replace(postcode, " ") : line)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STREET_TYPES.test(w))
    .join("");
const streetWords = (line: string) => line.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(flat|the|room|edinburgh|glasgow|london)$/.test(w));
/* "Flat 5, 3 Lang Rigg" is flat 5 at number 3. Sorted numbers can't tell it
   from REX's Flat 3 at number 5, so where both sides say which is which,
   they must agree (23 Oct 2026). */
const flatAt = (address: string) => {
  const m = address.match(/\bflat\s*(\d+[a-z]?)\s*,?\s*(\d+[a-z]?)\b/i);
  return m ? { flat: m[1].toLowerCase(), at: m[2].toLowerCase() } : null;
};

/**
 * The one other REX property at this door, for photos only: the same
 * postcode, the same numbers and a street word in common, and nothing else at
 * the postcode that also fits. Null on any doubt - a wrong home's photos are
 * worse than none.
 */
const doorCache = new Map<string, { id: string | null; at: number }>();
/* A day: REX properties at a door don't come and go, and the book is rebuilt often. */
const DOOR_TTL_MS = 24 * 3600 * 1000;
async function rexDoorFor(address: string, ownId: string | null, postcode: string): Promise<string | null> {
  const key = `${address}|${ownId ?? ""}|${postcode}`;
  const kept = doorCache.get(key);
  if (kept && Date.now() - kept.at < DOOR_TTL_MS) return kept.id;
  const id = await rexDoorLookup(address, ownId, postcode);
  doorCache.set(key, { id, at: Date.now() });
  return id;
}
async function rexDoorLookup(address: string, ownId: string | null, postcode: string): Promise<string | null> {
  const nums = doorNumbers(address, postcode);
  if (!nums) return null;
  const words = new Set(streetWords(address.toUpperCase().replace(postcode, " ")));
  const named = flatAt(address);
  const res = await rexCall("Properties", "search", { criteria: [{ name: "property.adr_postcode", value: postcode }], limit: 100 });
  if (!res.ok) return null;
  const hits = (rexRows(res.result) as Row[]).filter((r) => {
    if (String(r.id) === ownId) return false;
    const s = (v: unknown) => (v == null ? "" : String(v).trim());
    const line = [s(r.adr_unit_number), s(r.adr_street_number), s(r.adr_street_name)].filter(Boolean).join(" ");
    if (doorNumbers(line, postcode) !== nums || !streetWords(line).some((w) => words.has(w))) return false;
    const unit = s(r.adr_unit_number).match(/^(?:flat\s*)?(\d+[a-z]?)$/i)?.[1]?.toLowerCase();
    const number = s(r.adr_street_number).match(/^(\d+[a-z]?)$/i)?.[1]?.toLowerCase();
    return !(named && unit && number) || (named.flat === unit && named.at === number);
  });
  return hits.length === 1 ? String(hits[0].id) : null;
}

/** A few at a time: REX is the team's live system. */
async function eachLimited<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

function addressOf(p: Row | null): {
  name: string;
  locality: string;
  address: string;
  town: string | null;
  postcode: string | null;
} {
  if (!p) {
    return { name: "Address not recorded", locality: "", address: "Address not recorded", town: null, postcode: null };
  }
  const building = typeof p.adr_building === "string" ? str(p.adr_building) : str((p.adr_building as Row | null)?.name);
  const street = [str(p.adr_street_number), str(p.adr_street_name)].filter(Boolean).join(" ") || null;
  const unit = str(p.adr_unit_number);
  const town = str(p.adr_suburb_or_town);
  const postcode = str(p.adr_postcode);
  /* Tidied (9 Oct 2026): REX can say "6A, Douglas Gardens Mews Douglas
     Gardens Mews". The address below stays as REX has it. */
  const name = tidyAddressLine([unit, building, street].filter(Boolean).join(", "), { town }) || str(p.system_search_key) || "Address not recorded";
  const locality = [town, postcode].filter(Boolean).join(" ");
  const address = str(p.system_search_key) ?? [name, locality].filter(Boolean).join(", ");
  return { name, locality, address, town, postcode };
}

function toProperty(r: Row): ManagedProperty {
  const property = (r.property ?? null) as Row | null;
  const a = addressOf(property);
  const { image, images } = photosOf(r);
  const rent = num(r.price_rent);
  const periodId = str((r.price_rent_period as Row | null)?.id);
  const rentPeriod = periodId === "week" ? "week" : periodId === "month" ? "month" : null;
  const agentRow = (r.listing_agent_1 ?? null) as Row | null;
  const agentId = str(agentRow?.id);
  const agentName = str(agentRow?.name);

  return {
    listingId: String(r.id ?? ""),
    propertyId: str(property?.id),
    name: a.name,
    locality: a.locality,
    address: a.address,
    town: a.town,
    postcode: a.postcode,
    lat: num(property?.adr_latitude),
    lng: num(property?.adr_longitude),
    rent,
    rentPeriod,
    rentMonthly: rent == null ? null : rentPeriod === "week" ? Math.round((rent * 52) / 12) : rent,
    service: labelOf(r.lettings_service_type),
    letType: labelOf(r.let_type),
    letSince: isoDay(r.state_change_timestamp),
    onBooksSince: isoDay(r.system_ctime),
    agent: agentId && agentName ? { id: agentId, name: agentName } : null,
    landlord: partiesOf(r, "owner")[0] ?? null,
    tenants: partiesOf(r, "purchtenant"),
    image,
    images,
    epcExpiry: str(r.epc_expiry_date),
    epcRating: str(r.epc_rating),
  };
}

/** Group the book by owner contact. Biggest landlord first. */
export function landlordsOf(properties: ManagedProperty[]): ManagedLandlord[] {
  const by = new Map<string, ManagedLandlord>();
  for (const p of properties) {
    if (!p.landlord) continue;
    const l = p.landlord;
    const held = by.get(l.contactId) ?? {
      contactId: l.contactId,
      name: l.name,
      email: l.email,
      phone: l.phone,
      listingIds: [],
      rentRoll: 0,
      services: {},
    };
    held.listingIds.push(p.listingId);
    held.rentRoll += p.rentMonthly ?? 0;
    const s = p.service ?? "Not set";
    held.services[s] = (held.services[s] ?? 0) + 1;
    /* A contact can carry an email on one listing and not another; keep the
       first non-empty one seen. */
    held.email = held.email ?? l.email;
    held.phone = held.phone ?? l.phone;
    by.set(l.contactId, held);
  }
  return [...by.values()].sort(
    (a, b) => b.listingIds.length - a.listingIds.length || b.rentRoll - a.rentRoll || a.name.localeCompare(b.name, "en-GB")
  );
}

/**
 * REX PM's own figures for the homes in view: every home on its managed list
 * (each room let separately counts once, as REX PM counts it), and how many
 * it shows occupied, vacant and with a vacancy coming. An agent's slice is the
 * homes whose REX property is in their book.
 */
function pmCounts(pm: PmHome[], inBook: Set<string> | null): Pick<ManagedCounts, "homes" | "homesOccupied" | "homesVacant" | "upcomingVacancies"> {
  const mine = inBook ? pm.filter((h) => h.rexPropertyId && inBook.has(h.rexPropertyId)) : pm;
  return {
    homes: mine.length,
    homesOccupied: mine.filter((h) => h.pmStatus === "occupied").length,
    homesVacant: mine.filter((h) => h.pmStatus === "vacant").length,
    upcomingVacancies: mine.filter((h) => h.pmUpcomingVacancy).length,
  };
}

/** pmCounts for a book laid over afterwards (lib/agent-moves): the homes in it, by property id. */
export async function pmCountsFor(propertyIds: Set<string>): Promise<Pick<ManagedCounts, "homes" | "homesOccupied" | "homesVacant" | "upcomingVacancies"> | null> {
  const pm = await pmManagedHomes();
  if (!pm) return null;
  /* A home not on REX stands in the book under its own OS id. */
  const mine = pm.filter((h) => propertyIds.has(h.id) || Boolean(h.rexPropertyId && propertyIds.has(h.rexPropertyId)));
  return pmCounts(mine, null);
}

export function countsOf(all: ManagedProperty[], landlords: ManagedLandlord[]): ManagedCounts {
  /* Each home once, on its latest let - see lib/current-lets. */
  const properties = currentLets(all);
  const rents = properties.map((p) => p.rentMonthly).filter((r): r is number => r != null);
  const rentRoll = rents.reduce((a, b) => a + b, 0);
  const byService: Record<string, number> = {};
  for (const p of properties) {
    const s = p.service ?? "Not set";
    byService[s] = (byService[s] ?? 0) + 1;
  }
  return {
    properties: properties.length,
    lets: all.length,
    rentRoll,
    managedRentRoll: properties.filter((p) => MANAGED_SERVICES.has(p.service ?? "")).reduce((a, p) => a + (p.rentMonthly ?? 0), 0),
    avgRent: rents.length ? Math.round(rentRoll / rents.length) : null,
    landlords: landlords.length,
    withoutLandlord: properties.filter((p) => !p.landlord).length,
    withTenant: properties.filter((p) => p.tenants.length > 0).length,
    byService,
    towns: new Set(properties.map((p) => p.town).filter(Boolean)).size,
  };
}

/**
 * The REX properties one user owns (system_owner_user). Ids only, paged.
 * Thrown on a refusal, like the book itself: a short list would quietly drop
 * an agent's homes.
 */
async function propertiesOwnedBy(rexUserId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rexCall("Properties", "search", {
      criteria: [{ name: "system_owner_user_id", value: rexUserId }],
      limit: PAGE,
      offset: page * PAGE,
      result_format: "ids",
    });
    if (!res.ok) throw new Error(res.error ?? `REX refused the owned homes (HTTP ${res.status}).`);
    const batch = rexRows(res.result) as unknown[];
    for (const id of batch) ids.add(String(id));
    if (batch.length < PAGE) break;
  }
  return ids;
}

/**
 * REX PM HOMES THE ADDRESS MATCHER NEVER SAW (James, 14 Oct 2026). The REX
 * PM list read on 2 Oct added 25 homes with no REX property behind them, and
 * the matcher only ever ran at the September import. 44 Pilots Way had a let
 * listing in REX all along - Lorna's, with photographs - but REX PM's list
 * decides the book, so that listing was thrown out and the home stood as a
 * bare "not on REX" row: no photos, and outside Lorna's own Portfolio (it
 * showed her 0 homes). Same for 33 Eastfield Road, and Dan's and Kirstie's
 * new lets. Now an unlinked REX PM home takes the REX property of the let
 * at the same door, and keeps it in os_properties so compliance and the rest
 * read the link too. Only a sure match: same postcode, street and numbers,
 * the same unit, one REX property, and not one another home already holds.
 * The OS's own record only - nothing is written to REX.
 */
async function linkByAddress(pm: PmHome[], lets: ManagedProperty[]): Promise<void> {
  const held = new Set(pm.map((h) => h.rexPropertyId).filter(Boolean) as string[]);
  const pc = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, "");
  const doorOf = (s: string) => parseAddress(s);
  for (const h of pm) {
    if (h.rexPropertyId || !pc(h.postcode)) continue;
    const door = doorOf(h.address);
    const ids = new Set(
      lets
        .filter((p) => p.propertyId && pc(p.postcode) === pc(h.postcode) && sameHome(h.address, addrOf(p)) && sameDoor(door, doorOf(addrOf(p)), true))
        .map((p) => p.propertyId as string)
    );
    if (ids.size !== 1) continue;
    const [id] = [...ids];
    if (held.has(id)) continue;
    held.add(id);
    h.rexPropertyId = id;
    await q(
      `UPDATE os_properties SET rex_property_id = $2, match_how = 'address, from the book', updated_at = NOW()
        WHERE id = $1 AND (rex_property_id IS NULL OR rex_property_id = '')`,
      [h.id, id]
    ).catch((e) => console.error("[managed-book] could not keep the REX link for", h.id, e));
  }
}

/**
 * The whole managed book, or one agent's slice of it.
 *
 * MULTI-TENANT: `rexUserId` narrows at REX, on listing_agent_1_id, so another
 * agent's properties never enter this process for this request. Owners pass
 * null and get the business.
 */
export async function fetchManagedBook(rexUserId?: string | null): Promise<ManagedBook> {
  if (!rexConfigured()) {
    throw new Error("REX isn't connected on this environment.");
  }

  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rexCall("Listings", "search", {
      criteria: [
        { name: "system_listing_state", value: "leased" },
        { name: "listing_category_id", value: "residential_rental" },
        ...(rexUserId ? [{ name: "listing_agent_1_id", value: rexUserId }] : []),
      ],
      limit: PAGE,
      offset: page * PAGE,
      order_by: { system_modtime: "desc" },
      extra_options: { extra_fields: ["related.listing_images", "related.contact_reln_listing"] },
    });
    if (!res.ok) {
      throw new Error(res.error ?? `REX refused the managed book (HTTP ${res.status}).`);
    }
    const batch = rexRows(res.result) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  /* REX PM's own managed list decides the book (2 Oct 2026). James asked for
     the OS to read 527 like REX PM's dashboard; REX CRM's leased listings had
     it at 707, because they hold every home ever let - Let Only lettings, the
     books of agents who have left, tenancies that ended. Once REX PM's list
     has been read across, a REX letting is in the book only if its home is on
     that list. Before that (never read), the older rule stands. */
  const pm = await pmManagedHomes();
  const lets = rows.map(toProperty);
  if (pm) await linkByAddress(pm, lets);
  const pmRexIds = pm ? new Set(pm.map((h) => h.rexPropertyId).filter(Boolean) as string[]) : null;
  /* Intro only is never ours to look after (lib/intro-only, 16 Oct 2026). */
  const intro = await introOnlyIds().catch(() => new Set<string>());
  const properties = lets.filter((p) => p.listingId && !intro.has(String(p.listingId)) && (!pmRexIds || (p.propertyId && pmRexIds.has(p.propertyId))));

  /**
   * The sitting tenant, where the listing does not name one.
   *
   * Same gap as the compliance book: `purchtenant` on the listing is filled
   * for about half this book, and REX keeps the real link on the tenancy
   * application. The listing wins where it has somebody - it is the more
   * direct statement - and the application fills in behind it.
   */
  const sitting = await sittingTenantsByProperty().catch(() => new Map<string, { people: Party[] }>());
  for (const p of properties) {
    if (p.tenants.length || !p.propertyId) continue;
    const who = sitting.get(p.propertyId);
    if (who) p.tenants = who.people.map((t: Party) => ({ contactId: t.contactId, name: t.name, email: t.email, phone: t.phone }));
  }
  /* Homes REX CRM has no letting for (6 Sep 2026): the OS holds them so
     the managed book reads like REX PM's. The whole business gets every one.
     An agent gets the ones whose REX property they own (6 Oct 2026): 6 Ruskin
     Place had no REX listing, so moving it to Lianna in REX changed nothing -
     the agent's book only ever read listing_agent_1. And every room of a
     house already in their book (below). */
  /* Not caught: see activeOsProperties - an empty set is not an answer. */
  const extra: OsProperty[] = pm ?? (await activeOsProperties());
  const owned = rexUserId ? await propertiesOwnedBy(rexUserId) : null;
  /* PayProp, read here: its responsible agent counts towards an agent's book
     below, and its rent and agent fill the book at the end. */
  const pp = await getPortfolioBook().catch(() => null);
  /* The 10am/4pm read: the rent invoices and PayProp's addresses. Its
     responsible agents are used whatever its age; its rents only while it is
     fresh enough to show (the rent box's rule). */
  const agentBook = await rentBook().catch(() => null);
  const ppBook = agentBook && isFresh(agentBook) ? agentBook : null;
  const plain = (n: string) => { const w = n.replace(/\(.*?\)/g, " ").toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/); return `${w[0] ?? ""} ${w[w.length - 1] ?? ""}`; };
  /* PayProp's responsible agent on a home, on a sure address match; its
     office buckets ("TLE", "Admin property") are not people. */
  const payPropAgent = (home: { name: string; address?: string | null; postcode: string | null }): string | null => {
    if (!agentBook || !pp?.agentById) return null;
    const hit = matchHome(agentBook, home);
    if (typeof hit !== "object") return null;
    const who = pp.agentById[hit.id]?.agent?.trim();
    return who && !/^(tle|admin property|fully managed|howard|\(none\))$/i.test(who) ? who : null;
  };
  /* EVERY ROOM, NOT THE FIRST (James, 6 Oct 2026, 5b Newton Road). A REX PM
     home used to drop out of the book whenever its REX property was already
     in it - but the 6 Sep certificate import tied whole houses of rooms to
     ONE record (the house's, or Room 1's), so Room 3 at 5b "was" Room 1 and
     vanished, and 19 rooms at 166 Gloucester Road North read as one. A REX
     PM home is covered by a row already in the book only when that row is the
     same door - same unit at the same building - or, where it is the only
     REX PM home linked to that REX property, when nothing says it is another
     room. Otherwise it stands as its own row, marked not on REX: REX holds no
     record for this room itself. */
  const linkCount = new Map<string, number>();
  for (const o of extra) if (o.rexPropertyId) linkCount.set(o.rexPropertyId, (linkCount.get(o.rexPropertyId) ?? 0) + 1);
  const doorOf = (p: { name: string; locality: string }) => parseAddress(p.locality ? `${p.name}, ${p.locality}` : p.name);
  const anotherRoom = (a: Parsed, b: Parsed) =>
    a.unitWord === "room" && b.unitWord === "room" && a.unit != null && b.unit != null && a.unit !== b.unit && (a.building == null || b.building == null || a.building === b.building);
  /* propertyId → the REX PM home that IS that row, for the tenant fallback below. */
  const pmFor = new Map<string, OsProperty>();
  /* The agent REX PM names on the home (James, 12 Oct 2026: Lianna's
     Portfolio filter showed 4 of her 35 - the REX PM homes carried no agent).
     Their REX user id where a REX row in the book has the same name, so the
     filter by agent finds both kinds; otherwise the name stands on its own.
     Named agentKey, not nameKey: it shadowed lib/tenant-contacts' nameKey, so
     the tenant lookup below keyed "Ryan Gear-Hollis" as "ryan hollis" and 30
     held tenants with a middle name, hyphen or apostrophe never showed. */
  const agentKey = (n: string) => { const w = n.toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/); return `${w[0] ?? ""} ${w[w.length - 1] ?? ""}`; };
  const agentIds = new Map<string, { id: string; name: string }>();
  for (const p of properties) if (p.agent) agentIds.set(agentKey(p.agent.name), p.agent);
  const agentOf = (o: OsProperty) => (o.agentName ? agentIds.get(agentKey(o.agentName)) ?? { id: `name:${o.agentName}`, name: o.agentName } : null);
  const pmRow = (o: OsProperty, propertyId: string, listingId: string, onRex: boolean): ManagedProperty => ({
    listingId,
    propertyId,
    name: o.name || o.address,
    locality: o.locality,
    address: o.address,
    town: o.town,
    postcode: o.postcode,
    lat: null,
    lng: null,
    rent: null,
    rentPeriod: null,
    rentMonthly: null,
    /* REX PM's service package where its list has been read: a Tenant Find
       home is ours to look after on paper only. */
    service: "pmService" in o && (o as PmHome).pmService
      ? (/tenant find/i.test((o as PmHome).pmService!) ? "Let Only" : /rent collect/i.test((o as PmHome).pmService!) ? "Rent Collect" : "Managed")
      : o.management && /active/i.test(o.management) ? "Managed" : null,
    letType: null,
    letSince: null,
    onBooksSince: null,
    agent: agentOf(o),
    landlord: null,
    tenants: [],
    image: null,
    images: [],
    epcExpiry: null,
    epcRating: null,
    onRex,
    rexLet: false,
    ref: o.ref,
  });
  /* AN AGENT'S OWN HOUSES, EVERY ROOM (6 Oct 2026). An agent's book is REX's
     listings in their name, so a room REX has no let listing for - 5b Newton
     Road's Room 3 - never reached Rhiannon's Portfolio even once the whole-
     business view had it. A REX PM room joins an agent's book when another
     room of the same house is already in it: same building, same street. */
  /* The same postcode too, where both carry one (Kayleigh Wright, 16 Oct
     2026): building and street word alone made her 5 New Lane, PR9 the same
     "house" as Flat 12, 1-5 New Street, LE9 - Graham's - so it sat in her
     Portfolio. */
  const houseKey = (d: Parsed) => (d.building ? `${d.building}|${d.street}` : null);
  const pcOf = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, "");
  const theirHouses = new Map<string, Set<string>>();
  for (const p of properties) {
    const k = houseKey(doorOf(p));
    if (!k) continue;
    if (!theirHouses.has(k)) theirHouses.set(k, new Set());
    theirHouses.get(k)!.add(pcOf(p.postcode));
  }
  const inTheirHouse = (d: Parsed, o: OsProperty) => {
    const pcs = theirHouses.get(houseKey(d) ?? "");
    return Boolean(pcs) && (!pcOf(o.postcode) || pcs!.has("") || pcs!.has(pcOf(o.postcode)));
  };
  /* Or the OS record names them (Rhiannon Dodge, 19 Oct 2026): 3 Newton Road,
     4 Staddon Gardens and 5 Pottery Mews sat under her in the whole-business
     book but not in her own. Their REX properties were made by the 19 Sep
     sync, so REX names no owner, and REX ownership was the only test. The
     agent REX PM names on the home is the same answer the whole book gives. */
  /* And where nothing names an agent, PayProp's responsible agent does - the
     same fill the whole book gets at the end (Dan Richards' let-only homes,
     19 Oct 2026: under him in the whole book, missing from his own). */
  const me = rexUserId ? properties.find((p) => p.agent?.id === rexUserId)?.agent?.name : null;
  const payPropNamesMe = (o: OsProperty) => {
    if (!me || o.agentName) return false;
    const who = payPropAgent({ name: o.name || o.address, address: o.address, postcode: o.postcode });
    return Boolean(who) && plain(who!) === plain(me);
  };
  const outOfScope = (d: Parsed, o: OsProperty) =>
    Boolean(rexUserId) && !inTheirHouse(d, o) && !(o.rexPropertyId && owned?.has(o.rexPropertyId)) && agentOf(o)?.id !== rexUserId && !payPropNamesMe(o);
  /* A room that joins makes its house theirs too (Rhiannon Dodge, 16 Oct
     2026). Room 4 at 66a Fore Street joined her book because she owns its REX
     record, but the houses were listed before it joined, so Room 2 at 66a -
     REX has no record for it, REX PM names her - was turned away. A room
     turned away is looked at again once another room of its house is in. */
  const join = (row: ManagedProperty, o: OsProperty) => {
    properties.push(row);
    /* A room only: one flat must not bring in a block of other agents' flats. */
    const d = doorOf(row);
    const k = d.unitWord === "room" ? houseKey(d) : null;
    if (k) {
      if (!theirHouses.has(k)) theirHouses.set(k, new Set());
      theirHouses.get(k)!.add(pcOf(o.postcode));
    }
  };
  /* true: placed or covered; false: not theirs, yet. */
  const place = (o: OsProperty): boolean => {
    const door = parseAddress(o.address);
    if (o.rexPropertyId) {
      const onIt = properties.filter((p) => p.propertyId === o.rexPropertyId);
      const same = onIt.filter((p) => sameDoor(door, doorOf(p), true));
      const trusted = linkCount.get(o.rexPropertyId) === 1 && onIt.length > 0 && !onIt.some((p) => anotherRoom(door, doorOf(p)));
      if (same.length || trusted) {
        if (!pmFor.has(o.rexPropertyId)) pmFor.set(o.rexPropertyId, o);
        return true;
      }
      if (outOfScope(door, o)) return false;
      /* Linked to a REX property REX does not mark as let (84 of them, 6 Sep):
         the home is managed in REX PM all the same, so it joins the book under
         its REX property - unless another home already stands there. */
      if (!onIt.length) {
        join(pmRow(o, o.rexPropertyId, `pm-link-${o.rexPropertyId}`, true), o);
        pmFor.set(o.rexPropertyId, o);
        return true;
      }
      join(pmRow(o, o.id, o.id, false), o);
      pmFor.set(o.id, o);
      return true;
    }
    if (properties.some((p) => p.propertyId === o.id)) return true;
    if (outOfScope(door, o)) return false;
    join(pmRow(o, o.id, o.id, false), o);
    pmFor.set(o.id, o);
    return true;
  };
  let waiting = extra.filter((o) => !place(o));
  /* A round that places nothing is the last. */
  for (let before = -1; rexUserId && waiting.length && waiting.length !== before; ) {
    before = waiting.length;
    waiting = waiting.filter((o) => !place(o));
  }

  /* LAST LET'S TENANT, CARRIED OVER (Kirstie, 16 Oct 2026). 6 Linford Close
     was re-let to Ricky Harris and Megan Farrow from 3 Sep, but the new REX
     listing still named Aaron Hopkins - the 2024 tenant, on the old listing
     too - and the listing's tenant beats everything, so the home's page put
     Aaron's phone and email in front of the agent. A listing tenant is set
     aside only when all of these hold: every name on it is on an EARLIER let
     of the same home; REX PM, read after this let began and not showing the
     home vacant, names somebody else (no surname in common - "V Reddy" is
     Vihar Reddy); and no accepted application on this home names them,
     either on this let or starting after REX PM was read (Lauren Johnstone
     at Room 2, 5b Newton Road moved in on 9 Oct, after REX PM's 2 Oct read,
     on a newer listing - REX PM still had Bailey Deakin). Then the REX PM
     fill below names who is there. Anything less and the listing stands. */
  const surname = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/).pop() ?? "";
  const applied = await acceptedLetsByProperty().catch(() => null);
  for (const p of currentLets(properties)) {
    if (!p.tenants.length || !p.propertyId || !p.letSince || !applied) continue;
    const o = pmFor.get(p.propertyId) as PmHome | undefined;
    if (!o?.tenantNames || !o.pmReadAt || o.pmStatus === "vacant" || o.pmReadAt <= p.letSince) continue;
    const mine = p.tenants.map((t) => nameKey(t.name));
    const carried = properties.some((q) =>
      q.propertyId === p.propertyId && q.listingId !== p.listingId && (q.letSince ?? "") < p.letSince! &&
      mine.every((k) => q.tenants.some((t) => nameKey(t.name) === k)));
    if (!carried) continue;
    const pmSurnames = new Set(o.tenantNames.split(/\s*(?:[,;&]|\band\b)\s*/i).filter(Boolean).map(surname));
    if (p.tenants.some((t) => pmSurnames.has(surname(t.name)))) continue;
    const backed = (applied.get(p.propertyId) ?? []).filter((a) =>
      a.listingId === String(p.listingId) || (a.startDate != null && a.startDate > o.pmReadAt!));
    if (backed.some((a) => a.names.some((n) => mine.includes(nameKey(n))))) continue;
    p.tenants = [];
  }

  /* WHO LIVES THERE, FROM REX PM (6 Oct 2026). REX named nobody on 334 of
     481 current lets - its listing tenant is filled for about half the book
     and the accepted application for fewer. REX PM's own record names the
     tenants in residence, so where REX gives no one, the home's latest let
     reads REX PM's names - never on an older let, and never on a home REX PM
     itself shows as vacant. Names only: there is no REX contact behind them. */
  /* Their email and mobile from REX PM's Tenancies report, imported into
     os_tenant_contacts on 9 Oct 2026 (lib/tenant-contacts). */
  const held = await tenantContacts().catch(() => new Map<string, Map<string, { email: string | null; phone: string | null }>>());
  /* Not caught past here: no PayProp read means nothing is set aside. */
  const people = await payPropPeople().catch(() => null);
  for (const p of currentLets(properties)) {
    if (p.tenants.length || !p.propertyId) continue;
    const o = pmFor.get(p.propertyId);
    if (!o?.tenantNames) continue;
    if ("pmStatus" in o && (o as PmHome).pmStatus === "vacant") continue;
    const known = held.get(o.id);
    /* A name PayProp holds only as a past tenant is not living there
       (Rhiannon, 16 Oct 2026: Michael Blackmore at Room 2, 66 Fore Street,
       whose tenancy never went ahead - lib/business/payprop-tenant-contacts
       pastOnlyPeople). Where that leaves nobody, PayProp's own current
       tenancy on the home names who is, if it holds one. */
    const named = o.tenantNames.split(/\s*[,;]\s*/).filter(Boolean);
    /* Not on a Let Only home (James, 23 Oct 2026): PayProp takes the first
       month's rent on a tenant find and then ends the tenancy, so every
       sitting tenant there reads as past. 85 homes showed nobody living in
       them - 6 Linford Close's Ricky Harris, 17 Haven Close's Rosie Holland. */
    const letOnly = p.service === "Let Only" || /tenant find/i.test(("pmService" in o && (o as PmHome).pmService) || "");
    let names = letOnly ? named : named.filter((n) => !people?.pastOnly.has(personKey(n)));
    if (!names.length && named.length) {
      names = (people?.current.get(rentKey(p.address || p.name, p.postcode)) ?? [])
        .flatMap((r) => r.display.split(/\s*(?:,|&|\band\b)\s*/i))
        .map((n) => n.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    }
    p.tenants = names.map((name, i) => {
      const c = known?.get(nameKey(name));
      return { contactId: `rexpm:${o.id}:${i}`, name, email: c?.email ?? null, phone: c?.phone ?? null };
    });
  }
  /* Email and mobile from PayProp where the book has neither (9 Oct 2026):
     REX PM gives names only. Joined by the home's address, and given only to
     the tenant PayProp names as the lead (lib/business/payprop-tenant-contacts). */
  const ppContacts = people?.current ?? null;
  if (ppContacts?.size) {
    for (const p of currentLets(properties)) {
      if (!p.tenants.some((t) => !t.email && !t.phone)) continue;
      const found = attach(p.tenants.map((t) => t.name), ppContacts.get(rentKey(p.address || p.name, p.postcode)) ?? []);
      for (const [i, c] of found) {
        const t = p.tenants[i];
        if (t.email || t.phone) continue;
        p.tenants[i] = { ...t, email: c.email, phone: c.phone };
      }
    }
  }
  /* And what the OS itself holds for a tenant by name (James, 23 Oct 2026):
     os_tenant_contacts was only read for the names REX PM gives, so a tenant
     REX names with no email kept none though the contact sweep had found it
     on their Propoly deal. A blank only - never over what REX or PayProp says. */
  for (const p of currentLets(properties)) {
    if (!p.propertyId || !p.tenants.some((t) => !t.email || !t.phone)) continue;
    const o = pmFor.get(p.propertyId);
    const known = o ? held.get(o.id) : undefined;
    if (!known) continue;
    p.tenants = p.tenants.map((t) => {
      const c = known.get(nameKey(t.name));
      return c ? { ...t, email: t.email || c.email, phone: t.phone || c.phone } : t;
    });
  }
  /* THE RENT (rewritten 22 Oct 2026, Lianna Denholm's missing rents).
     PayProp's rent invoice billed today is the rent: what the tenant is
     charged now. REX's figure is the rent agreed when the home was let, and
     24 homes had moved on since (11 Upper Craigour: REX £1,450, billed
     £1,600), so PayProp's wins where it bills one and REX stands in where it
     doesn't (Let Only homes, mostly). Never PayProp's monthly_payment_required:
     it is a setting, £1,000 on nearly every Edinburgh home, and the old
     fallback put it on homes as their rent. Where nothing is billed today but
     a new tenancy is set up, the home carries that rent and its first day,
     not counted until then. Where there is no rent at all the screens say
     "No rent found"; where PayProp couldn't be read, they say that. */
  const ppDown = !ppBook || ppBook.unreachable.length > 0;
  for (const p of properties) {
    if (p.test) continue;
    const hit = ppBook ? matchHome(ppBook, p) : "none";
    const billed = typeof hit === "object" ? payPropRent(ppBook!, hit) : null;
    if (billed?.now) {
      if (p.rentMonthly != null && Math.abs(p.rentMonthly - billed.now.monthly) >= 0.5) p.rentRex = p.rentMonthly;
      p.rent = billed.now.monthly;
      p.rentPeriod = "month";
      p.rentMonthly = billed.now.monthly;
      p.rentSource = "payprop";
      continue;
    }
    if (p.rentMonthly) continue;
    p.rent = null;
    p.rentPeriod = null;
    p.rentMonthly = null;
    if (billed?.next) p.rentStarts = billed.next;
    /* No answer from PayProp for this home's agency is not "no rent". */
    else if (ppDown && typeof hit !== "object") p.rentUnread = true;
  }
  /* PAYPROP'S AGENT WHERE NOTHING ELSE NAMES ONE (James, 12 Oct 2026). 23
     homes had no agent in REX or REX PM; PayProp's responsible agent named
     one for 11 of them (Dan Richards' let-only homes, Lorna Fieldson's in
     Hull). Joined only on a sure address match (lib/rent-status matchHome);
     PayProp's office buckets ("TLE", "Admin property") are not people and
     leave it blank. The REX user id is the one that agent's REX homes carry,
     so the filter by agent finds both. */
  if (agentBook) {
    const known = new Map<string, { id: string; name: string }>();
    for (const p of properties) if (p.agent && !p.agent.id.startsWith("name:")) known.set(plain(p.agent.name), p.agent);
    for (const p of properties) {
      if (p.agent || p.test) continue;
      const who = payPropAgent(p);
      if (who) p.agent = known.get(plain(who)) ?? { id: `name:${who}`, name: who };
    }
  }
  /* Not caught past the log: a failed photo read leaves homes as they were. */
  await fillPhotosFromOtherListings(properties).catch((e) => console.error("[managed-book] photos from other listings", e));
  /* Landlords' homes and rent from each home's latest let only, or a landlord
     whose flat was re-let twice "owns" three. */
  const landlords = landlordsOf(currentLets(properties));
  const counts = countsOf(properties, landlords);
  counts.rentsFromPayProp = currentLets(properties).filter((p) => p.rentSource === "payprop").length;
  if (ppDown) counts.rentsUnread = true;
  if (pm) Object.assign(counts, pmCounts(pm, rexUserId ? new Set(properties.map((p) => String(p.propertyId ?? ""))) : null));
  return {
    properties,
    landlords,
    counts,
    pulledAt: new Date().toISOString(),
  };
}
