import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { nameKey } from "@/lib/tenant-contacts";
import { countsOf, landlordsOf } from "@/lib/managed-book";
import type { ManagedBook, ManagedProperty } from "@/lib/portfolio-types";

/**
 * MANAGEMENT TRANSFERS - TAKE-ONS (Dan Richards' ticket a9f80822, Kirstie
 * Mulholland on the 16 Oct morning call; built 19 Oct 2026).
 *
 * A landlord moves an already-let home to us. It never goes on the market:
 * no lead, listing, viewing or offer. Today the agent keys it straight into
 * Propoly. James: "a button so it would skip everything else and go straight
 * to management".
 *
 * A take-on is the home, its landlord, the sitting tenants and the tenancy
 * they are on, plus the onboarding letters that go to each of them, ticked
 * off as they go. Saving one:
 *   - for a home the OS doesn't hold yet, makes its OS property record
 *     (os_properties, source 'transfer', "Not on REX") with the landlord and
 *     the tenants' names, and their email and mobile in os_tenant_contacts -
 *     the same places a REX PM home's people live, so Portfolio, Compliance
 *     and the rest read it like any other home;
 *   - for a home already on Portfolio, marks it as a transfer and lays the
 *     landlord and tenants over it where nothing else names them.
 *
 * NOTHING HERE WRITES TO REX, PROPOLY OR PAYPROP, OR EMAILS ANYBODY. The push
 * to Propoly it would need (landlord, property, a deal with the sitting
 * tenants on it, references only where ticked) is listed on the take-on's
 * page and waits on James (tenant_changes_live, and his answers).
 */

export type TakeOnService = "managed" | "rent_collect";

export interface TakeOnTenant {
  name: string;
  email: string | null;
  phone: string | null;
  /** True: referenced through Propoly for rent and legal protection and a new contract. */
  reference: boolean;
}

export interface TakeOnComm {
  key: string;
  doneAt: string | null;
  by: string | null;
  note: string;
}

export interface TakeOn {
  id: string;
  /** The home on Portfolio: a REX listing number or an OS property id. */
  homeRef: string;
  /** The OS property record this made, when it made one. */
  osPropertyId: string | null;
  line1: string;
  town: string;
  postcode: string;
  bedrooms: number | null;
  letType: string;
  landlord: { name: string; email: string | null; phone: string | null };
  service: TakeOnService;
  feePct: number | null;
  takeoverOn: string;
  previousAgent: string;
  tenancy: { startedOn: string | null; rentPcm: number | null; depositPounds: number | null; depositHeld: string; periodic: boolean; endsOn: string | null };
  tenants: TakeOnTenant[];
  comms: TakeOnComm[];
  note: string;
  agentRexId: string | null;
  by: string;
  byEmail: string | null;
  at: string;
}

/**
 * The onboarding letters, in the order they usually go. A first list for
 * James to settle (his question 3): recorded here when sent, never sent from
 * here.
 */
export const TAKE_ON_COMMS: { key: string; to: "landlord" | "tenants" | "previous_agent"; label: string; sub: string }[] = [
  { key: "landlord_welcome", to: "landlord", label: "Welcome and terms to the landlord", sub: "Our terms signed, what happens next, who their agent is" },
  { key: "landlord_bank", to: "landlord", label: "Landlord's bank details and ID", sub: "For rent to be paid out to them" },
  { key: "previous_agent_handover", to: "previous_agent", label: "Handover pack from the previous agent", sub: "Keys, inventory, certificates, deposit, rent statement" },
  { key: "tenants_intro", to: "tenants", label: "Introduction to the tenants", sub: "We now manage the home, and how to reach us" },
  { key: "tenants_rent", to: "tenants", label: "New rent payment details to the tenants", sub: "Where the rent goes from the take-over date" },
  { key: "tenants_deposit", to: "tenants", label: "Deposit protection to the tenants", sub: "The scheme, the certificate and the prescribed information" },
  { key: "tenants_logins", to: "tenants", label: "Tenant logins sent", sub: "So they can report repairs (Send out logins on the home)" },
];

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_take_ons (
      id TEXT PRIMARY KEY,
      home_ref TEXT NOT NULL,
      os_property_id TEXT,
      line1 TEXT NOT NULL,
      town TEXT NOT NULL DEFAULT '',
      postcode TEXT NOT NULL DEFAULT '',
      bedrooms INTEGER,
      let_type TEXT NOT NULL DEFAULT 'residential',
      landlord JSONB NOT NULL,
      service TEXT NOT NULL DEFAULT 'managed',
      fee_pct NUMERIC,
      takeover_on DATE NOT NULL,
      previous_agent TEXT NOT NULL DEFAULT '',
      tenancy JSONB NOT NULL DEFAULT '{}',
      tenants JSONB NOT NULL DEFAULT '[]',
      comms JSONB NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      agent_rex_id TEXT,
      by_name TEXT NOT NULL,
      by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_take_ons_home ON os_take_ons (home_ref)`))
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

type Row = {
  id: string; home_ref: string; os_property_id: string | null; line1: string; town: string; postcode: string; bedrooms: number | null; let_type: string;
  landlord: TakeOn["landlord"]; service: string; fee_pct: string | null; takeover_on: Date | string; previous_agent: string; tenancy: TakeOn["tenancy"];
  tenants: TakeOnTenant[]; comms: TakeOnComm[]; note: string; agent_rex_id: string | null; by_name: string; by_email: string | null; created_at: Date;
};
/* A DATE comes back as local midnight: read its local parts, or a BST
   server reads 19 Oct as 18 Oct. */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (v: Date | string) => (typeof v === "string" ? v.slice(0, 10) : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`);
const shape = (r: Row): TakeOn => ({
  id: r.id,
  homeRef: r.home_ref,
  osPropertyId: r.os_property_id,
  line1: r.line1,
  town: r.town,
  postcode: r.postcode,
  bedrooms: r.bedrooms,
  letType: r.let_type,
  landlord: r.landlord,
  service: r.service === "rent_collect" ? "rent_collect" : "managed",
  feePct: r.fee_pct == null ? null : Number(r.fee_pct),
  takeoverOn: ymd(r.takeover_on),
  previousAgent: r.previous_agent,
  tenancy: r.tenancy,
  tenants: r.tenants ?? [],
  /* Every letter on the list, ticked or not, in the list's order. */
  comms: TAKE_ON_COMMS.map((c) => (r.comms ?? []).find((x) => x.key === c.key) ?? { key: c.key, doneAt: null, by: null, note: "" }),
  note: r.note,
  agentRexId: r.agent_rex_id,
  by: r.by_name,
  byEmail: r.by_email,
  at: new Date(r.created_at).toISOString(),
});

export type TakeOnInput = Omit<TakeOn, "id" | "osPropertyId" | "comms" | "at" | "homeRef"> & { homeRef: string | null };

const newId = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "x");

/**
 * Save a take-on. A home with no ref is new to the OS: its property record is
 * made here, "Not on REX", with the landlord and the tenants on it.
 */
export async function createTakeOn(t: TakeOnInput): Promise<TakeOn> {
  const id = newId();
  let homeRef = t.homeRef;
  let osPropertyId: string | null = null;
  const tenantNames = t.tenants.map((x) => x.name).join(", ");
  const service = t.service === "rent_collect" ? "rent_collect" : "managed";
  if (!homeRef) {
    osPropertyId = `mt-${id}`;
    homeRef = osPropertyId;
    const locality = [t.town, t.postcode].filter(Boolean).join(" ");
    await q(
      `INSERT INTO os_properties (id, source, ref, address, name, locality, postcode, town, bedrooms, management, categories, hmo, no_gas, rex_property_id, match_how, active,
                                  landlord_name, landlord_email, landlord_phone, agent_name, tenant_names, service_level)
       VALUES ($1, 'transfer', $2, $3, $4, $5, $6, $7, $8, 'Active', '[]'::jsonb, $9, FALSE, NULL, 'management transfer', TRUE, $10, $11, $12, $13, $14, $15)`,
      [osPropertyId, `MT-${id.slice(0, 6).toUpperCase()}`, [t.line1, t.town, t.postcode].filter(Boolean).join(", "), t.line1, locality, t.postcode || null, t.town || null, t.bedrooms,
       t.letType !== "residential", t.landlord.name, t.landlord.email, t.landlord.phone, t.by, tenantNames || null, service]
    );
  } else if (!/^\d+$/.test(homeRef)) {
    /* An OS record already: the landlord and tenants go on it where it names nobody. */
    osPropertyId = homeRef;
    await q(
      `UPDATE os_properties SET
         landlord_name = COALESCE(NULLIF(btrim(landlord_name), ''), $2),
         landlord_email = COALESCE(NULLIF(btrim(landlord_email), ''), $3),
         landlord_phone = COALESCE(NULLIF(btrim(landlord_phone), ''), $4),
         tenant_names = COALESCE(NULLIF(btrim(tenant_names), ''), $5),
         updated_at = NOW()
       WHERE id = $1`,
      [homeRef, t.landlord.name, t.landlord.email, t.landlord.phone, tenantNames || null]
    ).catch(() => {});
  }
  if (osPropertyId) {
    const { ensureTenantContacts } = await import("@/lib/tenant-contacts");
    await ensureTenantContacts();
    for (const x of t.tenants) {
      await q(
        `INSERT INTO os_tenant_contacts (os_property_id, name, name_key, email, phone, source, source_ref) VALUES ($1, $2, $3, $4, $5, 'take-on', $6)
         ON CONFLICT (os_property_id, name_key) DO UPDATE SET email = COALESCE(EXCLUDED.email, os_tenant_contacts.email), phone = COALESCE(EXCLUDED.phone, os_tenant_contacts.phone)`,
        [osPropertyId, x.name, nameKey(x.name), x.email, x.phone, id]
      );
    }
  }
  const rows = await tq<Row>(
    `INSERT INTO os_take_ons (id, home_ref, os_property_id, line1, town, postcode, bedrooms, let_type, landlord, service, fee_pct, takeover_on, previous_agent, tenancy, tenants, note, agent_rex_id, by_name, by_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18,$19) RETURNING *`,
    [id, homeRef, osPropertyId, t.line1, t.town, t.postcode, t.bedrooms, t.letType, JSON.stringify(t.landlord), service, t.feePct, t.takeoverOn, t.previousAgent,
     JSON.stringify(t.tenancy), JSON.stringify(t.tenants), t.note, t.agentRexId, t.by, t.byEmail]
  );
  return shape(rows[0]);
}

export async function getTakeOn(id: string): Promise<TakeOn | null> {
  if (!hasDb() || !id) return null;
  const rows = await tq<Row>(`SELECT * FROM os_take_ons WHERE id = $1 AND cancelled_at IS NULL`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

/** The take-on on one home, if there is one. */
export async function takeOnFor(homeRef: string): Promise<TakeOn | null> {
  if (!hasDb() || !homeRef) return null;
  const rows = await tq<Row>(`SELECT * FROM os_take_ons WHERE home_ref = $1 AND cancelled_at IS NULL ORDER BY created_at DESC LIMIT 1`, [homeRef]);
  return rows[0] ? shape(rows[0]) : null;
}

export async function openTakeOns(): Promise<TakeOn[]> {
  if (!hasDb()) return [];
  const rows = await tq<Row>(`SELECT * FROM os_take_ons WHERE cancelled_at IS NULL ORDER BY created_at DESC LIMIT 300`);
  return rows.map(shape);
}

/** Tick (or untick) one onboarding letter, with who and when. */
export async function markComm(id: string, key: string, done: boolean, by: string, note = ""): Promise<TakeOn | null> {
  if (!TAKE_ON_COMMS.some((c) => c.key === key)) return null;
  const t = await getTakeOn(id);
  if (!t) return null;
  const comms = t.comms.map((c) => (c.key === key ? { key, doneAt: done ? new Date().toISOString() : null, by: done ? by : null, note: note.slice(0, 300) } : c));
  const rows = await tq<Row>(`UPDATE os_take_ons SET comms = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, JSON.stringify(comms)]);
  return rows[0] ? shape(rows[0]) : null;
}

export async function cancelTakeOn(id: string): Promise<boolean> {
  const rows = await tq<{ id: string }>(`UPDATE os_take_ons SET cancelled_at = NOW() WHERE id = $1 AND cancelled_at IS NULL RETURNING id`, [id]);
  return rows.length > 0;
}

/**
 * Laid over the book on every read (lib/managed-book-cache), like notice and
 * record landlords: a take-on saved a moment ago is on Portfolio straight
 * away, without waiting for the next REX read. A new home is added for the
 * agent who took it on (and the whole-business view); a home already there
 * gets the take-on's rent, tenancy start, landlord and tenants where nothing
 * else names them. Never throws.
 */
export async function withTakeOns(book: ManagedBook, rexUserId: string | null): Promise<ManagedBook> {
  let all: TakeOn[];
  try {
    all = await openTakeOns();
  } catch {
    return book;
  }
  if (!all.length) return book;
  const properties = [...book.properties];
  let changed = false;
  for (const t of all) {
    const tenants = t.tenants.map((x, i) => ({ contactId: `takeon:${t.id}:${i}`, name: x.name, email: x.email, phone: x.phone }));
    const landlord = { contactId: `record:${t.landlord.name.trim().toLowerCase().replace(/\s+/g, " ")}`, name: t.landlord.name, email: t.landlord.email, phone: t.landlord.phone };
    const i = properties.findIndex((p) => String(p.listingId) === t.homeRef);
    if (i >= 0) {
      const p = properties[i];
      properties[i] = {
        ...p,
        rent: p.rentMonthly ? p.rent : t.tenancy.rentPcm,
        rentPeriod: p.rentMonthly ? p.rentPeriod : t.tenancy.rentPcm ? "month" : p.rentPeriod,
        rentMonthly: p.rentMonthly ?? t.tenancy.rentPcm,
        letSince: p.letSince ?? t.tenancy.startedOn,
        tenants: p.tenants.length ? p.tenants : tenants,
        landlord: p.landlord ?? landlord,
      };
      changed = true;
      continue;
    }
    if (!t.osPropertyId || (rexUserId && t.agentRexId !== rexUserId)) continue;
    const row: ManagedProperty = {
      listingId: t.osPropertyId,
      propertyId: t.osPropertyId,
      name: t.line1,
      locality: [t.town, t.postcode].filter(Boolean).join(" "),
      address: [t.line1, t.town, t.postcode].filter(Boolean).join(", "),
      town: t.town || null,
      postcode: t.postcode || null,
      lat: null,
      lng: null,
      rent: t.tenancy.rentPcm,
      rentPeriod: t.tenancy.rentPcm ? "month" : null,
      rentMonthly: t.tenancy.rentPcm,
      service: t.service === "rent_collect" ? "Rent Collect" : "Managed",
      letType: "Long Term",
      letSince: t.tenancy.startedOn,
      onBooksSince: t.takeoverOn,
      agent: t.agentRexId ? { id: t.agentRexId, name: t.by } : { id: `name:${t.by}`, name: t.by },
      landlord,
      tenants,
      image: null,
      images: [],
      epcExpiry: null,
      epcRating: null,
      onRex: false,
      rexLet: false,
      ref: `MT-${t.id.slice(0, 6).toUpperCase()}`,
    };
    properties.push(row);
    changed = true;
  }
  if (!changed) return book;
  const landlords = landlordsOf(properties);
  return { ...book, properties, landlords, counts: countsOf(properties, landlords) };
}
