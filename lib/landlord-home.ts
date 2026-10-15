import "server-only";
import { hasDb, q } from "@/lib/db";
import { sameHome } from "@/lib/address-parse";
import { rexCall, rexConfigured } from "@/lib/rex";
import { getContact } from "@/lib/contacts-store";
import { payPropAccounts, payPropGetAll, payPropRaw, type PayPropAccountId } from "@/lib/business/payprop";
import { readCache, writeCache } from "@/lib/business/integration-cache";

/**
 * A LANDLORD'S OWN HOME ADDRESS (15 Oct 2026).
 *
 * Rhiannon: "can we add landlord home addresses to their information?"
 * Richard Callow, the same week: the terms of business would not go without
 * one. The contract has a Landlord Address box, the template makes it
 * required, and the OS had nowhere to keep the answer - os_contacts.address on
 * a landlord lead IS the property, so the box arrived blank every time and
 * the agent met it inside the signing form with nothing to copy from.
 *
 * Now one row a person in os_landlord_addresses, found by their email or
 * their contact ref ("os:<id>" | "rex:<id>"). Where we have not been told,
 * what is already held elsewhere is offered, never written back:
 *   1. what an agent saved here
 *   2. PayProp: the owner's billing address, when they are already a PayProp
 *      landlord (read from a held copy of export/beneficiaries)
 *   3. REX: the contact's postal address - unless it is the let itself, which
 *      is what the OS puts there for a lead it makes, so it says nothing
 *
 * Nothing here writes to REX or PayProp.
 *
 * ── Bank details ─────────────────────────────────────────────────────────
 *
 * Jade, 14 Oct: "will it also pull through his bank details?" PayProp holds
 * them and collects them itself; the OS never asks. bankOnFile says whether
 * PayProp has an account for them and the last four digits of it, read live
 * and kept in memory for a few hours. The full number never leaves this
 * function and is never written anywhere.
 */

export type HomeSource = "agent" | "same-as-property" | "payprop" | "rex" | "new-listing";

export interface HomeAddress {
  address: string;
  postcode: string | null;
  source: HomeSource;
  /** Saved on the landlord record (as opposed to offered from PayProp or REX). */
  saved: boolean;
  sameAsProperty: boolean;
  updatedAt: string | null;
}

export interface PersonKey {
  email?: string | null;
  ref?: string | null;
  name?: string | null;
}

const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
export function postcodeIn(s: string): string | null {
  const m = s.match(POSTCODE)?.[0];
  return m ? m.toUpperCase().replace(/\s+/g, " ").replace(/^(\S+?)(\d[A-Z]{2})$/, "$1 $2") : null;
}

const lower = (s?: string | null) => (s ?? "").trim().toLowerCase();
const nameKey = (s?: string | null) =>
  lower(s)
    .replace(/\b(mr|mrs|ms|miss|dr)\.?\s+/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ── 1. saved ───────────────────────────────────────────────────────────── */

type Row = { address: string; postcode: string; source: string; same_as_property: boolean; updated_at: string | Date };

async function savedFor(p: PersonKey): Promise<HomeAddress | null> {
  if (!hasDb()) return null;
  const email = lower(p.email);
  const ref = (p.ref ?? "").trim();
  if (!email && !ref) return null;
  const rows = await q<Row>(
    `SELECT address, postcode, source, same_as_property, updated_at FROM os_landlord_addresses
      WHERE address <> '' AND (($1 <> '' AND email = $1) OR ($2 <> '' AND person_ref = $2))
      ORDER BY updated_at DESC LIMIT 1`,
    [email, ref]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return null;
  return {
    address: r.address,
    postcode: r.postcode || null,
    source: (r.source as HomeSource) || "agent",
    saved: true,
    sameAsProperty: r.same_as_property,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/* ── 2. PayProp owners ──────────────────────────────────────────────────── */

type Owner = { id: string; account: PayPropAccountId; email: string; name: string; address: string };
const OWNERS_FRESH_MS = 6 * 3_600_000;
const OWNERS_TOO_OLD_MS = 7 * 24 * 3_600_000;
const refreshing = new Set<PayPropAccountId>();

function ownerAddress(b: Record<string, unknown>): string {
  const a = (b.billing_address ?? {}) as Record<string, unknown>;
  return ["first_line", "second_line", "third_line", "city", "postal_code"]
    .map((k) => String(a[k] ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

async function refreshOwners(account: PayPropAccountId): Promise<void> {
  if (refreshing.has(account)) return;
  refreshing.add(account);
  try {
    const rows = await payPropGetAll<Record<string, unknown>>(account, "export/beneficiaries", { owners: "true" });
    /* Reduced before it is held: who, how to reach them, and where they live.
       No bank details are in this export, and none are kept. */
    const owners: Owner[] = rows
      .filter((b) => b.id)
      .map((b) => ({
        id: String(b.id),
        account,
        email: lower(String(b.email_address ?? "")),
        name: nameKey([b.first_name, b.last_name].filter(Boolean).join(" ") || String(b.business_name ?? "")),
        address: ownerAddress(b),
      }));
    if (owners.length) await writeCache(`payprop:owners:v1:${account}`, owners);
  } catch {
    /* the held copy stands until it is too old */
  } finally {
    refreshing.delete(account);
  }
}

/** Every PayProp owner we hold. Never waits on PayProp: serves the held copy and refreshes behind it. */
async function payPropOwners(): Promise<Owner[]> {
  const out: Owner[] = [];
  for (const account of payPropAccounts()) {
    const held = await readCache<Owner[]>(`payprop:owners:v1:${account}`).catch(() => null);
    if (!held || Date.now() - held.at > OWNERS_FRESH_MS) void refreshOwners(account);
    if (held && Date.now() - held.at < OWNERS_TOO_OLD_MS && Array.isArray(held.data)) out.push(...held.data);
  }
  return out;
}

/** The PayProp owner this person is: by email, else by a name only one owner has. */
export async function payPropOwnerFor(p: PersonKey): Promise<Owner | null> {
  const owners = await payPropOwners();
  if (!owners.length) return null;
  const email = lower(p.email);
  if (email) {
    const hit = owners.filter((o) => o.email === email);
    if (hit.length) return hit[0];
  }
  const name = nameKey(p.name);
  if (name.split(" ").length >= 2) {
    const hit = owners.filter((o) => o.name === name);
    if (hit.length === 1) return hit[0];
  }
  return null;
}

/* ── 3. REX ─────────────────────────────────────────────────────────────── */

/* One REX read a person an hour, however many screens ask. */
const rexMemo = new Map<string, { at: number; v: string | null }>();
const REX_MS = 3_600_000;

async function rexPostalFor(ref: string | null | undefined): Promise<string | null> {
  if (!ref || !rexConfigured()) return null;
  const memo = rexMemo.get(ref);
  if (memo && Date.now() - memo.at < REX_MS) return memo.v;
  const v = await readRexPostal(ref);
  rexMemo.set(ref, { at: Date.now(), v });
  return v;
}

async function readRexPostal(ref: string): Promise<string | null> {
  let rexId: string | null = null;
  if (ref.startsWith("rex:")) rexId = ref.slice(4);
  else if (ref.startsWith("os:")) rexId = (await getContact(ref.slice(3)).catch(() => null))?.rexId ?? null;
  if (!rexId || !/^\d+$/.test(rexId)) return null;
  const r = await rexCall("Contacts", "read", { id: Number(rexId) }, null, { quiet: true }).catch(() => null);
  if (!r?.ok) return null;
  const c = (r.result ?? {}) as Record<string, unknown>;
  const postal = String(c.address_postal ?? "").trim();
  return postal || null;
}

/* ── together ───────────────────────────────────────────────────────────── */

/**
 * Their home address: saved, else what PayProp or REX already hold. The let
 * itself is never offered as a guess from REX - "Same as the let property" is
 * a choice the agent makes, not one we make for them.
 */
export async function findHomeAddress(p: PersonKey & { propertyAddress?: string | null }): Promise<HomeAddress | null> {
  const saved = await savedFor(p);
  if (saved) return saved;
  const offered = (address: string, source: HomeSource): HomeAddress => ({
    address,
    postcode: postcodeIn(address),
    source,
    saved: false,
    sameAsProperty: Boolean(p.propertyAddress && sameHome(address, p.propertyAddress)),
    updatedAt: null,
  });
  const owner = await payPropOwnerFor(p).catch(() => null);
  if (owner?.address) return offered(owner.address, "payprop");
  const rex = await rexPostalFor(p.ref).catch(() => null);
  if (rex && !(p.propertyAddress && sameHome(rex, p.propertyAddress))) return offered(rex, "rex");
  return null;
}

export async function saveHomeAddress(p: PersonKey & {
  address: string;
  source?: HomeSource;
  sameAsProperty?: boolean;
  by: string;
}): Promise<HomeAddress> {
  const email = lower(p.email);
  const ref = (p.ref ?? "").trim();
  if (!email && !ref) throw new Error("Which landlord? There is no email or contact to keep it against.");
  const address = p.address.trim().replace(/\s+/g, " ").slice(0, 300);
  const id = email ? `email:${email}` : ref;
  const postcode = postcodeIn(address) ?? "";
  const source: HomeSource = p.source ?? (p.sameAsProperty ? "same-as-property" : "agent");
  await q(
    `INSERT INTO os_landlord_addresses (id, email, person_ref, name, address, postcode, same_as_property, source, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
     ON CONFLICT (id) DO UPDATE SET
       person_ref = CASE WHEN EXCLUDED.person_ref <> '' THEN EXCLUDED.person_ref ELSE os_landlord_addresses.person_ref END,
       name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE os_landlord_addresses.name END,
       address = EXCLUDED.address, postcode = EXCLUDED.postcode, same_as_property = EXCLUDED.same_as_property,
       source = EXCLUDED.source, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [id, email, ref, (p.name ?? "").trim().slice(0, 160), address, postcode, Boolean(p.sameAsProperty), source, p.by]
  );
  /* The same person kept under their ref before an email was known: bring it into line. */
  if (email && ref) await q(`UPDATE os_landlord_addresses SET address = $2, postcode = $3, same_as_property = $4, source = $5, updated_at = NOW(), updated_by = $6 WHERE person_ref = $1 AND id <> $7`, [ref, address, postcode, Boolean(p.sameAsProperty), source, p.by, id]).catch(() => undefined);
  return { address, postcode: postcode || null, source, saved: true, sameAsProperty: Boolean(p.sameAsProperty), updatedAt: new Date().toISOString() };
}

/* ── bank details on file ───────────────────────────────────────────────── */

export interface BankOnFile {
  /** PayProp knows them as an owner. */
  inPayProp: boolean;
  /** PayProp holds an account to pay their rent into. */
  onFile: boolean;
  /** The last four digits, for "account ending 1234". Never more. */
  ending: string | null;
}

const bankMemo = new Map<string, { at: number; v: BankOnFile }>();
const BANK_MS = 4 * 3_600_000;

export async function bankOnFile(p: PersonKey): Promise<BankOnFile | null> {
  const owner = await payPropOwnerFor(p).catch(() => null);
  if (!owner) return null;
  const key = `${owner.account}:${owner.id}`;
  const memo = bankMemo.get(key);
  if (memo && Date.now() - memo.at < BANK_MS) return memo.v;
  const r = await payPropRaw(owner.account, `entity/beneficiary/${encodeURIComponent(owner.id)}`).catch(() => null);
  if (!r?.ok || !r.json || typeof r.json !== "object") return { inPayProp: true, onFile: false, ending: null };
  const bank = ((r.json as Record<string, unknown>).bank_account ?? null) as Record<string, unknown> | null;
  const digits = String(bank?.account_number ?? "").replace(/\D/g, "");
  const v: BankOnFile = { inPayProp: true, onFile: digits.length >= 4, ending: digits.length >= 4 ? digits.slice(-4) : null };
  bankMemo.set(key, { at: Date.now(), v });
  return v;
}
