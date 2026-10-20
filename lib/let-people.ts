import "server-only";
import { getApplicationById, type Application } from "@/lib/applications";
import { isTestId, testApplication } from "@/lib/test-overlay";
import { testLandlord } from "@/lib/test-listing-answers";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { landlordForListing, type Landlord } from "@/lib/rex-landlord";
import type { OsUser } from "@/lib/users";
import { applyLead, leadOverrides } from "@/lib/lead-tenant";
import { recordLandlordFor } from "@/lib/record-landlords";
import { listingRead } from "@/lib/listing-details";
import { letLandlords, personEdits, type PersonEdit } from "@/lib/let-landlords";
import { letTenants } from "@/lib/let-tenants";
import { dealForLet, type LetDeal } from "@/lib/let-deal";

/**
 * Who is on a let, read on the server from the let itself - never from the
 * page (12 Oct 2026). The let's page id is an application's (REX's, the OS's
 * own os:/swap: offer, or a test one), or a Propoly deal's for a home let
 * through Propoly alone. Everything that writes to or about these people -
 * the customer update, the conversation, the cancellation - starts here, so
 * it can only ever reach the people actually on the let.
 */

export type LetPerson = { name: string; email: string | null; phone: string | null; contactId: string | null; isPrimary: boolean };

/**
 * Where a person on the let comes from, and so how they are changed
 * (20 Oct 2026, James: "no easy way to open the landlord's or the tenants'
 * details and change anything"):
 *   rex      - a REX contact: edits go to REX through /api/people/contact
 *   added    - added on the let in the OS (lib/let-tenants, lib/let-landlords)
 *   propoly  - only Propoly holds them (a let opened as its deal): edits are
 *              kept in the OS over Propoly's copy (lib/let-landlords)
 *   record   - the home's OS record, changed on the home's page
 *   changed  - a landlord changed in the OS (lib/landlord-change)
 */
export type PersonSource = "rex" | "added" | "propoly" | "record" | "changed";

export type LetParty = LetPerson & {
  /** Stable on the let: "rex:<id>", "let-landlord:<id>", "let-tenant:<id>", "propoly:landlord:<uuid|email>"… */
  key: string;
  role: "tenant" | "landlord";
  source: PersonSource;
  /** The landlord's own home, where held. */
  address: string | null;
  /** Tenants added on the let: referenced or not. */
  reference?: boolean;
};

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
  /** Everyone, with how each is changed (20 Oct 2026). `landlord` above is landlords[0]. */
  people: LetParty[];
  /** The let's Propoly deal, from the saved copy of the book (no call of its own). */
  deal: LetDeal | null;
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
    /* A tenant swap on a REX PM home has no listing to ask (16 Oct 2026):
       its landlord is the one the OS record holds for the home. Shown as a
       record landlord - nobody in REX behind it. */
    const swapLandlord = !listingId && app.swap?.rexPropertyId ? await recordLandlordFor(app.swap.rexPropertyId).catch(() => null) : null;
    const landlord: Landlord | null = swapLandlord
      ? { contactId: null, name: swapLandlord.name, email: swapLandlord.email, phone: swapLandlord.phone, from: "record" }
      : ll && ll.ok ? ll.landlord : null;
    /* Every owner on the listing, not only the first (20 Oct 2026): the
       handover already sends them all to Propoly. Off the same cached read. */
    const coOwners = listingId && !isTestId(listingId) && landlord?.from !== "os" ? await otherOwners(listingId, landlord?.contactId ?? null) : [];
    const deal = await dealForLet({ ref, app, propertyName: app.property, locality: app.locality, listingId }).catch(() => null);
    const base: Omit<LetPeople, "people" | "deal"> = {
      ref,
      kind: "application",
      property: app.property,
      locality: app.locality,
      listingId,
      dealId: null,
      agentName: app.agent,
      moveIn: app.startDate,
      tenants: app.applicants.map((p) => ({ name: p.name, email: p.email, phone: p.phone, contactId: p.contactId, isPrimary: p.isPrimary })),
      landlord,
      landlordProblem: swapLandlord
        ? null
        : !listingId
          ? app.swap
            ? "No landlord is held for this home yet. Add them on the home's page with Change landlord."
            : "This let isn't linked to a listing, so its landlord can't be looked up."
          : ll && !ll.ok ? ll.problem : null,
    };
    const held: LetParty[] = [
      ...base.tenants.map((t, i) => tenantParty(t, i, "rex")),
      ...(landlord ? [landlordParty(landlord)] : []),
      ...coOwners,
    ];
    return { ok: true, app, let: await withPeople(base, held, deal) };
  }

  const deals = await getAllPropolyDeals().catch(() => null);
  const d = deals?.find((x) => x.app.id === ref) ?? null;
  if (!d) return { ok: false, status: 404, error: "That let isn't here any more." };
  if (me.role === "agent" && d.managerName && !sameName(d.managerName.split(/\s+/)[0], (me.name ?? "").split(/\s+/)[0])) {
    return { ok: false, status: 403, error: `That let is ${d.managerName.split(/\s+/)[0]}'s.` };
  }
  const listingId = d.app.listingId ?? null;
  const ll = listingId ? await landlordForListing(listingId).catch(() => null) : null;
  /* A let opened as its Propoly deal names the landlords the deal holds
     (20 Oct 2026). Before, it only ever asked a listing - and a deal keyed
     in Propoly carries no listing number, so Apartment 30, 21 Wheatsheaf
     Court said "no landlord" while Propoly and REX both had Kieron Malloy. */
  const fromDeal = dealLandlords(d.app.propoly);
  const listed = ll && ll.ok ? ll.landlord : null;
  const landlord: Landlord | null = listed ?? (fromDeal[0] ? { contactId: null, name: fromDeal[0].name ?? "", email: fromDeal[0].email, phone: fromDeal[0].phone } : null);
  const deal = await dealForLet({ ref, app: null, propertyName: d.app.propertyName, locality: d.app.locality, listingId }).catch(() => null);
  const base: Omit<LetPeople, "people" | "deal"> = {
    ref,
    kind: "deal",
    property: d.app.propertyName,
    locality: d.app.locality,
    listingId,
    dealId: d.app.id,
    agentName: d.managerName,
    moveIn: d.app.startDate,
    tenants: d.app.tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: null, isPrimary: t.isPrimary })),
    landlord,
    landlordProblem: landlord ? null : !listingId ? "Propoly's deal names no landlord, and it isn't linked to a listing to look one up." : ll && !ll.ok ? ll.problem : null,
  };
  const held: LetParty[] = [
    ...base.tenants.map((t, i) => tenantParty(t, i, "propoly")),
    ...(listed
      ? [landlordParty(listed)]
      : fromDeal.map((l, i) => ({
          key: `propoly:landlord:${(l.uuid ?? l.email ?? l.name ?? String(i)).toLowerCase()}`,
          role: "landlord" as const,
          source: "propoly" as const,
          name: l.name ?? "Unnamed landlord",
          email: l.email,
          phone: l.phone,
          contactId: null,
          isPrimary: i === 0,
          address: null,
        }))),
  ];
  return { ok: true, app: null, let: await withPeople(base, held, deal) };
}

type DealLandlord = { uuid: string | null; name: string | null; email: string | null; phone: string | null };

/** The deal's landlords: every one where the saved copy has them, else the lead. */
function dealLandlords(p: { landlords?: DealLandlord[]; landlord?: { name: string | null; email: string | null; phone: string | null } | null; landlordUuids?: string[] } | null | undefined): DealLandlord[] {
  if (p?.landlords?.length) return p.landlords;
  return p?.landlord ? [{ uuid: p.landlordUuids?.[0] ?? null, ...p.landlord }] : [];
}

function tenantParty(t: LetPerson, i: number, source: "rex" | "propoly"): LetParty {
  const key = source === "rex" && t.contactId && /^\d+$/.test(t.contactId)
    ? `rex:${t.contactId}`
    : `${source === "rex" ? "app" : "propoly"}:tenant:${(t.email ?? t.name ?? String(i)).trim().toLowerCase()}`;
  /* An applicant without a REX contact (an OS offer, a swap) can't be written
     to REX, so it is changed in the OS the way somebody only Propoly holds is. */
  return { ...t, key, role: "tenant", source: key.startsWith("rex:") ? "rex" : "propoly", address: null };
}

function landlordParty(l: Landlord): LetParty {
  const source: PersonSource = l.from === "record" ? "record" : l.from === "os" ? "changed" : l.contactId ? "rex" : "propoly";
  const key = source === "rex" ? `rex:${l.contactId}` : `${source}:landlord:${(l.email ?? l.name).trim().toLowerCase()}`;
  return { key, role: "landlord", source, name: l.name, email: l.email, phone: l.phone, contactId: l.contactId, isPrimary: true, address: null };
}

/** The other owners on a listing, after the one landlordForListing names. */
async function otherOwners(listingId: string, firstId: string | null): Promise<LetParty[]> {
  const id = Number(listingId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const res = await listingRead(id, "Listings", "read", { id }).catch(() => null);
  if (!res?.ok) return [];
  type Row = Record<string, unknown>;
  const relns = ((((res.result ?? {}) as Row).related as Row | undefined)?.contact_reln_listing ?? []) as Row[];
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const seen = new Set<string>(firstId ? [firstId] : []);
  const out: LetParty[] = [];
  for (const r of Array.isArray(relns) ? relns : []) {
    if (s((r?.reln_type as Row | null)?.id) !== "owner") continue;
    const c = (r.contact ?? null) as Row | null;
    const cid = s(c?.id);
    const name = s(c?.name);
    if (!c || !cid || !name || seen.has(cid)) continue;
    seen.add(cid);
    out.push({ key: `rex:${cid}`, role: "landlord", source: "rex", name, email: s(c.email_address), phone: s(c.phone_number), contactId: cid, isPrimary: false, address: null });
  }
  return out;
}

/** Adds the people kept on the let in the OS, and the OS's edits over Propoly's copy. */
async function withPeople(base: Omit<LetPeople, "people" | "deal">, held: LetParty[], deal: LetDeal | null): Promise<LetPeople> {
  const [edits, addedLandlords, addedTenants] = await Promise.all([
    personEdits(base.ref).catch(() => new Map<string, PersonEdit>()),
    letLandlords(base.ref).catch(() => []),
    letTenants(base.ref).catch(() => []),
  ]);
  const over = (p: LetParty): LetParty => {
    const e = edits.get(p.key);
    if (!e) return p;
    /* null = not changed here; "" = cleared here. */
    const pick = (mine: string | null, theirs: string | null) => (mine === null ? theirs : mine || null);
    return { ...p, name: e.name || p.name, email: pick(e.email, p.email), phone: pick(e.phone, p.phone), address: pick(e.address, p.address) };
  };
  /* Somebody added here who has since reached the deal shows once, as the
     person added here (changeable, removable), not again as Propoly's copy. */
  const addedEmails = new Set([...addedTenants, ...addedLandlords].map((x) => (x.email ?? "").trim().toLowerCase()).filter(Boolean));
  const people: LetParty[] = [
    ...held.filter((p) => !(p.source === "propoly" && p.email && addedEmails.has(p.email.trim().toLowerCase()))).map(over),
    ...addedTenants.map((t) => ({ key: `let-tenant:${t.id}`, role: "tenant" as const, source: "added" as const, name: t.name, email: t.email, phone: t.phone, contactId: null, isPrimary: false, address: null, reference: t.reference })),
    ...addedLandlords.map((l) => ({ key: `let-landlord:${l.id}`, role: "landlord" as const, source: "added" as const, name: l.name, email: l.email, phone: l.phone, contactId: null, isPrimary: false, address: l.address })),
  ];
  /* With nobody else held, the first landlord added on the let IS the
     let's landlord: the customer update and the conversation write to them. */
  const firstLandlord = people.find((p) => p.role === "landlord");
  const landlord: Landlord | null = base.landlord ?? (firstLandlord ? { contactId: null, name: firstLandlord.name, email: firstLandlord.email, phone: firstLandlord.phone, from: "os" } : null);
  return {
    ...base,
    /* Tenants edited in the OS read as edited everywhere the let is written from. */
    tenants: base.tenants.map((t, i) => {
      const p = people.filter((x) => x.role === "tenant")[i];
      return p ? { ...t, name: p.name, email: p.email, phone: p.phone } : t;
    }),
    landlord,
    landlordProblem: landlord ? null : base.landlordProblem,
    people,
    deal,
  };
}
