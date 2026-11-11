import "server-only";
import { rexCall } from "@/lib/rex";
import { hasDb, q } from "@/lib/db";
import { getApplications, type Application } from "@/lib/applications";
import { isJointOwner, landlordsForListing, type LandlordFrom } from "@/lib/landlords-for-home";
import { tenantsAsOnLet, type EditedPart } from "@/lib/let-people";

/**
 * Offer accepted → the deal, and everything it needs to carry.
 *
 * Howard already automates this. `TLE: Application Accepted` creates the
 * Propoly landlord, property and relationship, updates the REX listing, sets
 * custom fields and mail-merges both parties. There is no case for rebuilding
 * any of it — the flow has a MANUAL HTTP TRIGGER, so the right move is to call
 * it. See [[howard-power-automate-flows]].
 *
 * What the OS adds is the half the flow can't do: assembling the packet and
 * saying, out loud and before anybody presses anything, what is missing from
 * it. A deal that reaches Kirstie without a gas certificate is a deal that
 * stalls at PLC three weeks later, and by then nobody remembers who was
 * chasing what.
 *
 * ── WHAT THE LIVE BOOK ACTUALLY HOLDS (measured 21 Aug 2026, 25 accepted) ──
 *
 * The landlord is on the listing as a `contact_reln_listing` of type `owner`.
 * Present on 21 of 25 — so four accepted deals have no landlord attached to
 * the property they were let on, and the handoff has to say so rather than
 * send an empty field.
 *
 * THE CERTIFICATES ARE NOT WHERE THEY LOOK LIKE THEY ARE. `listing_documents`
 * holds uploads — 18 of 25 listings had any, and almost every one was a
 * `DocuSign_Document_rexXXXXXX.pdf`, the signed terms of business. Counting
 * gas and EICR from there gives 0 of 40 and 0 of 40, which is flatly wrong:
 * the certificates live in `ComplianceEntries`, keyed on the PROPERTY id
 * rather than the listing, with structured expiry dates and `file.url` for the
 * scan. Across 18 accepted properties: 16 EPC, 7 EICR, 6 gas, plus PAT,
 * legionella and three flavours of HMO licence — 71 entries, 46 with a file.
 *
 * That distinction is the whole reason this reads two sources. A panel that
 * told Kirstie "gas safety missing" on a property with a valid certificate on
 * file would be wrong in the direction that costs the most trust.
 *
 * Expiry matters as much as presence. A gas certificate that lapses before the
 * move-in date is not a certificate, so the check is against the START DATE,
 * not today.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/* ── documents ────────────────────────────────────────────────────────────── */

/**
 * The paper a let cannot happen without, and where each piece actually lives.
 *
 * `blocks: true` means a tenancy should not start without it. The HMO licence
 * is not on that list because we cannot tell from here whether the property
 * needs one — flagging every flat for a missing HMO licence would train people
 * to ignore the panel.
 */
const REQUIRED = [
  { id: "epc", label: "EPC", rexType: "epc", blocks: true },
  { id: "gas", label: "Gas safety", rexType: "gas_safety", blocks: true },
  { id: "eicr", label: "EICR", rexType: "eicr", blocks: true },
] as const;

/** Extra certificates worth showing when present. Never blockers. */
const ALSO: Record<string, string> = {
  portable_appliance_testing: "PAT test",
  legionella_risk_assessment: "Legionella assessment",
  mandatory_hmo_license: "HMO licence (mandatory)",
  additional_hmo_license: "HMO licence (additional)",
  selective_hmo_license: "HMO licence (selective)",
  emergency_lighting_fire_exit: "Emergency lighting",
  smoke_alarms: "Smoke alarms",
  co_alarms: "CO alarms",
  terms_of_business: "Terms of business",
  oil_safety: "Oil safety",
};

export type DocKind = string;

export interface HandoffDoc {
  id: number;
  name: string;
  kind: DocKind | null;
  sizeMb: number;
  uploadedBy: string | null;
}

/** A certificate as REX holds it: type, expiry, and whether the scan is there. */
export interface Certificate {
  type: string;
  label: string;
  expiry: string | null;
  attached: boolean;
  /** Valid on the day they move in — which is the only day that matters. */
  validAtStart: boolean;
  /** A tenancy shouldn't start without it. Terms of business and the HMO
   *  licences are not required here — one has no expiry to fail, the other we
   *  can't tell applies. Marking them lets the panel stop calling a signed
   *  terms of business "not valid" for having no expiry date. */
  required: boolean;
}

/** Uploads on the listing. Only the signed terms are reliably recognisable. */
const UPLOAD_KINDS: { id: string; label: string; re: RegExp }[] = [
  { id: "terms", label: "Terms of business", re: /docusign|signed.?tob|terms.?of.?business|\btob\b/i },
  { id: "id", label: "Landlord ID & ownership", re: /\bll id\b|landlord.?id|title.?(plan|register)|companies.?house/i },
];

function classify(name: string): DocKind | null {
  return UPLOAD_KINDS.find((k) => k.re.test(name))?.id ?? null;
}

/**
 * The certificates on a PROPERTY.
 *
 * A renewed certificate leaves the old entry in place, so the latest expiry
 * per type wins — otherwise a property with a fresh gas certificate reads as
 * expired because last year's entry sorted first.
 */
async function certificatesFor(
  propertyId: string,
  startDate: string | null
): Promise<Certificate[]> {
  const res = await rexCall("ComplianceEntries", "search", {
    criteria: [{ name: "parent_object_id", type: "in", value: [propertyId] }],
    limit: 100,
  });
  if (!res.ok) return [];
  const rows = ((res.result as { rows?: unknown[] })?.rows ?? res.result ?? []) as Row[];
  const when = startDate ? new Date(startDate) : new Date();

  const best = new Map<string, Certificate>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const type = str(r.type_id);
    if (!type) continue;
    const detail = ((r.details as Row | null)?.[type] ?? {}) as Row;
    const expiry = str(detail.expiry_date);
    const need = REQUIRED.find((x) => x.rexType === type);
    const cert: Certificate = {
      type,
      label: need?.label ?? ALSO[type] ?? type,
      expiry,
      attached: Boolean((r.file as Row | null)?.url),
      // No expiry on a required certificate is a failure, not a pass — an
      // undated gas safety record is not evidence of a gas safety check.
      validAtStart: expiry ? new Date(expiry) >= when : !need,
      required: Boolean(need),
    };
    const held = best.get(type);
    if (!held || (cert.expiry && (!held.expiry || cert.expiry > held.expiry))) {
      best.set(type, cert);
    }
  }
  /* The OS's own copy counts as attached (29 Oct 2026). 68 Main Street's EPC
     is in the OS vault, checked, and the document push sends it from there,
     yet REX's entry holds the dates with no file, so the push said "Recorded,
     but the certificate itself isn't attached". A certificate only the OS
     holds is on file too. Never one still waiting for compliance's check. */
  if (hasDb()) {
    const ours = await q<{ type_id: string; expiry: string | null }>(
      `SELECT type_id, expiry::text AS expiry FROM os_certificates WHERE property_id = $1 AND r2_key IS NOT NULL AND NOT awaiting_check`,
      [propertyId]
    ).catch(() => []);
    for (const o of ours) {
      const expiry = (o.expiry ?? "").slice(0, 10) || null;
      const held = best.get(o.type_id);
      if (held && !held.attached && (!expiry || !held.expiry || expiry >= held.expiry)) {
        best.set(o.type_id, { ...held, attached: true });
      } else if (!held) {
        const need = REQUIRED.find((x) => x.rexType === o.type_id);
        best.set(o.type_id, {
          type: o.type_id,
          label: need?.label ?? ALSO[o.type_id] ?? o.type_id,
          expiry,
          attached: true,
          validAtStart: expiry ? new Date(expiry) >= when : !need,
          required: Boolean(need),
        });
      }
    }
  }
  return [...best.values()];
}

/* ── the packet ───────────────────────────────────────────────────────────── */

export interface HandoffParty {
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

export type OtherLandlord = HandoffParty & { joint: boolean };

export interface Handoff {
  applicationId: string;
  listingId: number | null;
  property: string;
  locality: string;
  landlord: HandoffParty | null;
  /** Where the landlord was found (see landlordsForListing), and that in the agent's words. */
  landlordFrom?: LandlordFrom | null;
  landlordNote?: string | null;
  /**
   * Every other landlord the push sends: the listing's other owners, then the
   * home's joint landlords (`joint`). One with no mobile is not sent, and
   * never holds up the rest (Propoly refuses a landlord without one).
   */
  otherLandlords?: OtherLandlord[];
  /** `reference: false` - already a tenant, on the deal but not referenced (a tenant swap).
   *  `editedOnLet` - details put right on the let, over the application's (lib/let-people). */
  tenants: (HandoffParty & { isPrimary: boolean; reference?: boolean; rentSharePcm?: number | null; editedOnLet?: EditedPart[] })[];
  /** A tenant swap (lib/tenant-swaps): the push starts a NEW deal rather than
   *  joining the one the home already has, on a home Propoly already holds
   *  with its landlord. */
  swap?: boolean;
  /** The swap's home when it has no REX listing (see Application.swap.home). */
  swapHome?: { line1: string; postcode: string; agentEmail: string | null; managed: boolean } | null;
  /**
   * Let only on the listing (REX's let_only, Propoly's tenant find). The
   * certificates are the landlord's to keep in date (Michael's rule, 7 Sep
   * 2026), so `missing` is theirs to supply, not ours to book - but the PLC
   * check still needs a copy of each before the tenancy starts.
   */
  letOnly?: boolean;
  rentPcm: number | null;
  startDate: string | null;
  agreementMonths: number | null;
  acceptedOn: string | null;
  agent: string | null;
  /** Uploads on the LISTING — signed terms, landlord ID, scans. */
  documents: HandoffDoc[];
  /** Certificates on the PROPERTY, from REX's compliance register. */
  certificates: Certificate[];
  /** Required certificates that are absent, or expire before move-in. */
  missing: { id: string; label: string; why: string }[];
  /** Documents on the listing we couldn't put a name to. */
  unrecognised: string[];
  /** Everything that would make this handoff incomplete, in plain words. */
  blockers: string[];
  /** Can this actually be sent, or is the flow not wired up? */
  flowConfigured: boolean;
}

/* ── the landlord ─────────────────────────────────────────────────────────── */

/*
 * WHERE THE LANDLORD IS FOUND lives in lib/landlords-for-home since 10 Nov
 * 2026: the reader the push always had is now the one every screen and email
 * asks, so the panel the agent checks, the listing, the let and the push all
 * name the same landlords. lib/deal-handoff (the packet and its blockers) and
 * lib/handover (the push) ask it with the listing they have just read, so
 * nothing held stands between the push and REX.
 */
export { isJointOwner, landlordsForListing, type LandlordFrom, type LandlordsFound } from "@/lib/landlords-for-home";

const idOf = (v: unknown): string | null => (v == null || v === "" ? null : String(v).trim() || null);

/** The landlord, the listing's uploads and its service. */
async function landlordOf(listingId: number, swap: boolean): Promise<{ landlord: HandoffParty | null; others: OtherLandlord[]; from: LandlordFrom | null; note: string | null; docs: HandoffDoc[]; letOnly: boolean }> {
  const res = await rexCall("Listings", "read", { id: listingId });
  if (!res.ok) return { landlord: null, others: [], from: null, note: null, docs: [], letOnly: false };
  const l = (res.result ?? {}) as Row;
  const service = l.lettings_service_type as Row | string | null | undefined;
  const serviceId = (typeof service === "string" ? service : str(service?.id) ?? str(service?.text) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const related = (l.related ?? {}) as Row;

  const { owners, from, note } = await landlordsForListing(l, { listingId, swap });
  const c = owners[0] ?? null;
  const party = (o: Row): HandoffParty => ({ contactId: idOf(o.id), name: str(o.name) ?? "Name not recorded", email: str(o.email_address), phone: str(o.phone_number) });

  const docs = ((related.listing_documents ?? []) as Row[])
    .filter((d) => str(d.uri))
    .map((d) => {
      const name = str(d.description) ?? "Document";
      return {
        id: Number(d.id ?? 0),
        name,
        kind: classify(name),
        sizeMb: Number(d.system_size_mb ?? 0),
        uploadedBy: str((d.system_created_user as Row | null)?.name),
      };
    });

  return {
    from,
    note,
    landlord: c ? party(c) : null,
    others: owners.slice(1).map((o) => ({ ...party(o), joint: isJointOwner(o) })),
    docs,
    letOnly: /^(let_only|tenant_find)$/.test(serviceId),
  };
}

/** Is the Power Automate flow reachable? Its URL carries a SAS signature and
 *  is only obtainable from the flow's own trigger card — not the export. */
export function handoffFlowConfigured(): boolean {
  return Boolean((process.env.POWER_AUTOMATE_ACCEPTED_URL ?? "").trim());
}

/* Each tenant's name, email and mobile as put right on the let, over the
   application's (Rhiannon and Lianna Denholm, 4 Nov 2026, lib/let-people
   tenantsAsOnLet): a tenant's corrected email was on the let but the push
   sent REX's. Who is referenced and who pays what is still worked out from
   the names on the swap itself, before. */
function tenantsAsOnLetFor(application: Application) {
  /* Referenced: whoever joins, and anyone staying who is referenced again
     (Add someone / Re-reference, 19 Oct 2026). */
  const joining = new Set([...(application.swap?.joining ?? []), ...(application.swap?.rereference ?? [])]);
  return tenantsAsOnLet(String(application.id), application.applicants.map((a) => ({
    contactId: a.contactId,
    name: a.name,
    email: a.email,
    phone: a.phone,
    isPrimary: a.isPrimary,
    ...(application.swap ? { reference: joining.has(a.name) } : {}),
    /* The newcomer's rent portion goes onto them in Propoly as their rent
       share (rent_share_pcm_pence, proven on the test home 13 Oct 2026). */
    ...(application.swap && (application.swap.joining ?? []).includes(a.name) && application.swap.rentPortion ? { rentSharePcm: application.swap.rentPortion } : {}),
  })));
}

export async function buildHandoff(application: Application): Promise<Handoff> {
  const listingId = application.listingId;
  /* The landlord, the certificates and the tenants as on the let are asked
     side by side (9 Nov 2026): they were read one after another, and the
     packet is what Applications and a let's page wait on. */
  const tenantsP = tenantsAsOnLetFor(application);
  tenantsP.catch(() => null);
  const [{ landlord, others: otherLandlords, from: landlordFrom, note: landlordNote, docs, letOnly }, certificates] = await Promise.all([
    listingId
      ? landlordOf(listingId, Boolean(application.swap))
      : Promise.resolve({ landlord: null, others: [] as OtherLandlord[], from: null, note: null, docs: [] as HandoffDoc[], letOnly: false }),
    application.propertyId ? certificatesFor(application.propertyId, application.startDate) : Promise.resolve([] as Awaited<ReturnType<typeof certificatesFor>>),
  ]);

  // Absent is one problem; lapsing before they move in is a different one, and
  // saying which is the difference between "chase the landlord" and "book the
  // engineer".
  const missing = REQUIRED.flatMap((need) => {
    const held = certificates.find((c) => c.type === need.rexType);
    if (!held) return [{ id: need.id, label: need.label, why: "Nothing on file." }];
    if (!held.validAtStart) {
      return [
        {
          id: need.id,
          label: need.label,
          why: held.expiry
            ? `Expires ${held.expiry}, before they move in.`
            : "No expiry date recorded, so it can't be relied on.",
        },
      ];
    }
    if (!held.attached) {
      return [{ id: need.id, label: need.label, why: "Recorded, but the certificate itself isn't attached." }];
    }
    return [];
  });

  const unrecognised = docs.filter((d) => !d.kind).map((d) => d.name);

  /* Referenced: whoever joins, and anyone staying who is referenced again
     (Add someone / Re-reference, 19 Oct 2026). */
  const joining = new Set([...(application.swap?.joining ?? []), ...(application.swap?.rereference ?? [])]);
  /* Each tenant's name, email and mobile as put right on the let, over the
     application's (Rhiannon and Lianna Denholm, 4 Nov 2026, lib/let-people
     tenantsAsOnLet): a tenant's corrected email was on the let but the
     push sent REX's. Who is referenced and who pays what is still worked out
     from the names on the swap itself, before. */
  const tenants = await tenantsP;

  const blockers: string[] = [];
  /* A swap is on a home Propoly already has, landlord and all; a REX PM home
     has no REX listing to read one from. */
  const swap = Boolean(application.swap);
  if (!listingId && !swap) blockers.push("No listing on the application.");
  if (swap && !listingId && !application.swap?.home.postcode) blockers.push("No postcode for this home, so it can't be found in Propoly.");
  if (swap) {
    /* nothing about the landlord: Propoly holds them on the home */
  } else if (!landlord) {
    blockers.push(
      "No landlord on the listing or the home, so there is nobody to set up in Propoly. Add the landlord on the listing."
    );
  } else if (!landlord.email) {
    blockers.push(`${landlord.name} has no email address, so they can't be told.`);
  } else if (/@(thelettingexperts|theexpertsgroup)\.co\.uk$/i.test(landlord.email)) {
    // Measured on 4 of 40 accepted deals. The mail-merge dutifully sends the
    // "your property is let" email to a colleague, and the landlord hears
    // nothing — a silent failure, which is the worst kind.
    blockers.push(
      `${landlord.name}'s email is a TLE staff address (${landlord.email}), so the landlord's email would come to us, not them.`
    );
  }
  if (!tenants.length) blockers.push("No applicants on the application.");
  /* A swap's staying tenants are already tenants: one with no email is added
     to the deal in Propoly by hand, it doesn't stop the newcomer's push. */
  const mustHaveEmail = tenants.filter((t) => t.reference !== false);
  if (mustHaveEmail.some((t) => !t.email)) {
    blockers.push(
      `${mustHaveEmail.filter((t) => !t.email).map((t) => t.name).join(", ")} has no email address.`
    );
  }
  /* One email each (29 Oct 2026, 10 Thornton Road): Chloe McGovern's offer
     part carried Bailey Cookson's email, and Propoly refuses a second tenant
     on an email the deal already has ("Failed to add tenant"). */
  const firstWith = new Map<string, string>();
  for (const t of tenants) {
    const e = (t.email ?? "").trim().toLowerCase();
    if (!e) continue;
    const first = firstWith.get(e);
    if (first) blockers.push(`${t.name} has the same email as ${first} (${e}). Propoly needs each tenant's own email address.`);
    else firstWith.set(e, t.name);
  }
  if (!application.startDate) blockers.push("No move-in date agreed.");
  if (!application.offerAmount) blockers.push("No agreed rent on the application.");
  /* Right to rent no longer stops the push to Propoly (9 Oct 2026). The push
     comes BEFORE the holding fee and referencing (James: handover, deal
     started, holding fee), and the check belongs before the tenancy, not
     before the deal exists. It stays on the file as the agent's job
     ("Record right to rent"), and on the PLC check. */
  /* Missing certificates no longer stop the push to Propoly (9 Oct 2026).
     The push only puts the landlord and the home in Propoly so the deal can
     start and the holding fee be taken; holding that up for a gas
     certificate risks the tenant. They stay on the file as the landlord's
     jobs (`missing`), and the PLC check is where they are enforced. */

  return {
    applicationId: application.id,
    listingId,
    property: application.property,
    locality: application.locality,
    landlord,
    landlordFrom,
    landlordNote,
    ...(otherLandlords.length ? { otherLandlords } : {}),
    tenants,
    letOnly,
    rentPcm: application.offerAmount,
    startDate: application.startDate,
    agreementMonths: application.agreementMonths,
    acceptedOn: application.dateAccepted,
    agent: application.agent,
    ...(application.swap ? { swap: true, swapHome: application.swap.home } : {}),
    documents: docs,
    certificates,
    missing,
    unrecognised,
    blockers,
    flowConfigured: handoffFlowConfigured(),
  };
}

/** Find one application and build its packet. */
export async function handoffFor(applicationId: string): Promise<Handoff | null> {
  // TenancyApplications has no searchable id criterion that behaves, so the
  // book is pulled and matched — it is one cached-free call either way.
  const apps = await getApplications(200);
  const app = apps.find((a) => a.id === applicationId);
  if (!app) return null;
  /* Tenants added to the let in the OS (lib/let-tenants, 19 Oct 2026) go
     onto its push only once tenant_changes_live is on. Asked alongside the
     packet (9 Nov 2026). */
  const addedP = import("@/lib/let-tenants").then(({ addedTenantsForPush }) => addedTenantsForPush(applicationId)).catch(() => []);
  const [packet, added] = await Promise.all([buildHandoff(app), addedP]);
  const known = new Set(packet.tenants.map((t) => (t.email ?? t.name).trim().toLowerCase()));
  const extra = added.filter((t) => !known.has((t.email ?? t.name).trim().toLowerCase()));
  return extra.length ? { ...packet, tenants: [...packet.tenants, ...extra.map((t) => ({ contactId: null, name: t.name, email: t.email, phone: t.phone, isPrimary: false, ...(t.reference ? {} : { reference: false }) }))] } : packet;
}

/**
 * Hand it over.
 *
 * Posts the packet to Howard's flow, which does the Propoly creation, the REX
 * listing update and the mail-merge. We do not duplicate any of that.
 *
 * Two refusals, both deliberate:
 *   • no trigger URL → says exactly where to get one rather than failing vague
 *   • blockers → a handoff that arrives incomplete is worse than one that
 *     didn't arrive, because the second gets chased and the first gets filed
 */
export async function sendHandoff(h: Handoff, force = false): Promise<{ status: number; body: string }> {
  if (!handoffFlowConfigured()) {
    throw new Error(
      "POWER_AUTOMATE_ACCEPTED_URL isn't set. The trigger URL for “TLE: Application Accepted” " +
        "carries a SAS signature and only appears on the flow's own HTTP trigger card in " +
        "Power Automate — it is not in the exported definition."
    );
  }
  if (h.blockers.length && !force) {
    throw new Error(`Not ready to hand over: ${h.blockers.join(" ")}`);
  }

  const res = await fetch(process.env.POWER_AUTOMATE_ACCEPTED_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: h.applicationId,
      listingId: h.listingId,
      property: h.property,
      landlord: h.landlord,
      tenants: h.tenants,
      rentPcm: h.rentPcm,
      startDate: h.startDate,
      agreementMonths: h.agreementMonths,
      acceptedOn: h.acceptedOn,
      // The flow can attach what already exists rather than asking for it again.
      documentIds: h.documents.map((d) => d.id),
    }),
  });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}
