import { currentLets, MANAGED_SERVICES } from "@/lib/current-lets";
import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { activeOsProperties, pmManagedHomes, type OsProperty, type PmHome } from "@/lib/os-properties";
import { getPortfolioBook, rentKey } from "@/lib/business/payprop-portfolio";
import { getTenancyRegister } from "@/lib/business/payprop-tenancy";
import { attach, payPropContacts } from "@/lib/business/payprop-tenant-contacts";
import { sittingTenantsByProperty } from "@/lib/rex-tenants";
import { parseAddress, sameDoor, type Parsed } from "@/lib/address-parse";
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
  const name = [unit, building, street].filter(Boolean).join(", ") || str(p.system_search_key) || "Address not recorded";
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
  const pmRexIds = pm ? new Set(pm.map((h) => h.rexPropertyId).filter(Boolean) as string[]) : null;
  const properties = rows.map(toProperty).filter((p) => p.listingId && (!pmRexIds || (p.propertyId && pmRexIds.has(p.propertyId))));

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
    agent: null,
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
  const houseKey = (d: Parsed) => (d.building ? `${d.building}|${d.street}` : null);
  const theirHouses = new Set(properties.map((p) => houseKey(doorOf(p))).filter((k): k is string => Boolean(k)));
  const outOfScope = (d: Parsed, o: OsProperty) =>
    Boolean(rexUserId) && !theirHouses.has(houseKey(d) ?? "") && !(o.rexPropertyId && owned?.has(o.rexPropertyId));
  for (const o of extra) {
    const door = parseAddress(o.address);
    if (o.rexPropertyId) {
      const onIt = properties.filter((p) => p.propertyId === o.rexPropertyId);
      const same = onIt.filter((p) => sameDoor(door, doorOf(p), true));
      const trusted = linkCount.get(o.rexPropertyId) === 1 && onIt.length > 0 && !onIt.some((p) => anotherRoom(door, doorOf(p)));
      if (same.length || trusted) {
        if (!pmFor.has(o.rexPropertyId)) pmFor.set(o.rexPropertyId, o);
        continue;
      }
      if (outOfScope(door, o)) continue;
      /* Linked to a REX property REX does not mark as let (84 of them, 6 Sep):
         the home is managed in REX PM all the same, so it joins the book under
         its REX property - unless another home already stands there. */
      if (!onIt.length) {
        properties.push(pmRow(o, o.rexPropertyId, `pm-link-${o.rexPropertyId}`, true));
        pmFor.set(o.rexPropertyId, o);
        continue;
      }
      properties.push(pmRow(o, o.id, o.id, false));
      pmFor.set(o.id, o);
      continue;
    }
    if (outOfScope(door, o) || properties.some((p) => p.propertyId === o.id)) continue;
    properties.push(pmRow(o, o.id, o.id, false));
    pmFor.set(o.id, o);
  }

  /* WHO LIVES THERE, FROM REX PM (6 Oct 2026). REX named nobody on 334 of
     481 current lets - its listing tenant is filled for about half the book
     and the accepted application for fewer. REX PM's own record names the
     tenants in residence, so where REX gives no one, the home's latest let
     reads REX PM's names - never on an older let, and never on a home REX PM
     itself shows as vacant. Names only: there is no REX contact behind them. */
  for (const p of currentLets(properties)) {
    if (p.tenants.length || !p.propertyId) continue;
    const o = pmFor.get(p.propertyId);
    if (!o?.tenantNames) continue;
    if ("pmStatus" in o && (o as PmHome).pmStatus === "vacant") continue;
    p.tenants = o.tenantNames.split(/\s*[,;]\s*/).filter(Boolean).map((name, i) => ({ contactId: `rexpm:${o.id}:${i}`, name, email: null, phone: null }));
  }
  /* Email and mobile from PayProp where the book has neither (9 Oct 2026):
     REX PM gives names only. Joined by the home's address, and given only to
     the tenant PayProp names as the lead (lib/business/payprop-tenant-contacts). */
  const ppContacts = await payPropContacts().catch(() => null);
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
  /* PayProp's rent where REX holds none (2 Oct 2026). 234 of the 527 homes
     had no rent in REX, so the rent roll was short by a third. PayProp's is
     the rent being collected now, read live; an account the OS cannot reach
     (E&W while its connection is down) adds nothing rather than an old figure.
     Never overrides a rent REX does hold - where the two disagree is the
     Rent Check's business, not the book's. */
  /* The Rent invoice first (9 Oct 2026): what the tenant is billed. The
     property's monthly_payment_required setting is the fallback only, as it
     goes stale - 6 Ruskin Place showed £1,000 against a £1,200 invoice. A
     register over a day old is not used for this. */
  const [pp, reg] = await Promise.all([getPortfolioBook().catch(() => null), getTenancyRegister().catch(() => null)]);
  const invoiced = reg?.rentByRentKey && Date.now() - Date.parse(reg.computedAt) < 26 * 3_600_000 ? reg.rentByRentKey : null;
  if (pp?.rentByKey || invoiced) {
    for (const p of properties) {
      if (p.rentMonthly) continue;
      const key = rentKey(p.address || p.name, p.postcode);
      const rent = invoiced?.[key] ?? pp?.rentByKey?.[key];
      if (!rent) continue;
      p.rent = rent;
      p.rentPeriod = "month";
      p.rentMonthly = rent;
      p.rentSource = "payprop";
    }
  }
  /* Landlords' homes and rent from each home's latest let only, or a landlord
     whose flat was re-let twice "owns" three. */
  const landlords = landlordsOf(currentLets(properties));
  const counts = countsOf(properties, landlords);
  counts.rentsFromPayProp = currentLets(properties).filter((p) => p.rentSource === "payprop").length;
  if (pm) Object.assign(counts, pmCounts(pm, rexUserId ? new Set(properties.map((p) => String(p.propertyId ?? ""))) : null));
  return {
    properties,
    landlords,
    counts,
    pulledAt: new Date().toISOString(),
  };
}
