import "server-only";
import skeletons from "./rex-skeletons.json";
import { demoOrigin } from "./mode";
import { ENQUIRY_LINES, FIRST, HOME_KINDS, INSIDE_PHOTOS, LAST, LEAD_SOURCES, PHOTOS, STAFF, STREETS, TOWNS } from "./world-data";

/**
 * THE DEMO'S INVENTED WORLD (lib/demo/mode).
 *
 * Sixty homes, their landlords and tenants, the staff who look after them and
 * everything in motion around them, held as the rows REX would have answered
 * with. lib/demo/rex reads and changes these rows, so a press in the demo
 * changes what the next screen shows, exactly as it would against REX.
 *
 * ── Three rules ───────────────────────────────────────────────────────────
 *
 * 1. Nobody here exists. Names come from lib/demo/world-data, emails end
 *    @sandbox.invalid, phones are 07700 900xxx.
 * 2. No dates are written down. Every date is laid out from the moment the
 *    world is built, so there is always a viewing tomorrow, a certificate due
 *    next month and a tenancy that began last spring, whatever today is.
 * 3. It is the same world every time it is built (a fixed seed), and it is
 *    built again each morning, UK time: yesterday's presses are gone, the way
 *    a demo should start.
 *
 * Each row starts from REX's own layout (rex-skeletons.json: field names
 * only, taken from the structure of real answers) so a screen reading a field
 * we never thought about finds it empty, rather than missing.
 */

type Row = Record<string, unknown>;
const skeleton = (call: string): Row => structuredClone((skeletons as Record<string, unknown>)[call] ?? {}) as Row;

/** A small fixed-seed random number source: the same world every build. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
/** REX's own date-time wording: "2026-11-17 18:25:26". */
export const rexTime = (ms: number) => { const d = new Date(ms); return `${isoDay(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const secs = (ms: number) => Math.floor(ms / 1000);

export type DemoUser = { id: string; first: string; last: string; name: string; email: string; role: "agent" | "office" | "owner"; scotland: boolean; position: string; phone: string };
export type DemoWorld = {
  builtOn: string;
  at: number;
  users: DemoUser[];
  /** Every collection, as REX rows, by the name lib/demo/rex files them under. */
  rows: Record<string, Row[]>;
  nextId: number;
};

const SOURCE_ADDRESS: Record<string, string> = {
  Rightmove: "*@rightmove.co.uk", Zoopla: "*@zoopla.co.uk", OnTheMarket: "*@onthemarket.com", Website: "*@siteloft.com", Direct: "",
};

const phone = (n: number) => `07700 900${pad(Math.floor(n / 10) % 100)}${n % 10}`;
const email = (first: string, last: string) => `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@sandbox.invalid";

const userRef = (u: DemoUser) => ({ id: u.id, name: u.name, first_name: u.first, last_name: u.last, email_address: u.email });
const agentRef = (u: DemoUser) => ({ ...userRef(u), position: u.position, phone_direct: u.phone, phone_mobile: u.phone, profile_image: null, is_account_user: "1" });

function picture(path: string) {
  const url = `${demoOrigin()}${path}`;
  const thumb = { uri: url, url, dimensions: "800x600" };
  return { uri: url, url, thumbs: { "80x60": thumb, "200x150": thumb, "400x300": thumb, "800x600": thumb } };
}

export function buildWorld(now = Date.now()): DemoWorld {
  const rnd = seeded(20261117);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  /* ── Staff ── */
  const users: DemoUser[] = STAFF.map((s, i) => ({
    /* Staff sit on the company's own domain, as the Showroom's sample agent
       does: the OS tells its own people from everybody else's by it (the
       diary, the agents list). Customers stay @sandbox.invalid. */
    id: String(9001 + i), first: s.first, last: s.last, name: `${s.first} ${s.last}`, email: email(s.first, s.last).replace("@sandbox.invalid", "@thelettingexperts.co.uk"),
    role: s.role, scotland: s.scotland, position: s.position, phone: phone(100 + i),
  }));
  const agents = users.filter((u) => u.role === "agent");
  const accountUsers = users.map((u) => ({
    ...skeleton("AccountUsers/search"),
    id: u.id, account_user_id: u.id, email: u.email, first_name: u.first, last_name: u.last,
    settings: { ...(skeleton("AccountUsers/search").settings as Row), position: u.position, phone_direct: u.phone, phone_mobile: u.phone, default_location: { id: "1", text: u.scotland ? "Edinburgh" : "Nottingham" } },
    user_account_status: "active", user_registration_status: "registered", user_mfa_enabled: "1",
    user_links: { calendar: `cal-${u.id}` },
  }));

  /* ── People ── */
  let personNo = 0;
  const contacts: Row[] = [];
  const person = (kind: string, fixed?: [string, string]) => {
    const n = personNo++;
    const first = fixed?.[0] ?? FIRST[(n * 7 + 3) % FIRST.length];
    const last = fixed?.[1] ?? LAST[(n * 11 + 5) % LAST.length];
    const c: Row = {
      ...skeleton("Contacts/read"),
      id: String(13_000_001 + n), name: `${first} ${last}`, name_first: first, name_last: last,
      email_address: email(first, last), phone_number: phone(200 + n), type: { id: "person", text: "Person" },
      is_dnd: false, system_record_state: "active", system_ctime: secs(now - between(60, 700) * DAY), system_modtime: secs(now - between(1, 40) * DAY),
      _kind: kind,
    };
    contacts.push(c);
    return c;
  };
  const contactRef = (c: Row) => ({ id: c.id, name: c.name, name_first: c.name_first, name_last: c.name_last, email_address: c.email_address, phone_number: c.phone_number });

  /* ── Homes and their listings ── */
  const properties: Row[] = [];
  const listings: Row[] = [];
  const compliance: Row[] = [];
  const landlords: Row[] = [];
  const HOMES = 60;
  for (let i = 0; i < HOMES; i++) {
    const town = TOWNS[i % TOWNS.length];
    const agent = agents.filter((a) => a.scotland === town.scotland)[i % agents.filter((a) => a.scotland === town.scotland).length];
    const [kind, beds, baseRent] = HOME_KINDS[i % HOME_KINDS.length];
    const flat = kind === "Flat";
    const street = i === 0 ? "Recreation Terrace" : STREETS[(i * 3 + 1) % STREETS.length];
    const number = i === 0 ? 8 : between(1, 140);
    const postcode = i === 0 ? "NG2 3AB" : `${town.area}${pick(town.districts)} ${between(1, 9)}${"ABDEFGHJLNPQRSTUWXYZ"[between(0, 19)]}${"ABDEFGHJLNPQRSTUWXYZ"[between(0, 19)]}`;
    const rent = i === 0 ? 1250 : Math.round((baseRent * (town.scotland ? 1.08 : 1) + between(-4, 6) * 5) / 5) * 5;
    const propertyId = String(24_000_001 + i);
    const listingId = 800_001 + i;

    /* One landlord for every two homes or so: some own several. */
    const owner = i === 0 ? person("landlord", ["Raj", "Chauhan"]) : i % 5 === 3 && landlords.length ? landlords[Math.floor(rnd() * landlords.length)] : person("landlord");
    if (!landlords.includes(owner)) landlords.push(owner);

    const address = {
      adr_unit_number: flat ? `Flat ${between(1, 12)}` : null, adr_street_number: String(number), adr_street_name: street,
      adr_suburb_or_town: town.town, adr_postcode: postcode, adr_locality: null, adr_country: "United Kingdom", adr_state_or_region: null,
      adr_latitude: String(town.lat + (rnd() - 0.5) * 0.06), adr_longitude: String(town.lng + (rnd() - 0.5) * 0.09),
    };
    const searchKey = [address.adr_unit_number, `${number} ${street}`, town.town, postcode].filter(Boolean).join(", ");
    const property: Row = {
      ...skeleton("Properties/read"), ...address, id: propertyId, system_search_key: searchKey,
      property_category: { id: "residential", text: "Residential" },
      property_subcategory: { id: kind.toLowerCase().replace(/[^a-z]+/g, "_"), text: kind, metadata: { property_category_id: "residential" } },
      attr_bedrooms: beds, attr_bathrooms: beds > 2 ? 2 : 1, system_owner_user: userRef(agent), system_record_state: "active",
      system_ctime: secs(now - between(200, 900) * DAY), system_modtime: secs(now - between(1, 30) * DAY),
      property_image: picture(PHOTOS[i % PHOTOS.length]),
      _bedrooms: beds,
    };
    properties.push(property);

    /* 42 let, 14 on the market, 4 withdrawn. */
    /* Of sixty: 24 on the market (12 advertised, 6 still drafts, 6 let agreed), 4 withdrawn, the rest let. */
    const state = i === 0 ? "leased" : i % 15 === 14 ? "withdrawn" : i % 5 === 1 || i % 5 === 2 ? "current" : "leased";
    const leased = state === "leased";
    const letAt = now - between(20, 620) * DAY;
    const publishedAt = now - between(2, 34) * DAY;
    const draft = state === "current" && i % 10 === 2;
    const letAgreed = state === "current" && i % 10 === 6;
    const service = i % 10 === 3 ? "Let Only" : i % 10 === 8 ? "Rent Collect" : "Managed";

    const tenants = leased
      ? Array.from({ length: i === 0 ? 1 : beds > 2 && i % 4 === 0 ? 2 : 1 + (i % 3 === 0 ? 1 : 0) }, (_, t) => (i === 0 && t === 0 ? person("tenant", ["Sophie", "Turner"]) : person("tenant")))
      : [];
    const relns = [
      { id: `${listingId}-o`, reln_type: { id: "owner", text: "Listing Owner" }, contact: contactRef(owner) },
      ...tenants.map((t, n) => ({ id: `${listingId}-t${n}`, reln_type: { id: "purchtenant", text: "Purchaser/Tenant" }, contact: contactRef(t) })),
    ];
    const epcExpiry = isoDay(now + between(-20, 2400) * DAY);
    const images = [PHOTOS[i % PHOTOS.length], INSIDE_PHOTOS[i % INSIDE_PHOTOS.length], PHOTOS[(i + 3) % PHOTOS.length]].map((p, n) => ({
      ...picture(p), id: `${listingId}-img${n}`, priority: n, system_modtime: secs(publishedAt),
    }));
    const heading = `${beds} Bedroom ${kind} on ${street}`;
    const listing: Row = {
      ...skeleton("Listings/read"), ...skeleton("Listings/search"),
      id: listingId, etag: `e${listingId}`,
      property: { ...(skeleton("Listings/search").property as Row), ...address, id: propertyId, system_search_key: searchKey, property_category: property.property_category, property_subcategory: property.property_subcategory, system_owner_user: userRef(agent), property_image: property.property_image },
      location: { id: "1", text: town.town },
      listing_category: { id: "residential_rental", text: "Residential Rental" },
      system_listing_state: state, system_publication_status: draft || state !== "current" ? (leased ? "published" : "draft") : "published",
      system_publication_time: draft ? null : secs(publishedAt), system_publication_user_id: draft ? null : Number(agent.id),
      publish_to_portals: !draft, publish_to_general: !draft, publish_to_external: !draft, publish_to_automatch: !draft,
      let_agreed: letAgreed ? true : null, under_application: letAgreed, under_contract: false, application_status: letAgreed ? "accepted" : null,
      price_rent: rent, price_rent_period: { id: "month", text: "Per Month" }, price_bond: Math.round((rent * 12) / 52) * 5, price_advertise_as: `£${rent.toLocaleString("en-GB")} pcm`,
      price_match: rent, available_from_date: leased ? null : isoDay(now + between(3, 35) * DAY),
      let_type: { id: "long_term", text: "Long Term" }, tenancy_type: { id: town.scotland ? "prt" : "ast", text: town.scotland ? "Private Residential Tenancy" : "Assured Shorthold Tenancy" },
      lettings_service_type: { id: service.toLowerCase().replace(/\s+/g, "_"), text: service },
      let_minimum_term_months: 12, council_tax_included_in_rent: false,
      epc_rating: "ABCCCDDE"[i % 8], epc_expiry_date: epcExpiry, epc_current_eer: String(55 + (i % 30)), epc_potential_eer: String(78 + (i % 12)),
      state_date: leased ? isoDay(letAt) : null, state_change_timestamp: leased ? secs(letAt) : state === "withdrawn" ? secs(now - between(5, 60) * DAY) : null,
      state_value_price: leased ? rent : null,
      system_ctime: secs(leased ? letAt - between(10, 50) * DAY : publishedAt - between(1, 6) * DAY), system_modtime: secs(now - between(0, 12) * DAY - between(0, 80_000) * 1000),
      listing_agent_1: agentRef(agent), listing_agent_2: null, system_owner_user: userRef(agent), system_created_user: userRef(agent), system_modified_user: userRef(agent),
      listing_primary_image: picture(PHOTOS[i % PHOTOS.length]), security_user_rights: ["read", "update"], rex_home_enabled: false,
      related: {
        listing_images: images,
        listing_adverts: [{ advert_type: "internet", advert_heading: heading, advert_body: `A well kept ${beds} bedroom ${kind.toLowerCase()} in ${town.town}, close to shops and transport. Gas central heating and double glazing throughout. Offered ${i % 2 ? "unfurnished" : "part furnished"}.` }],
        contact_reln_listing: relns,
        listing_events: [], listing_documents: [], listing_features: [], listing_tags: [], listing_idealfors: [], listing_views: [], listing_links: [], listing_subcategories: [{ subcategory: { id: "house", text: kind }, priority: 0 }],
      },
      _propertyId: propertyId, _agentId: agent.id, _beds: beds,
    };
    listings.push(listing);

    /* Certificates: gas (not in Scotland's all-electric flats), electrics, EPC. */
    const cert = (type: string, issuedAgo: number, lastsDays: number, extra: Row = {}) => {
      const issued = now - issuedAgo * DAY;
      compliance.push({
        ...skeleton("ComplianceEntries/search"), id: 500_000 + compliance.length, etag: `c${compliance.length}`, type_id: type,
        parent_object_id: Number(propertyId), parent_object_type: { id: "property", text: "Property" }, system_record_state: "active",
        source: { id: "manual", text: "Manual" }, file: null, schema: null,
        details: { [type]: { notes: "", issue_date: isoDay(issued), expiry_date: isoDay(issued + lastsDays * DAY), not_required: false, status: "satisfactory", ...extra } },
        system_ctime: secs(issued), system_modtime: secs(issued), system_created_user: userRef(agent), system_modified_user: userRef(agent),
      });
    };
    if (leased || state === "current") {
      if (!(flat && i % 6 === 5)) cert("gas_safety", i % 12 === 7 ? 371 : i % 12 === 9 ? 340 : between(20, 300), 365);
      cert("eicr", i % 20 === 11 ? 1830 : between(60, 1500), 1826);
      cert("epc", between(100, 2800), 3652, { epc_rating: null, epc_current_eer: 55 + (i % 30), epc_potential_eer: 78 + (i % 12) });
    }
  }

  /* ── Enquiries ── */
  const onMarket = listings.filter((l) => l.system_listing_state === "current");
  const leads: Row[] = [];
  for (let i = 0; i < 46; i++) {
    const valuation = i % 9 === 4;
    const listing = valuation ? null : onMarket[i % onMarket.length];
    const who = person(valuation ? "landlord-lead" : "applicant");
    const agent = listing ? (users.find((u) => u.id === listing._agentId) as DemoUser) : agents[i % agents.length];
    /* A dozen in the last day or so, then thinning out over a fortnight. */
    const at = now - (i < 12 ? i * 0.09 + rnd() * 0.05 : 1 + (i - 12) * 0.4 + rnd() * 0.3) * DAY;
    const done = i % 4 === 3;
    const source = pick(LEAD_SOURCES);
    leads.push({
      ...skeleton("Leads/read"), ...skeleton("Leads/search"),
      id: String(700_001 + i), etag: `l${i}`, contact: contactRef(who),
      listing: listing ? { id: listing.id, property: listing.property, location: listing.location, listing_category: listing.listing_category, listing_primary_image: listing.listing_primary_image, listing_agent_1: listing.listing_agent_1 } : null,
      property: listing ? listing.property : null,
      subject: valuation ? "Valuation request" : `Enquiry about ${(listing!.property as Row).system_search_key}`,
      body_snippet: valuation ? "I own a two bedroom flat and would like to know what it could let for." : ENQUIRY_LINES[i % ENQUIRY_LINES.length],
      lead_type: valuation ? { id: "appraisal_request", text: "Appraisal Request" } : { id: "listing_enquiry", text: "Listing Enquiry" },
      lead_source: { id: source.toLowerCase(), text: source },
      lead_status: done ? { id: "completed", text: "Completed" } : i % 4 === 1 ? { id: "in_progress", text: "In Progress" } : { id: "new", text: "New" },
      /* REX names the portal an enquiry came through by the address it arrived from. */
      assignee: userRef(agent), received_from_email: SOURCE_ADDRESS[source] ?? "", is_spam: null, spam_score: "0", is_email_lead: "1",
      /* Lead times are seconds, as text: REX's own inconsistency, kept. */
      system_ctime: String(secs(at)), system_modtime: String(secs(at)), system_assigned_time: String(secs(at)), system_completed_time: done ? String(secs(at + 0.2 * DAY)) : null,
      system_record_state: "active", system_created_user: userRef(agent), system_modified_user: userRef(agent), security_user_rights: ["read", "update"],
      _agentId: agent.id,
    });
  }

  /* ── The diary: a calendar each, and three weeks of appointments around today ── */
  const calendars = users.map((u) => ({
    ...skeleton("Calendars/search"), id: `cal-${u.id}`, name: u.name, is_default: true, owner_user: agentRef(u),
    access_level: { id: "owner", text: "Owner" }, system_ctime: secs(now - 400 * DAY), system_modtime: secs(now - 30 * DAY), security_user_rights: ["read", "update"],
  }));
  const todayStart = Date.parse(`${isoDay(now)}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
  const events: Row[] = [];
  const stubOfListing = (l: Row) => ({ id: l.id, property: l.property, location: l.location, listing_agent_1: l.listing_agent_1, listing_category: l.listing_category, listing_primary_image: l.listing_primary_image, system_listing_state: l.system_listing_state });
  const applicants = contacts.filter((c) => c._kind === "applicant");
  const appointment = (agent: DemoUser, day: number, hour: number, mins: number, kind: "Viewing" | "Market Appraisal" | "Property Inspection", listing: Row, who: Row | null) => {
    const start = todayStart + day * DAY + hour * 3_600_000 + (events.length % 2) * 1_800_000;
    const address = String((listing.property as Row).system_search_key);
    const past = start < now;
    const cancelled = kind === "Viewing" && events.length % 11 === 7;
    events.push({
      ...skeleton("CalendarEvents/read"), ...skeleton("CalendarEvents/search"),
      id: `ev-${1000 + events.length}`, title: `${kind} - ${address}`, description: kind === "Viewing" && who ? `Viewing with ${who.name}` : "",
      starts_at: { time: iso(start), tzid: "Europe/London" }, ends_at: { time: iso(start + mins * 60_000), tzid: "Europe/London" },
      status: cancelled ? { id: "cancelled", text: "Cancelled" } : past ? { id: "completed", text: "Completed" } : { id: "confirmed", text: "Confirmed" },
      is_cancelled: cancelled, is_private: false, is_recurring: false, private_note: "",
      calendar: { id: `cal-${agent.id}`, name: agent.name, is_default: true, owner_user: agentRef(agent) },
      organiser_user: agentRef(agent), system_created_user: userRef(agent), system_modified_user: userRef(agent),
      appointment_type: { id: kind === "Viewing" ? 1 : kind === "Market Appraisal" ? 2 : 3, name: kind, duration: mins },
      event_location: { latitude: (listing.property as Row).adr_latitude, longitude: (listing.property as Row).adr_longitude, description: address },
      records: [
        { id: String(listing.id), service: "Listings", label: address, stub: stubOfListing(listing) },
        { id: String((listing.property as Row).id), service: "Properties", label: address, stub: listing.property },
        ...(who ? [{ id: String(who.id), service: "Contacts", label: who.name, stub: contactRef(who) }] : []),
      ],
      external_guests: [], guest_calendars: [], access_level: { id: "owner", text: "Owner" }, transparency: { id: "opaque", text: "Busy" },
      system_ctime: secs(start - between(1, 6) * DAY), system_modtime: secs(start - DAY),
    });
  };
  for (let day = -10; day <= 10; day++) {
    for (const [n, agent] of agents.entries()) {
      const mine = onMarket.filter((l) => l._agentId === agent.id);
      const let_ = listings.filter((l) => l.system_listing_state === "leased" && l._agentId === agent.id);
      if (mine.length) {
        appointment(agent, day, 10 + ((day + n + 20) % 3), 30, "Viewing", mine[(day + 10 + n) % mine.length], applicants[(day + 10) * agents.length + n] ?? applicants[n]);
        if ((day + n) % 2 === 0) appointment(agent, day, 14 + ((day + 20) % 3), 30, "Viewing", mine[(day + 13 + n) % mine.length], applicants[(day + 10) * 3 + n + 7] ?? applicants[n + 1]);
      }
      if ((day + n + 30) % 4 === 0 && let_.length) appointment(agent, day, 12, 45, "Property Inspection", let_[(day + 10 + n) % let_.length], null);
      if ((day + n + 30) % 5 === 0 && mine.length) appointment(agent, day, 16, 60, "Market Appraisal", mine[(day + 11) % mine.length], landlords[(day + 10 + n) % landlords.length]);
    }
  }

  /* ── Lets in progress: an application on every let-agreed home, and a few just in ── */
  const applications: Row[] = [];
  const application = (listing: Row, who: Row[], status: "received" | "communicated" | "accepted", daysAgo: number) => {
    const agent = users.find((u) => u.id === listing._agentId) as DemoUser;
    const at = now - daysAgo * DAY;
    const rent = Number(listing.price_rent);
    applications.push({
      ...skeleton("TenancyApplications/search"), id: 600_001 + applications.length, etag: `a${applications.length}`,
      agent: userRef(agent), listing: { ...stubOfListing(listing), listing_agent_2: null }, notes: null, conditions: null,
      related: {
        listing_application_tenants: who.map((c, n) => ({
          id: `${600_001 + applications.length}-t${n}`, dob: null, contact: { ...contactRef(c), address: null, address_postal: null }, guarantors: [], is_primary: n === 0,
          net_income: 2400 + ((applications.length * 137 + n * 311) % 1400), net_income_period: { id: "month", text: "Per Month" }, employment_status: { id: "employed", text: "Employed" },
        })),
      },
      application_status: { id: status, text: status === "received" ? "Received" : status === "communicated" ? "Communicated" : "Accepted" },
      date_received: isoDay(at), date_communicated: status === "received" ? null : isoDay(at + DAY), date_accepted: status === "accepted" ? isoDay(at + 2 * DAY) : null, date_unsuccessful: null,
      start_date: isoDay(now + between(9, 30) * DAY), end_date: null, agreement_length_months: 12, offer_amount: rent, offer_amount_period: { id: "month", text: "Per Month" },
      lease_type: { id: "fixed", text: "Fixed Term" }, agreement_type: { id: "ast", text: "Assured Shorthold Tenancy" }, bond_deposit_type: { id: "deposit", text: "Deposit" },
      bond_amount_required: Math.round((rent * 12 * 5) / 52), holding_deposit_amount: Math.round((rent * 12) / 52), holding_deposit_status: { id: status === "accepted" ? "paid" : "not_paid", text: status === "accepted" ? "Paid" : "Not Paid" },
      has_pets: applications.length % 4 === 1, num_of_occupants: who.length, num_of_households: 1, managed_take_over: false,
      system_owner_user: userRef(agent), system_created_user: userRef(agent), system_modified_user: userRef(agent), security_user_rights: ["read", "update"],
      system_ctime: secs(at), system_modtime: secs(at + DAY), system_accepted_set_at: status === "accepted" ? secs(at + 2 * DAY) : null,
      system_communicated_set_at: status === "received" ? null : secs(at + DAY), system_total_income: 30_000 + applications.length * 900, system_affordability_percentage: 32,
      _agentId: agent.id,
    });
  };
  let nextApplicant = 20;
  for (const [n, l] of onMarket.entries()) {
    if (l.let_agreed) application(l, [applicants[nextApplicant++ % applicants.length], ...(n % 2 ? [applicants[nextApplicant++ % applicants.length]] : [])], "accepted", 3 + n);
    else if (n % 3 === 0) application(l, [applicants[nextApplicant++ % applicants.length]], n % 2 ? "communicated" : "received", 1 + (n % 4));
  }

  return {
    builtOn: isoDay(now), at: now, users, nextId: 900_000,
    rows: { users: accountUsers, contacts, properties, listings, compliance, leads, calendars, events, applications, appraisals: [] },
  };
}

/* One world a process (kept on globalThis so a hot reload does not wipe a
   demo half way through), rebuilt when the UK day changes. */
const holder = globalThis as unknown as { __tleDemoWorld?: DemoWorld; __tleDemoDay?: string };
const ukDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

export function demoWorld(): DemoWorld {
  const today = ukDay();
  if (!holder.__tleDemoWorld || holder.__tleDemoDay !== today) {
    holder.__tleDemoWorld = buildWorld();
    holder.__tleDemoDay = today;
  }
  return holder.__tleDemoWorld;
}

/** Put everything back as it was this morning (Admin, and the nightly reset). */
export function resetDemoWorld(): DemoWorld {
  holder.__tleDemoWorld = buildWorld();
  holder.__tleDemoDay = ukDay();
  return holder.__tleDemoWorld;
}
