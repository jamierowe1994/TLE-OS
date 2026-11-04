import "server-only";
import { getApplicationById, getApplications, type Application } from "@/lib/applications";
import { applyLead, leadOverrides } from "@/lib/lead-tenant";
import { isTestId, testApplication } from "@/lib/test-overlay";
import { activeOsProperties, factsByRexId } from "@/lib/os-properties";
import { findPropolyDeal, type BusinessDeal } from "@/lib/business/propoly-deals";
import { sameHome } from "@/lib/address-parse";
import { dealForLet } from "@/lib/let-deal";
import { tenantsAsOnLet } from "@/lib/let-people";

/**
 * Everything the handover already knows before anybody types.
 *
 * ── Why the agent is never asked for this ──────────────────────────────────
 *
 * By the time a pack goes to compliance the property, the people and the
 * move-in date have all been agreed and recorded - on the listing, on the
 * application, in the offer that was accepted. Asking an agent to type them
 * again is not just slow, it is how the address on the pack ends up spelled
 * differently from the address on the certificate, and how a move-in date
 * that moved last week goes to compliance as the date it used to be.
 *
 * So the wizard opens by reading, and the agent's job on the first screen is
 * to CHECK rather than to fill in. That is a different task and a much faster
 * one.
 *
 * ── Where each field genuinely comes from ──────────────────────────────────
 *
 * The application, not the listing. A listing knows the property; only the
 * application knows who is moving in, and the tenant is half of what
 * compliance is checking. Starting from a listing therefore means finding the
 * application ON that listing first, which is what byListing does.
 *
 * `startDate` is REX's own field for the tenancy start, so it IS the move-in
 * date - until the let is in Propoly. From then the deal's move-in is the day
 * the agreement is drawn on, and the let page already shows it (Lianna
 * Denholm, 30 Oct 2026), so the pack opens on it too (Lianna, 3 Nov 2026, 12
 * South Chesters Lane: the let read 9 November, Propoly's, and the PLC check
 * opened on REX's 1 November, the tenant's first offer). The deal's date
 * already carries a move-in put right in the OS (lib/let-edits), so the
 * newest figure reaches the pack. Where neither has one the wizard asks,
 * rather than guessing from the date the offer was accepted.
 *
 * ── What it does NOT invent ────────────────────────────────────────────────
 *
 * A missing landlord name comes back as null and the screen says so. The
 * temptation is to fall back to the agent, or to the first contact on the
 * property, and both produce a confident wrong name on a compliance record.
 * An empty field an agent fills in is recoverable; a plausible wrong one is
 * not.
 */

export interface Prefill {
  applicationRef: string;
  applicationId: string;
  listingId: number | null;
  address: string;
  /** As printed on the offer, for the "does this match the certificate" check. */
  locality: string;
  tenants: { name: string; email: string | null; isPrimary: boolean }[];
  moveInDate: string | null;
  /**
   * The application's own move-in, where it differs from the deal's above.
   * The wizard sends it as what REX holds, so a pack date that differs from
   * REX's still goes back onto the REX application (lib/plc-move-in-rex).
   */
  applicationMoveIn?: string | null;
  agentName: string | null;
  rentPcm: number | null;
  /** Things the agent should look at, in the words they would use. */
  warnings: string[];
  /**
   * A first answer to "home or HMO?" (6 Oct 2026). True when the OS's own
   * property record says HMO, or the address is a room. The agent confirms it
   * on the first screen; it decides whether the HMO documents are needed.
   */
  hmo?: boolean;
  /** The landlord on the OS's property record, so the reader can tell their ID from a tenant's. */
  landlordName?: string | null;
  /** The REX property, so the pack can find the certificates already on file for the home. */
  propertyId?: string | null;
}

/** REX gives a date as a stamp, a string, or nothing. Only YYYY-MM-DD survives. */
function asYmd(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const ROOM = /\b(room|bedroom)\s*\d/i;

type Person = { name: string; email: string | null; phone: string | null; contactId: string | null; isPrimary: boolean };

/*
 * The tenants as the let shows them (Rhiannon and Lianna Denholm, 4 Nov
 * 2026): a name or email put right on the let over the application's or the
 * deal's copy, then anyone added to the let, so the pack names the people
 * the let does (lib/let-people tenantsAsOnLet). Unread, the copy as it was.
 */
function onLet(ref: string, people: Person[], source: "rex" | "propoly" = "rex"): Promise<Person[]> {
  return tenantsAsOnLet(ref, people, {
    source,
    added: (t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: null, isPrimary: false }),
  }).catch(() => people);
}

function shape(a: Application, facts?: { hmo: boolean; landlordName: string | null } | null, dealMoveIn?: string | null, people: Person[] = a.applicants): Prefill {
  const warnings: string[] = [];
  const applicationMoveIn = asYmd(a.startDate);
  const moveInDate = asYmd(dealMoveIn ?? null) ?? applicationMoveIn;

  if (!moveInDate) {
    warnings.push("No tenancy start date on the application, so you will need to add the move-in date.");
  }
  if (!people.length) {
    warnings.push("No applicants are recorded on this application.");
  }
  /* Already computed by lib/applications against every adult applicant, not
     just the primary - which is the gap the applications book exists to show.
     Surfacing it HERE means it is seen before the pack is assembled rather
     than after compliance sends it back. */
  if (a.rightToRentIncomplete) {
    warnings.push("Right to Rent is not recorded for every adult applicant. Compliance will ask.");
  }
  if (a.status !== "accepted" && a.status !== "communicated") {
    warnings.push(`This application is "${a.statusLabel}", not accepted. Check before you hand it over.`);
  }

  return {
    applicationRef: a.id,
    applicationId: a.id,
    listingId: a.listingId,
    address: a.property,
    locality: a.locality,
    tenants: people.map((p) => ({
      name: p.name,
      email: p.email,
      isPrimary: p.isPrimary,
    })),
    moveInDate,
    applicationMoveIn,
    agentName: a.agent,
    rentPcm: a.offerAmount,
    warnings,
    hmo: Boolean(facts?.hmo) || ROOM.test(a.property),
    landlordName: facts?.landlordName ?? null,
    propertyId: a.propertyId ? String(a.propertyId) : null,
  };
}

/** A Propoly deal's id, as the let page uses it for a home let through Propoly alone. */
const DEAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A let that only Propoly knows about (Joe Patten, 2 Nov 2026): 340 Four
 * Chimneys Crescent was agreed in REX's day and went straight into Propoly,
 * so REX has no application and the PLC check had nothing to start from.
 * The deal has everything the first screen asks for - the home, the tenants,
 * the move-in date, the rent and the landlords - and the OS's own property
 * record gives the REX property, so the certificates on file are found.
 */
async function shapeDeal(deal: BusinessDeal): Promise<Prefill> {
  const d = deal.app;
  const full = `${d.propertyName}, ${d.locality ?? ""}`;
  const [homes, facts] = await Promise.all([
    activeOsProperties().catch(() => []),
    factsByRexId().catch(() => new Map<string, { hmo: boolean; landlordName: string | null }>()),
  ]);
  const home = homes.find((h) => sameHome(full, h.address) || sameHome(full, `${h.name}, ${h.postcode ?? ""}`)) ?? null;
  const fact = home?.rexPropertyId ? facts.get(home.rexPropertyId) ?? null : null;
  const landlords = (d.propoly?.landlords ?? []).map((l) => (l.name ?? "").trim()).filter(Boolean);
  const moveInDate = asYmd(d.startDate);
  const people = await onLet(d.id, d.tenants.map((t) => ({ name: t.name, email: t.email ?? null, phone: t.phone ?? null, contactId: null, isPrimary: Boolean(t.isPrimary) })), "propoly");
  const warnings: string[] = [];
  if (!moveInDate) warnings.push("No move-in date on the Propoly deal, so you will need to add it.");
  if (!people.length) warnings.push("No tenants are on the Propoly deal yet.");
  return {
    applicationRef: d.id,
    applicationId: d.id,
    listingId: d.listingId != null ? Number(d.listingId) : null,
    address: d.propertyName,
    locality: d.locality ?? "",
    tenants: people.map((t) => ({ name: t.name, email: t.email, isPrimary: t.isPrimary })),
    moveInDate,
    agentName: deal.managerName,
    rentPcm: d.offer == null ? null : d.offerPeriod === "week" ? Math.round((d.offer * 52) / 12) : d.offer,
    warnings,
    hmo: Boolean(home?.hmo) || Boolean(fact?.hmo) || ROOM.test(d.propertyName),
    landlordName: fact?.landlordName ?? home?.landlordName ?? landlords[0] ?? null,
    propertyId: home?.rexPropertyId ?? null,
  };
}

/**
 * Find the application to hand over.
 *
 * By its id, the way the let page reads it (lib/applications
 * getApplicationById: the held book, else REX asked for that one, else the
 * newest 300). Until 4 Nov 2026 this picked from the newest 300 alone, so a
 * let the page could open had no PLC check once 300 newer applications
 * stood in front of it. From a listing, `getApplications` still pulls the
 * book and picks.
 */
export async function prefillFor(opts: {
  applicationId?: string;
  listingId?: string;
}): Promise<Prefill | null> {
  /* A test file's application (lib/test-overlay): never in REX's book, so it
     is read from the overlay - the PLC check is walked on it like any other. */
  if (opts.applicationId && isTestId(opts.applicationId)) {
    const t = await testApplication(opts.applicationId);
    if (!t) return null;
    const app = applyLead(t.app, await leadOverrides().catch(() => new Map<string, string>()));
    return shape(app, undefined, undefined, await onLet(String(app.id), app.applicants));
  }
  /* A Propoly deal's id is never an application's (DEAL_ID above): nothing to look up. */
  const appId = opts.applicationId && !DEAL_ID.test(opts.applicationId) ? String(opts.applicationId) : null;
  const [book, byId, facts] = await Promise.all([
    opts.applicationId ? Promise.resolve([] as Application[]) : getApplications(300),
    appId ? getApplicationById(appId) : Promise.resolve(null),
    factsByRexId().catch(() => new Map<string, { hmo: boolean; landlordName: string | null }>()),
  ]);
  const factsOf = (a: Application) => (a.propertyId ? facts.get(String(a.propertyId)) ?? null : null);
  /* The let's Propoly deal, found the way the let page finds it, for its move-in (see the top). */
  const dealMoveIn = (a: Application) =>
    dealForLet({ ref: String(a.id), app: a, propertyName: a.property, locality: a.locality, listingId: a.listingId != null ? String(a.listingId) : null })
      .then((d) => d?.moveIn ?? null)
      .catch(() => null);
  /* The deal's move-in and the let's own people, side by side. */
  const full = async (a: Application) => {
    const [moveIn, people] = await Promise.all([dealMoveIn(a), onLet(String(a.id), a.applicants)]);
    return shape(a, factsOf(a), moveIn, people);
  };

  if (opts.applicationId) {
    if (byId) return full(byId);
    if (!DEAL_ID.test(opts.applicationId)) return null;
    const deal = await findPropolyDeal(opts.applicationId);
    return deal ? shapeDeal(deal) : null;
  }

  if (opts.listingId) {
    const on = book.filter((a) => String(a.listingId ?? "") === String(opts.listingId));
    if (!on.length) return null;
    /* Newest first. A property that has been let before carries old
       applications, and the one being handed over is always the latest. */
    const latest = [...on].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    const shaped = await full(latest);
    if (on.length > 1) {
      shaped.warnings.push(
        `There are ${on.length} applications on this listing. This is the most recent one, so check it is the right one.`
      );
    }
    return shaped;
  }

  return null;
}
