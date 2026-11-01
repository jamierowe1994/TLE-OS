/**
 * A HOME'S DETAILS, PUT RIGHT IN THE OS (2 Nov 2026). Client-safe: no imports.
 *
 * James, 1 Nov 2026: about 40% of agent tickets were "I can't change this
 * field" or "the details didn't pull through" - a managed home showing as let
 * only (Rhiannon, 5d26b116), a tenancy that started on the 1st showing the
 * 27th (Lorna, 33 Eastfield Road), the wrong tenant on the home (Kirstie,
 * 821688). The agent knows; the record didn't let them say. So the home's
 * page has one Edit, and what is saved is the OS's own answer: it beats REX,
 * REX PM and PayProp on every screen, and is never written back to them (the
 * OS owns the data, REX is the mirror - and REX, PayProp and Propoly are
 * read-only). Where REX still says something else the field says so, quietly.
 *
 * What is kept here, and on what:
 *
 *   service        the home      Managed / Let Only / Rent Collect
 *   letType        the let       Long Term / Short Term
 *   tenancyStart   the let       the day the current tenancy began
 *   tenancyEnd     the let       its end date, or "rolling"
 *   tenants        the let       who lives there, when the record names the wrong people
 *
 * Two more are on the same Edit and kept where they already lived, so there
 * is still one answer each: the type of home and the gas supply are home
 * facts (lib/home-facts), and "no longer managed" is the archive
 * (lib/archived-homes). Every change of any of them is in the one log.
 */

export type OverrideField = "service" | "letType" | "tenancyStart" | "tenancyEnd" | "tenants";

export type ServiceLevel = "managed" | "market_only" | "rent_collect";

export interface OverrideTenant {
  name: string;
  email: string | null;
  phone: string | null;
}

/** The values, as saved. A field that is not here is REX's (or the record's). */
export interface HomeOverrideValues {
  service?: ServiceLevel;
  letType?: string;
  /** YYYY-MM-DD. */
  tenancyStart?: string;
  /** YYYY-MM-DD, or "rolling" for a periodic tenancy with no end date. */
  tenancyEnd?: string;
  tenants?: OverrideTenant[];
}

/** What the record would say without the OS's answer, said in words, and who changed it. */
export interface OverrideMark {
  by: string;
  at: string;
  /** The value REX / the record holds today, in words, or null when it holds nothing. */
  was: string | null;
}

/** Every field on the one Edit, the home facts and management included. */
/** "contract": the answer to "Do you need to re-sign a new contract?" after a change of service (2 Nov 2026). */
export type LoggedField = OverrideField | "homeType" | "gasSupply" | "management" | "contract";

export interface OverrideLogEntry {
  id: string;
  field: LoggedField;
  /** In words, as the screen showed them. */
  from: string | null;
  to: string | null;
  by: string;
  at: string;
}

/** Whether a field belongs to the home (every let of it) or to one let. */
export const FIELD_SCOPE: Record<OverrideField, "home" | "let"> = {
  service: "home",
  letType: "let",
  tenancyStart: "let",
  tenancyEnd: "let",
  tenants: "let",
};

export const FIELD_LABEL: Record<LoggedField, string> = {
  service: "Service",
  letType: "Let type",
  tenancyStart: "Tenancy start",
  tenancyEnd: "Tenancy end",
  tenants: "Tenants",
  homeType: "Type of home",
  gasSupply: "Gas",
  management: "Management",
  contract: "Contract",
};

export const SERVICE_CHOICES: { value: ServiceLevel; label: string; sub: string }[] = [
  { value: "managed", label: "Managed", sub: "We look after the home: certificates, inspections, repairs" },
  { value: "market_only", label: "Let Only", sub: "We found the tenant. The landlord looks after the rest" },
  { value: "rent_collect", label: "Rent Collect", sub: "We collect the rent and nothing else" },
];

/** The book's words for each level, as REX spells its service type. */
export const SERVICE_LABEL: Record<ServiceLevel, string> = { managed: "Managed", market_only: "Let Only", rent_collect: "Rent Collect" };

/** The level a book's service words stand for, or null. */
export function serviceLevelOf(words: string | null | undefined): ServiceLevel | null {
  const s = (words ?? "").toLowerCase();
  if (/rent\s*collect/.test(s)) return "rent_collect";
  if (/let\s*only|tenant\s*find|market/.test(s)) return "market_only";
  if (/manag/.test(s)) return "managed";
  return null;
}

export const LET_TYPES = ["Long Term", "Short Term"] as const;

export const isServiceLevel = (v: unknown): v is ServiceLevel => v === "managed" || v === "market_only" || v === "rent_collect";
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(`${v}T12:00:00Z`).getTime());

/** The contact id the book gives a tenant the OS named (not a REX or REX PM contact). */
export const osTenantId = (listingId: string, i: number) => `ostenant:${listingId}:${i}`;
export const isOsTenantId = (id: string | null | undefined) => /^ostenant:/.test(String(id ?? ""));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1 Nov 2026" from 2026-11-01, without a time zone moving the day. */
export function sayDay(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** A field's value in words, for the log and for "REX still says". */
export function sayValue(field: OverrideField, v: unknown): string | null {
  if (v == null || v === "") return null;
  switch (field) {
    case "service":
      return isServiceLevel(v) ? SERVICE_LABEL[v] : String(v);
    case "tenancyStart":
      return sayDay(String(v));
    case "tenancyEnd":
      return v === "rolling" ? "Rolling, no end date" : sayDay(String(v));
    case "tenants":
      return Array.isArray(v) ? (v as OverrideTenant[]).map((t) => t.name).filter(Boolean).join(", ") || "Nobody" : null;
    default:
      return String(v);
  }
}

/** Tidy and check a tenant list from the screen. Null when it is not a list of named people. */
export function cleanTenants(v: unknown): OverrideTenant[] | null {
  if (!Array.isArray(v) || v.length > 12) return null;
  const out: OverrideTenant[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") return null;
    const r = t as Record<string, unknown>;
    const name = String(r.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const email = String(r.email ?? "").trim().slice(0, 200) || null;
    const phone = String(r.phone ?? "").replace(/[^\d+ ]/g, "").trim().slice(0, 40) || null;
    if (!name && !email && !phone) continue;
    if (!name) return null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    out.push({ name, email, phone });
  }
  return out;
}
