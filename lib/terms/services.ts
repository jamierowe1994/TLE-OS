import type { Country } from "@/lib/terms/types";

/**
 * The services an agent can put on the terms, with each one's standard fees,
 * worded as the current edition's fee table words them (Scotland, October
 * 2026: Tenant Find, Rent Collection, Experts Management Service). The agent
 * can change any of them before sending; the standard is only where they
 * start. A contract keeps the words it was sent with, so changing these never
 * touches one already out.
 *
 * October 2026 has no plain Full Management column any more: Rent Collection
 * now carries the 12% and management is the Experts Management Service at
 * 14%. December 2024's four options are gone from the drawer with it.
 */
export interface ServiceOption {
  id: string;
  label: string;
  setUpFee: string;
  managementFee: string;
}

const SCOTLAND: ServiceOption[] = [
  { id: "tenant-find", label: "Tenant Find", setUpFee: "75% of the first month's rent + VAT (minimum £500 + VAT)", managementFee: "Not applicable - Tenant Find" },
  { id: "rent-collection", label: "Rent Collection", setUpFee: "50% of the first month's rent + VAT (minimum £500 + VAT)", managementFee: "12% + VAT (14.4% inc VAT) of the rent each month" },
  { id: "experts-management", label: "Experts Management Service", setUpFee: "50% of the first month's rent + VAT (minimum £500 + VAT)", managementFee: "14% + VAT (16.8% inc VAT) of the rent each month" },
];

export function servicesFor(country: Country): ServiceOption[] {
  return country === "scotland" ? SCOTLAND : SCOTLAND;
}

/**
 * The closest standard service to what a listing's record calls its service.
 * A home on the old Full Management lands on Experts Management, the only
 * managed service the October 2026 terms offer; the agent can change it.
 */
export function guessService(country: Country, onRecord: string | null | undefined): ServiceOption {
  const list = servicesFor(country);
  const s = (onRecord ?? "").toLowerCase();
  if (/rent\s*collect/.test(s)) return list.find((o) => o.id === "rent-collection")!;
  if (/let\s*only|tenant\s*find|intro/.test(s)) return list.find((o) => o.id === "tenant-find")!;
  return list.find((o) => o.id === "experts-management")!;
}
