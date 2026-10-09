import { rexCall } from "@/lib/rex";
import type { Handoff } from "@/lib/deal-handoff";
import { isHmoType, isScottish } from "@/lib/property-flags";

/**
 * THE DEAL, PUSHED (9 Oct 2026).
 *
 * Rhiannon, after the first live push on 12b Cliff Road: "the button pulled
 * the property over to Propoly but none of the landlord or accepted tenant
 * info ... didn't pull through agreed rent etc either." The rent and the
 * tenants live on a Propoly DEAL, and on 4 Sep Propoly had no way to make
 * one. By 9 Oct it had: POST /api/v1/deals answers, not in the 30 Aug spec.
 *
 * What it asks for (its own words, 9 Oct): property_id, managed_by_user_id,
 * term_months, price_pcm_pence, move_in_date, ast_template,
 * deposit_protection_scheme, tenancy_type, tenancy_service_level,
 * payment_schedule. The values below are the ones the book actually uses,
 * read from its newest deals the same day:
 *   - template: "Standard Propoly APT" in England (Renters' Rights Act, so
 *     periodic), "Propoly Scotland Lease" and "Propoly HMO Scotland Lease"
 *     north of the border; "Propertymark APT" now and then.
 *   - service level: full_managed, tenant_find, rent_collect.
 *   - payment schedule: monthly, upfront_and_monthly.
 *
 * PROVEN ON A TEST HOME, 9 Oct 2026 ("TLE OS TEST - DELETE ME, 1 Test
 * Street", deals 6d9e7a20 and e6231dec). What Propoly actually takes:
 *   - the fields wrapped in { deal: {...} }. Sent flat, a real property
 *     answers "Missing required fields: property_id".
 *   - tenancy_type: assured_periodic_tenancy, renewal, non_assured_tenancy,
 *     company_let, licence, scottish_tenancy (Propoly's own list).
 *   - tenancy_service_level: managed, rent_collection, letting_only - NOT
 *     the full_managed / tenant_find / rent_collect a deal reads back as.
 *   - deposit_protection_scheme: tds_custodial, tds_insured, dps_custodial,
 *     dps_insured, my_deposits_custodial, my_deposits_insured.
 *   - ast_template: the name as /configuration/tenancy_agreements gives it.
 *   - holding_fee_pence and deposit_pence are kept.
 * A landlord related to the property lands on the deal by itself. Propoly
 * also adds its Flatfair "DEPOSIT REPLACEMENT" clause to every deal made
 * this way, and extra_clauses: [] does not stop it - the run says so, and
 * it is taken off in Propoly when the tenant is not using Flatfair.
 *
 * DEPOSITS (James, 9 Oct 2026): "all agents go through Flatfair - if the
 * landlord opts in, the zero deposit scheme becomes available, and if not,
 * TDS is the only standard one." So the agent says whether the landlord
 * opted in; either way the deal carries a TDS scheme (Propoly requires one),
 * and the Flatfair clause Propoly adds is right only when they did. Nothing
 * in the OS records the opt-in yet, so it is the agent's tick.
 * PROPOLY_DEAL_DEPOSIT_SCHEME on Railway picks custodial or insured as the
 * starting value.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const text = (v: unknown): string | null =>
  Array.isArray(v) ? text(v[0]) : v && typeof v === "object" ? str((v as Row).text) ?? str((v as Row).id) : str(v);

export const DEAL_TEMPLATES = [
  "Standard Propoly APT",
  "Propertymark APT",
  "Propoly Scotland Lease",
  "Propoly HMO Scotland Lease",
] as const;

export const SERVICE_LEVELS = {
  full_managed: "Fully managed",
  tenant_find: "Tenant find",
  rent_collect: "Rent collect",
} as const;
export type ServiceLevel = keyof typeof SERVICE_LEVELS;

/** What the deal reads back as → what Propoly takes when it is made. */
const SERVICE_ON_WRITE: Record<ServiceLevel, string> = {
  full_managed: "managed",
  tenant_find: "letting_only",
  rent_collect: "rent_collection",
};

export const TENANCY_TYPES = {
  assured_periodic_tenancy: "Assured periodic",
  scottish_tenancy: "Scottish tenancy",
  company_let: "Company let",
  non_assured_tenancy: "Non-assured",
  licence: "Licence",
  renewal: "Renewal",
} as const;
export type TenancyType = keyof typeof TENANCY_TYPES;

/* Propoly also takes dps_custodial, dps_insured, my_deposits_custodial and
   my_deposits_insured; TLE uses TDS only. */
export const DEPOSIT_SCHEMES = {
  tds_custodial: "TDS Custodial",
  tds_insured: "TDS Insured",
} as const;
export type DepositScheme = keyof typeof DEPOSIT_SCHEMES;

export const PAYMENT_SCHEDULES = {
  monthly: "Monthly",
  upfront_and_monthly: "Upfront, then monthly",
} as const;
export type PaymentSchedule = keyof typeof PAYMENT_SCHEDULES;

/** What the agent sees, and may change, before the deal is started. */
export interface DealTerms {
  rentPcm: number | null;
  moveIn: string | null;
  termMonths: number | null;
  template: string;
  serviceLevel: ServiceLevel | null;
  paymentSchedule: PaymentSchedule;
  tenancyType: TenancyType;
  depositScheme: DepositScheme | null;
  /** The landlord opted into Flatfair's zero deposit: the clause stays and the figure is the cover. */
  zeroDeposit: boolean;
  depositPounds: number | null;
  /** None in Scotland; otherwise one week's rent, rounded down to the penny. */
  holdingFeePounds: number | null;
  scotland: boolean;
}

/** REX's lettings_service_type id → Propoly's service level. */
function serviceOf(listing: Row): ServiceLevel | null {
  const raw = listing.lettings_service_type;
  const id = (str((raw as Row | null)?.id) ?? text(raw) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (/^(managed|full(y)?_managed)$/.test(id)) return "full_managed";
  if (/^(let_only|tenant_find)$/.test(id)) return "tenant_find";
  if (/^rent_collect(ion)?$/.test(id)) return "rent_collect";
  return null;
}

/** One week's rent, never a penny over (Tenant Fees Act), in pounds. */
export function holdingFeeFor(rentPcm: number | null, scotland: boolean): number | null {
  if (scotland) return 0;
  if (!rentPcm || rentPcm <= 0) return null;
  return Math.floor(((rentPcm * 12) / 52) * 100) / 100;
}

export function isScottishListing(listing: Row, packet: Pick<Handoff, "locality" | "property">): boolean {
  /* 153279 is REX's Scottish agreement type, as the handover reads it. */
  if (str((listing.agreement_type as Row | null)?.id) === "153279") return true;
  const p = (listing.property ?? {}) as Row;
  return isScottish(str(p.adr_postcode), packet.locality, packet.property);
}

/** The deal as the accepted offer and the listing describe it. */
export function dealDefaults(packet: Handoff, listing: Row): DealTerms {
  const scotland = isScottishListing(listing, packet);
  const related = (listing.related ?? {}) as Row;
  const subcats = Array.isArray(related.listing_subcategories) ? (related.listing_subcategories as Row[]) : [];
  const type = text(subcats[0]?.subcategory) ?? text((listing.property as Row | null)?.property_subcategory);
  const hmo = isHmoType(type);
  const bond = Number(listing.price_bond);
  return {
    rentPcm: packet.rentPcm,
    moveIn: packet.startDate ? packet.startDate.slice(0, 10) : null,
    termMonths: packet.agreementMonths ?? 12,
    template: scotland ? (hmo ? "Propoly HMO Scotland Lease" : "Propoly Scotland Lease") : "Standard Propoly APT",
    serviceLevel: serviceOf(listing),
    paymentSchedule: "monthly",
    tenancyType: scotland ? "scottish_tenancy" : "assured_periodic_tenancy",
    depositScheme: officeScheme(),
    zeroDeposit: false,
    depositPounds: Number.isFinite(bond) && bond > 0 ? bond : null,
    holdingFeePounds: holdingFeeFor(packet.rentPcm, scotland),
    scotland,
  };
}

/** The agent's changes over the defaults, each checked; anything odd is ignored. */
export function withChanges(base: DealTerms, change: Partial<DealTerms> | null | undefined): DealTerms {
  if (!change) return base;
  const out = { ...base };
  const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100000 ? Math.round(v * 100) / 100 : undefined);
  const rent = money(change.rentPcm);
  if (rent !== undefined && rent > 0) out.rentPcm = rent;
  if (typeof change.moveIn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(change.moveIn)) out.moveIn = change.moveIn;
  if (typeof change.termMonths === "number" && Number.isInteger(change.termMonths) && change.termMonths >= 1 && change.termMonths <= 60) out.termMonths = change.termMonths;
  if (typeof change.template === "string" && (DEAL_TEMPLATES as readonly string[]).includes(change.template)) out.template = change.template;
  if (typeof change.serviceLevel === "string" && change.serviceLevel in SERVICE_LEVELS) out.serviceLevel = change.serviceLevel;
  if (typeof change.paymentSchedule === "string" && change.paymentSchedule in PAYMENT_SCHEDULES) out.paymentSchedule = change.paymentSchedule;
  if (typeof change.tenancyType === "string" && change.tenancyType in TENANCY_TYPES) out.tenancyType = change.tenancyType;
  if (typeof change.depositScheme === "string" && change.depositScheme in DEPOSIT_SCHEMES) out.depositScheme = change.depositScheme;
  if (typeof change.zeroDeposit === "boolean") out.zeroDeposit = change.zeroDeposit;
  const dep = money(change.depositPounds);
  if (dep !== undefined) out.depositPounds = dep;
  /* The holding fee follows the rent; it is never typed. */
  out.holdingFeePounds = holdingFeeFor(out.rentPcm, out.scotland);
  return out;
}

/**
 * The office's usual scheme, from Railway. Takes Propoly's key
 * ("tds_custodial") or its label ("TDS Custodial"); anything else is ignored.
 */
function officeScheme(): DepositScheme | null {
  const raw = (process.env.PROPOLY_DEAL_DEPOSIT_SCHEME ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return raw in DEPOSIT_SCHEMES ? (raw as DepositScheme) : null;
}

/** What stops the deal being started, in plain words. Empty = ready. */
export function dealProblems(t: DealTerms): string[] {
  const out: string[] = [];
  if (!t.rentPcm) out.push("No agreed rent.");
  if (!t.moveIn) out.push("No move-in date.");
  if (!t.termMonths) out.push("No term.");
  if (!t.serviceLevel) out.push("No service level: pick fully managed, tenant find or rent collect.");
  if (!t.depositScheme) out.push("No deposit scheme picked.");
  return out;
}

/** The POST /api/v1/deals body, wrapped as Propoly needs it. */
export function dealPayload(t: DealTerms, propertyUuid: string, managedBy: string): Record<string, unknown> {
  const pence = (p: number | null) => (p == null ? undefined : Math.round(p * 100));
  return {
    deal: {
      property_id: propertyUuid,
      managed_by_user_id: managedBy,
      term_months: t.termMonths,
      price_pcm_pence: pence(t.rentPcm),
      move_in_date: t.moveIn,
      ast_template: t.template,
      deposit_protection_scheme: t.depositScheme,
      tenancy_type: t.tenancyType,
      tenancy_service_level: t.serviceLevel ? SERVICE_ON_WRITE[t.serviceLevel] : null,
      payment_schedule: t.paymentSchedule,
      deposit_pence: pence(t.depositPounds),
      holding_fee_pence: pence(t.holdingFeePounds),
    },
  };
}

/** The listing, read for the deal's defaults (the agent's confirm panel). */
export async function dealDraftFor(packet: Handoff): Promise<{ terms: DealTerms; problems: string[] } | null> {
  if (!packet.listingId) return null;
  const res = await rexCall("Listings", "read", { id: packet.listingId });
  if (!res.ok) return null;
  const terms = dealDefaults(packet, (res.result ?? {}) as Row);
  return { terms, problems: dealProblems(terms) };
}
