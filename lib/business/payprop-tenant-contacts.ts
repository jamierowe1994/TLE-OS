import "server-only";
import { londonToday } from "@/lib/london-clock";
import { payPropAccounts, payPropGetAll, type PayPropAccountId } from "@/lib/business/payprop";
import { readCache, writeCache } from "@/lib/business/integration-cache";
import { rentKey } from "@/lib/business/payprop-portfolio";

/*
 * TENANTS' EMAIL AND MOBILE FROM PAYPROP (James, 9 Oct 2026): "the contact
 * details for all of these tenants are missing ... we need email and mobile."
 * 613 of the book's 834 tenants are REX PM names with no contact behind them.
 * PayProp's tenant records carry email_address and mobile_number, tied to the
 * property the tenancy is on, so they are read live and joined by address.
 *
 * Who an email belongs to is the careful part. A joint tenancy is ONE PayProp
 * record with one email: "Josh Bradbury & Kacey-leigh Howe" names Josh as the
 * lead in first_name/last_name, so it is Josh's. "A George, O Kibble, K
 * Fraser, J Turner, P Chan" names no lead, so it is nobody's - unless the home
 * has only one tenant. A detail is never copied onto a co-tenant.
 *
 * Shares payprop:tenants:v1:<account> with lib/business/deposit-match (same
 * raw rows). Serves what is held, refreshes behind every half hour, and a copy
 * over two days old is not used.
 */

const FRESH_MS = 30 * 60_000;
const TOO_OLD_MS = 48 * 3_600_000;
const refreshing = new Set<PayPropAccountId>();

export type PayPropContact = { lead: string; email: string | null; phone: string | null };

const str = (v: unknown): string => String(v ?? "").trim();

/** 447552399818 → 07552 399818; anything else as PayProp holds it. */
export function ukPhone(v: unknown): string | null {
  const d = str(v).replace(/\D/g, "");
  if (!d) return null;
  const local = d.startsWith("44") && d.length === 12 ? `0${d.slice(2)}` : d.length === 11 && d.startsWith("0") ? d : null;
  return local ? `${local.slice(0, 5)} ${local.slice(5)}` : str(v);
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
const JOINT = /,|&|\band\b/i;

/** The one person a PayProp tenant record's email and mobile belong to, or null. */
function leadOf(t: Record<string, unknown>): { first: string; last: string } | null {
  const last = str(t.last_name);
  if (last) return { first: str(t.first_name), last };
  const display = str(t.display_name) || str(t.business_name);
  if (!display || JOINT.test(display)) return null;
  const w = display.split(/\s+/);
  return w.length >= 2 ? { first: w.slice(0, -1).join(" "), last: w[w.length - 1] } : null;
}

/** Current PayProp tenancies by rentKey, with their contact and named lead. */
/**
 * Still living there on `today`, by one of PayProp's tenant records on one
 * home. An end date decides it when there is one: PayProp marks a tenant
 * Inactive the moment their tenancy is given an end date, before they have
 * left (Flat 11, 24 Ashley Place, 27 Oct 2026: Inactive, ending 31 Oct, and
 * shown as past tenants with the flat empty). With no end date, Active is
 * current and Inactive is not.
 */
export function payPropTenancyCurrent(status: unknown, endDate: unknown, today = londonToday()): boolean {
  const end = str(endDate).slice(0, 10);
  if (end) return end >= today;
  return !str(status) || str(status) === "Active";
}

export type ContactsByKey = Map<string, Array<{ lead: { first: string; last: string } | null; display: string; email: string | null; phone: string | null }>>;

export function contactsByKey(rows: Array<Record<string, unknown>>, today = londonToday()): ContactsByKey {
  const out: ContactsByKey = new Map();
  for (const t of rows) {
    const email = str(t.email_address) ? str(t.email_address).toLowerCase() : null;
    const phone = ukPhone(t.mobile_number);
    if (!email && !phone) continue;
    const entry = { lead: leadOf(t), display: str(t.display_name), email, phone };
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      if (!payPropTenancyCurrent(t.status, (pr.tenant as Record<string, unknown> | undefined)?.end_date, today)) continue;
      const addr = pr.address as Record<string, unknown> | undefined;
      const keys = new Set([rentKey(str(pr.property_name), str(addr?.postal_code)), rentKey(str(addr?.first_line), str(addr?.postal_code))].filter(Boolean));
      for (const k of keys) out.set(k, [...(out.get(k) ?? []), entry]);
    }
  }
  return out;
}

/**
 * Which of a home's tenants each PayProp contact belongs to. A tenant gets a
 * contact when the record's lead has their surname (and, if two of the
 * home's tenants share it, their first name or initial), or when the home has
 * one tenant and one PayProp record. Returns tenant index → contact.
 */
export function attach(tenantNames: string[], records: ContactsByKey extends Map<string, infer V> ? V : never): Map<number, PayPropContact> {
  const out = new Map<number, PayPropContact>();
  if (!records.length) return out;
  if (tenantNames.length === 1 && records.length === 1) {
    const r = records[0];
    out.set(0, { lead: r.display, email: r.email, phone: r.phone });
    return out;
  }
  for (const r of records) {
    if (!r.lead) continue;
    const last = words(r.lead.last).join(" ");
    const first = words(r.lead.first)[0] ?? "";
    const bySurname = tenantNames.map((n, i) => ({ i, w: words(n) })).filter(({ w }) => w.length && w.join(" ").endsWith(last));
    const hits = bySurname.length > 1 ? bySurname.filter(({ w }) => first && (w[0] === first || (w[0].length === 1 && w[0] === first[0]))) : bySurname;
    if (hits.length !== 1 || out.has(hits[0].i)) continue;
    out.set(hits[0].i, { lead: r.display, email: r.email, phone: r.phone });
  }
  return out;
}

async function refresh(account: PayPropAccountId): Promise<void> {
  if (refreshing.has(account)) return;
  refreshing.add(account);
  try {
    const rows = await payPropGetAll<Record<string, unknown>>(account, "export/tenants");
    if (rows.length) await writeCache(`payprop:tenants:v1:${account}`, rows);
  } catch {
    /* the held copy stands until it is too old */
  } finally {
    refreshing.delete(account);
  }
}

async function heldRows(): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const account of payPropAccounts()) {
    const held = await readCache<Array<Record<string, unknown>>>(`payprop:tenants:v1:${account}`).catch(() => null);
    if (!held || Date.now() - held.at > FRESH_MS) void refresh(account);
    if (held && Date.now() - held.at < TOO_OLD_MS && Array.isArray(held.data)) rows.push(...held.data);
  }
  return rows;
}

/** PayProp's tenant records as held, every agency. Never waits on PayProp. */
export async function payPropTenantRows(): Promise<Array<Record<string, unknown>>> {
  return heldRows();
}

/** Every agency's current tenancies with a contact, by rentKey. Never waits on PayProp. */
export async function payPropContacts(): Promise<ContactsByKey> {
  return contactsByKey(await heldRows());
}

/** A person by their first and last word: "Michael  Blackmore", "Elizabeth Jane Aspden-Mansfield". */
export function personKey(name: string): string {
  const w = words(name);
  return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : "";
}

/**
 * PEOPLE PAYPROP HOLDS ONLY AS PAST TENANTS (Rhiannon Dodge, 16 Oct 2026).
 *
 * Room 2, 66 Fore Street showed Michael Blackmore as its tenant, with a
 * property visit owed for him, and his tenancy never went ahead. REX PM still
 * names him on the room; PayProp has him as an Inactive tenant on no home at
 * all, and nobody on the room. Of the 607 tenants the book takes from REX PM,
 * 15 are like him (30 Violet Crescent named Stephanie Russell, who left in
 * 2022; PayProp has Niomi Richer and Aaron Clark there now).
 *
 * A name is here when PayProp holds somebody by that first and last name and
 * NONE of their records is an Active tenancy on a home today. Every name on
 * a joint record counts: "Marcia Sanders & Michael Gallagher" is Active at 77
 * Rushmoor Drive, so Michael Gallagher is current. Somebody PayProp has never
 * heard of is not here - no record is not a moved-out record. Nothing is held
 * (PayProp not read), nothing is here.
 */
export function pastOnlyPeople(rows: Array<Record<string, unknown>>, today = londonToday()): Set<string> {
  const now = new Set<string>();
  const past = new Set<string>();
  for (const t of rows) {
    const props = (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>;
    const current = props.some((pr) => payPropTenancyCurrent(t.status, (pr.tenant as Record<string, unknown> | undefined)?.end_date, today));
    const names = new Set<string>();
    for (const part of (str(t.display_name) || str(t.business_name)).split(/\s*(?:,|&|\band\b)\s*/i)) {
      const k = personKey(part);
      if (k) names.add(k);
    }
    const lead = leadOf(t);
    if (lead) { const k = personKey(`${lead.first} ${lead.last}`); if (k) names.add(k); }
    for (const k of names) (current ? now : past).add(k);
  }
  for (const k of now) past.delete(k);
  return past;
}

/** Current tenancies by rentKey, and the people PayProp holds only as past tenants. */
export async function payPropPeople(): Promise<{ current: ContactsByKey; pastOnly: Set<string> }> {
  const rows = await heldRows();
  return { current: contactsByKey(rows), pastOnly: pastOnlyPeople(rows) };
}
