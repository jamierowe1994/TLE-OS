import "server-only";
import { getApplicationById, type Application } from "@/lib/applications";
import { isTestId, testApplication } from "@/lib/test-overlay";
import { testLandlord } from "@/lib/test-listing-answers";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { landlordForListing, type Landlord } from "@/lib/rex-landlord";
import type { OsUser } from "@/lib/users";
import { applyLead, leadOverrides } from "@/lib/lead-tenant";

/**
 * Who is on a let, read on the server from the let itself - never from the
 * page (12 Oct 2026). The let's page id is an application's (REX's, the OS's
 * own os:/swap: offer, or a test one), or a Propoly deal's for a home let
 * through Propoly alone. Everything that writes to or about these people -
 * the customer update, the conversation, the cancellation - starts here, so
 * it can only ever reach the people actually on the let.
 */

export type LetPerson = { name: string; email: string | null; phone: string | null; contactId: string | null; isPrimary: boolean };

export type LetPeople = {
  ref: string;
  kind: "application" | "deal";
  property: string;
  locality: string;
  listingId: string | null;
  dealId: string | null;
  agentName: string | null;
  moveIn: string | null;
  tenants: LetPerson[];
  /** null: none held. `problem`: the listings system didn't answer. */
  landlord: Landlord | null;
  landlordProblem: string | null;
};

export type LetAnswer = { ok: true; let: LetPeople; app: Application | null } | { ok: false; status: number; error: string };

const sameName = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export async function letPeople(ref: string, me: OsUser): Promise<LetAnswer> {
  let app: Application | null = null;
  if (isTestId(ref)) app = (await testApplication(ref).catch(() => null))?.app ?? null;
  else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref)) app = await getApplicationById(ref).catch(() => null);
  if (app) applyLead(app, await leadOverrides().catch(() => new Map<string, string>()));

  if (app) {
    /* An agent reads their own lets, as the journey route does. */
    if (me.role === "agent" && app.agent && !sameName(app.agent, me.name)) {
      return { ok: false, status: 403, error: `That let is ${app.agent.split(/\s+/)[0]}'s.` };
    }
    const listingId = app.listingId != null ? String(app.listingId) : null;
    /* A test let's landlord is its test listing's (James, 13 Oct 2026, the
       E2E walk): REX was asked about a negative id and said nothing, so the
       file read "Not held on the listing" over Landlord E2E. */
    const ll = !listingId
      ? null
      : isTestId(listingId)
        ? await testLandlord(Number(listingId)).catch(() => null)
        : await landlordForListing(listingId).catch(() => null);
    return {
      ok: true,
      app,
      let: {
        ref,
        kind: "application",
        property: app.property,
        locality: app.locality,
        listingId,
        dealId: null,
        agentName: app.agent,
        moveIn: app.startDate,
        tenants: app.applicants.map((p) => ({ name: p.name, email: p.email, phone: p.phone, contactId: p.contactId, isPrimary: p.isPrimary })),
        landlord: ll && ll.ok ? ll.landlord : null,
        landlordProblem: !listingId ? "This let isn't linked to a listing, so its landlord can't be looked up." : ll && !ll.ok ? ll.problem : null,
      },
    };
  }

  const deals = await getAllPropolyDeals().catch(() => null);
  const d = deals?.find((x) => x.app.id === ref) ?? null;
  if (!d) return { ok: false, status: 404, error: "That let isn't here any more." };
  if (me.role === "agent" && d.managerName && !sameName(d.managerName.split(/\s+/)[0], (me.name ?? "").split(/\s+/)[0])) {
    return { ok: false, status: 403, error: `That let is ${d.managerName.split(/\s+/)[0]}'s.` };
  }
  const listingId = d.app.listingId ?? null;
  const ll = listingId ? await landlordForListing(listingId).catch(() => null) : null;
  return {
    ok: true,
    app: null,
    let: {
      ref,
      kind: "deal",
      property: d.app.propertyName,
      locality: d.app.locality,
      listingId,
      dealId: d.app.id,
      agentName: d.managerName,
      moveIn: d.app.startDate,
      tenants: d.app.tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: null, isPrimary: t.isPrimary })),
      landlord: ll && ll.ok ? ll.landlord : null,
      landlordProblem: !listingId ? "Propoly's deal isn't linked to a listing, so the landlord can't be looked up here." : ll && !ll.ok ? ll.problem : null,
    },
  };
}
