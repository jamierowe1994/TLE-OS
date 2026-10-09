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
 * TWO VALUES PROPOLY WILL NOT SHOW US. The tenancy type appears on no deal,
 * and checking it needs a real property (Propoly looks the property up
 * before anything else, so a made-up one tells us nothing). The deposit
 * scheme is not on a deal either. Both come from Railway -
 * PROPOLY_DEAL_TENANCY_TYPE and PROPOLY_DEAL_DEPOSIT_SCHEME (and
 * _SCOTLAND if Scotland differs) - and until they are set the deal step
 * says so and the agent starts the deal by hand, as before.
 *
 * Holding fee and deposit go as holding_fee_pence and deposit_pence, the
 * names the deal hands back when read. Propoly does not list them as
 * required, so whether it keeps them is checked by reading the deal back.
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
  const dep = money(change.depositPounds);
  if (dep !== undefined) out.depositPounds = dep;
  /* The holding fee follows the rent; it is never typed. */
  out.holdingFeePounds = holdingFeeFor(out.rentPcm, out.scotland);
  return out;
}

/** The two values from Railway. Null when unset. */
export function dealConfig(scotland: boolean): { tenancyType: string | null; depositScheme: string | null } {
  const env = (k: string) => (process.env[k] ?? "").trim() || null;
  return {
    tenancyType: (scotland ? env("PROPOLY_DEAL_TENANCY_TYPE_SCOTLAND") : null) ?? env("PROPOLY_DEAL_TENANCY_TYPE"),
    depositScheme: (scotland ? env("PROPOLY_DEAL_DEPOSIT_SCHEME_SCOTLAND") : null) ?? env("PROPOLY_DEAL_DEPOSIT_SCHEME"),
  };
}

/** What stops the deal being started, in plain words. Empty = ready. */
export function dealProblems(t: DealTerms): string[] {
  const cfg = dealConfig(t.scotland);
  const out: string[] = [];
  if (!t.rentPcm) out.push("No agreed rent.");
  if (!t.moveIn) out.push("No move-in date.");
  if (!t.termMonths) out.push("No term.");
  if (!t.serviceLevel) out.push("No service level: pick fully managed, tenant find or rent collect.");
  if (!cfg.tenancyType) out.push("The tenancy type for Propoly isn't set yet (PROPOLY_DEAL_TENANCY_TYPE on Railway).");
  if (!cfg.depositScheme) out.push("The deposit scheme for Propoly isn't set yet (PROPOLY_DEAL_DEPOSIT_SCHEME on Railway).");
  return out;
}

/** The POST /api/v1/deals body. Flat: Propoly reads the fields at the top. */
export function dealPayload(t: DealTerms, propertyUuid: string, managedBy: string): Record<string, unknown> {
  const cfg = dealConfig(t.scotland);
  const pence = (p: number | null) => (p == null ? undefined : Math.round(p * 100));
  return {
    property_id: propertyUuid,
    managed_by_user_id: managedBy,
    term_months: t.termMonths,
    price_pcm_pence: pence(t.rentPcm),
    move_in_date: t.moveIn,
    ast_template: t.template,
    deposit_protection_scheme: cfg.depositScheme,
    tenancy_type: cfg.tenancyType,
    tenancy_service_level: t.serviceLevel,
    payment_schedule: t.paymentSchedule,
    deposit_pence: pence(t.depositPounds),
    holding_fee_pence: pence(t.holdingFeePounds),
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
