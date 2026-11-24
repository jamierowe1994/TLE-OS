import type { Block, Country, TermsDoc, TermsValues } from "@/lib/terms/types";

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
 *
 * England's October 2026 table carries the same three services at the same
 * fees, so both countries share the one list until either table changes.
 */
export interface ServiceOption {
  id: string;
  label: string;
  setUpFee: string;
  managementFee: string;
}

const OCT26: ServiceOption[] = [
  { id: "tenant-find", label: "Tenant Find", setUpFee: "75% of the first month's rent + VAT (minimum £500 + VAT)", managementFee: "Not applicable - Tenant Find" },
  { id: "rent-collection", label: "Rent Collection", setUpFee: "50% of the first month's rent + VAT (minimum £500 + VAT)", managementFee: "12% + VAT (14.4% inc VAT) of the rent each month" },
  { id: "experts-management", label: "Experts Management Service", setUpFee: "50% of the first month's rent + VAT (minimum £500 + VAT)", managementFee: "14% + VAT (16.8% inc VAT) of the rent each month" },
];

const BY_COUNTRY: Record<Country, ServiceOption[]> = { scotland: OCT26, england: OCT26 };

/**
 * The managed service without Rent & Legal Protection (Susan Liles, ticket
 * 198f8ba9, 24 Nov 2026): for a landlord who goes ahead with a tenant who
 * failed the RLP referencing, so can't be covered. Same fees as the managed
 * service with it (James, 24 Nov 2026). Offered only behind the "tobrlp"
 * switch; with it on, the managed service is worded as a choice of two.
 */
export const NO_RLP = "experts-management-no-rlp";
const WITH_RLP_LABEL = "Experts Managed Service - including Rent & Legal Protection";
const NO_RLP_LABEL = "Experts Managed Service - excluding Rent & Legal Protection";

function withRlpChoice(list: ServiceOption[]): ServiceOption[] {
  return list.flatMap((o) =>
    o.id !== "experts-management" ? [o] : [{ ...o, label: WITH_RLP_LABEL }, { ...o, id: NO_RLP, label: NO_RLP_LABEL }]
  );
}

/** `rlpChoice`: the "tobrlp" switch is on, so the managed service comes with or without RLP. */
export function servicesFor(country: Country, rlpChoice = false): ServiceOption[] {
  return rlpChoice ? withRlpChoice(BY_COUNTRY[country]) : BY_COUNTRY[country];
}

/**
 * The closest standard service to what a listing's record calls its service.
 * A home on the old Full Management lands on Experts Management, the only
 * managed service the October 2026 terms offer; the agent can change it.
 */
export function guessService(country: Country, onRecord: string | null | undefined, rlpChoice = false): ServiceOption {
  const list = servicesFor(country, rlpChoice);
  const s = (onRecord ?? "").toLowerCase();
  if (rlpChoice && (s === NO_RLP || /exclud\w*\s+rent\s*(&|and)\s*legal/.test(s))) return list.find((o) => o.id === NO_RLP)!;
  if (/rent\s*collect/.test(s)) return list.find((o) => o.id === "rent-collection")!;
  if (/let\s*only|tenant\s*find|intro/.test(s)) return list.find((o) => o.id === "tenant-find")!;
  return list.find((o) => o.id === "experts-management")!;
}

/** The service a contract went out on: its id where it carries one (24 Nov 2026 on), else by its words. */
export function serviceOfTerms(country: Country, v: { serviceId?: string | null; serviceLevel?: string | null } | null | undefined, rlpChoice = false): ServiceOption | null {
  if (!v) return null;
  const list = servicesFor(country, rlpChoice);
  return (v.serviceId ? list.find((o) => o.id === v.serviceId) : null) ?? list.find((o) => o.label === v.serviceLevel) ?? null;
}

/**
 * Does the service include Rent & Legal Protection? For the PLC check.
 * True on the managed service, false on the one without it and on Tenant Find
 * and Rent Collection (neither has it), null when the service isn't known.
 */
export function rlpIncluded(serviceId: string | null | undefined): boolean | null {
  if (serviceId === "experts-management") return true;
  if (serviceId === NO_RLP || serviceId === "tenant-find" || serviceId === "rent-collection") return false;
  return null;
}

/** The same, read from a contract's values: its service id, or for one sent before ids were kept, its words. */
export function rlpIncludedIn(v: { serviceId?: string | null; serviceLevel?: string | null } | null | undefined): boolean | null {
  if (!v) return null;
  const byId = rlpIncluded(v.serviceId);
  if (byId !== null) return byId;
  const s = (v.serviceLevel ?? "").trim();
  if (s === NO_RLP_LABEL) return false;
  if (s === WITH_RLP_LABEL || s === "Experts Management Service") return true;
  if (s === "Tenant Find" || s === "Rent Collection") return false;
  return null;
}

/* The words the contract carries on the managed service without RLP (24 Nov 2026), for Susan to approve. */
const NOT_INCLUDED = "Rent and Legal Protection is not included with this service.";
const POLICY_CLAUSE = "Where the Landlord selects the Experts Management Service, the Agent will arrange a Rent and Legal Protection policy";
const NO_POLICY = "Rent and Legal Protection is not included with this service, so the Agent will not arrange a Rent and Legal Protection policy for the Property.";

/**
 * The contract as it reads for the service it goes out on. On every service
 * but the managed one without RLP this is the edition itself, untouched, so a
 * contract already signed or out renders exactly as it did. Without RLP: the
 * Rent & legal Insurance row reads "No" for the managed service, the service
 * and fees say RLP is not included, and the Insurance clause no longer says
 * the Agent arranges a policy.
 */
export function forService(doc: TermsDoc, v: Pick<TermsValues, "serviceId">): TermsDoc {
  if (v.serviceId !== NO_RLP) return doc;
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      blocks: s.blocks.flatMap((b): Block[] => {
        if (b.kind === "fees") return [b, { kind: "p", text: NOT_INCLUDED }];
        if (b.kind === "table")
          return [{ ...b, rows: b.rows.map((r) => (/^rent\s*&\s*legal insurance$/i.test(r[0] ?? "") ? [...r.slice(0, -1), "No"] : r)) }];
        if (b.kind === "p" && b.text.startsWith(POLICY_CLAUSE)) return [{ ...b, text: NO_POLICY }];
        return [b];
      }),
    })),
  };
}
