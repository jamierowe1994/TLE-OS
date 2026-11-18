import "server-only";
import type { AgentApplication } from "@/lib/business/rex-stats";
import { demoWorld, isoDay } from "./world";

/**
 * THE DEMO'S LETS IN PROGRESS (lib/demo/mode).
 *
 * On live the lets board is read from the pre-tenancy system's deals. The
 * demo has no such system, so lib/business/propoly-deals asks here instead,
 * and this makes a deal for each let-agreed home in the invented world and a
 * few just starting, one at every step of the way: deal started, holding fee
 * taken, references, tenancy being drawn up, signing and move-in monies.
 *
 * Built from the same world as everything else, so the home, the agent and
 * the people on a deal are the ones on its listing and its application. The
 * step each deal has reached is fixed by its place in the list, so the board
 * always has something in every column.
 */

type Row = Record<string, unknown>;

export type DemoDeal = { app: AgentApplication; statusKey: string; managerEmail: string | null; managerName: string | null };

const STEPS = [
  { key: "start_deal", label: "Deal started", stage: "received" },
  { key: "holding_fee", label: "Holding fee taken", stage: "received" },
  { key: "references", label: "Awaiting references", stage: "communicated" },
  { key: "tenancy_generation", label: "Tenancy generation", stage: "communicated" },
  { key: "signing_and_move_in_monies", label: "Signing & move-in monies", stage: "accepted" },
] as const;

const DAY = 86_400_000;

export function demoDeals(): DemoDeal[] {
  const w = demoWorld();
  const out: DemoDeal[] = [];
  for (const [n, a] of w.rows.applications.entries()) {
    const listing = w.rows.listings.find((l) => String(l.id) === String((a.listing as Row).id));
    if (!listing) continue;
    const step = STEPS[n % STEPS.length];
    const at = STEPS.findIndex((s) => s.key === step.key);
    const p = listing.property as Row;
    const rent = Number(listing.price_rent);
    const agent = listing.listing_agent_1 as Row;
    const relns = ((listing.related as Row).contact_reln_listing as Row[]) ?? [];
    const owner = relns.find((r) => (r.reln_type as Row).id === "owner")?.contact as Row | undefined;
    const people = (((a.related as Row).listing_application_tenants as Row[]) ?? []).map((t, i) => {
      const c = t.contact as Row;
      return { name: String(c.name), email: (c.email_address as string) ?? null, phone: (c.phone_number as string) ?? null, isPrimary: i === 0 };
    });
    const started = w.at - (3 + n * 2) * DAY;
    const service = String((listing.lettings_service_type as Row).text);
    const images = (((listing.related as Row).listing_images as Row[]) ?? []).map((i) => String(i.url));
    out.push({
      statusKey: step.key,
      managerEmail: String(agent.email_address).toLowerCase(),
      managerName: String(agent.name),
      app: {
        id: `demo-deal-${a.id}`,
        listingId: String(listing.id),
        images,
        image: images[0] ?? null,
        stage: step.stage,
        status: step.label,
        propertyName: [p.adr_unit_number, `${p.adr_street_number} ${p.adr_street_name}`].filter(Boolean).join(", "),
        locality: `${p.adr_suburb_or_town} ${p.adr_postcode}`,
        offer: rent,
        offerPeriod: "month",
        affordability: null,
        dateReceived: isoDay(started),
        dateCommunicated: null,
        dateAccepted: null,
        dateUnsuccessful: null,
        daysToLandlord: null,
        daysToDecision: null,
        endDate: null,
        leaseType: null,
        agreementType: null,
        startDate: isoDay(w.at + (6 + n * 3) * DAY),
        agreementMonths: 12,
        occupants: people.length,
        hasPets: Boolean(a.has_pets),
        tenants: people,
        notes: null,
        conditions: null,
        propoly: {
          statusKey: step.key,
          holdingFee: Math.round((rent * 12) / 52),
          deposit: Math.round((rent * 12 * 5) / 52),
          service: service === "Let Only" ? "Tenant find" : service === "Rent Collect" ? "Rent collect" : "Fully managed",
          standingOrderRef: null,
          depositReplacement: false,
          landlord: owner ? { name: String(owner.name), email: (owner.email_address as string) ?? null, phone: (owner.phone_number as string) ?? null } : null,
          propertyUuid: `demo-prop-${p.id}`,
          landlordUuids: owner ? [`demo-ll-${owner.id}`] : [],
          landlords: owner ? [{ uuid: `demo-ll-${owner.id}`, name: String(owner.name), email: (owner.email_address as string) ?? null, phone: (owner.phone_number as string) ?? null }] : [],
          guarantors: [],
          holdingPaid: at >= 1 ? { status: "paid", paidAt: isoDay(started + DAY), method: "bank_transfer" } : { status: "unpaid", paidAt: null, method: null },
          referencing: at >= 2 ? { status: at >= 3 ? "complete" : "in_progress", outcome: at >= 3 ? "pass" : null, startedAt: isoDay(started + 2 * DAY), required: people.length, decided: at >= 3 ? people.length : 0 } : null,
          tenantRefs: people.map((t) => ({ name: t.name, required: true, decision: at >= 3 ? "pass" : null })),
          agreement: at >= 3 ? { status: at >= 4 ? "sent" : "draft", tenants: people.length, tenantsSigned: at >= 4 ? Math.max(0, people.length - 1) : 0, landlords: 1, landlordsSigned: at >= 4 ? 1 : 0, guarantorStatus: null, guarantorsRequired: 0, guarantorsDone: 0 } : null,
          moveInMonies: at >= 4 ? { status: "requested", paidAt: null } : null,
        },
      } as AgentApplication,
    });
  }
  return out;
}
