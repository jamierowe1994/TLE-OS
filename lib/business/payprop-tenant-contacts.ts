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
export type ContactsByKey = Map<string, Array<{ lead: { first: string; last: string } | null; display: string; email: string | null; phone: string | null }>>;

export function contactsByKey(rows: Array<Record<string, unknown>>, today = londonToday()): ContactsByKey {
  const out: ContactsByKey = new Map();
  for (const t of rows) {
    if (str(t.status) && str(t.status) !== "Active") continue;
    const email = str(t.email_address) ? str(t.email_address).toLowerCase() : null;
    const phone = ukPhone(t.mobile_number);
    if (!email && !phone) continue;
    const entry = { lead: leadOf(t), display: str(t.display_name), email, phone };
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      const end = str((pr.tenant as Record<string, unknown> | undefined)?.end_date).slice(0, 10);
      if (end && end < today) continue;
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

/** Every agency's current tenancies with a contact, by rentKey. Never waits on PayProp. */
export async function payPropContacts(): Promise<ContactsByKey> {
  const rows: Array<Record<string, unknown>> = [];
  for (const account of payPropAccounts()) {
    const held = await readCache<Array<Record<string, unknown>>>(`payprop:tenants:v1:${account}`).catch(() => null);
    if (!held || Date.now() - held.at > FRESH_MS) void refresh(account);
    if (held && Date.now() - held.at < TOO_OLD_MS && Array.isArray(held.data)) rows.push(...held.data);
  }
  return contactsByKey(rows);
}
