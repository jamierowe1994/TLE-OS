import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
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
function landlordsOf(properties: ManagedProperty[]): ManagedLandlord[] {
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

function countsOf(properties: ManagedProperty[], landlords: ManagedLandlord[]): ManagedCounts {
  const rents = properties.map((p) => p.rentMonthly).filter((r): r is number => r != null);
  const rentRoll = rents.reduce((a, b) => a + b, 0);
  const byService: Record<string, number> = {};
  for (const p of properties) {
    const s = p.service ?? "Not set";
    byService[s] = (byService[s] ?? 0) + 1;
  }
  return {
    properties: properties.length,
    rentRoll,
    avgRent: rents.length ? Math.round(rentRoll / rents.length) : null,
    landlords: landlords.length,
    withoutLandlord: properties.filter((p) => !p.landlord).length,
    withTenant: properties.filter((p) => p.tenants.length > 0).length,
    byService,
    towns: new Set(properties.map((p) => p.town).filter(Boolean)).size,
  };
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

  const properties = rows.map(toProperty).filter((p) => p.listingId);
  const landlords = landlordsOf(properties);
  return {
    properties,
    landlords,
    counts: countsOf(properties, landlords),
    pulledAt: new Date().toISOString(),
  };
}
