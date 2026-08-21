import "server-only";
import { rexCall } from "@/lib/rex";
import { getApplications, type Application } from "@/lib/applications";

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
  return [...best.values()];
}

/* ── the packet ───────────────────────────────────────────────────────────── */

export interface HandoffParty {
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface Handoff {
  applicationId: string;
  listingId: number | null;
  property: string;
  locality: string;
  landlord: HandoffParty | null;
  tenants: (HandoffParty & { isPrimary: boolean })[];
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

/** The landlord, off the listing's owner relationship. */
async function landlordOf(listingId: number): Promise<{ landlord: HandoffParty | null; docs: HandoffDoc[] }> {
  const res = await rexCall("Listings", "read", { id: listingId });
  if (!res.ok) return { landlord: null, docs: [] };
  const l = (res.result ?? {}) as Row;
  const related = (l.related ?? {}) as Row;

  const relns = (related.contact_reln_listing ?? []) as Row[];
  const owner = relns.find((r) => str((r.reln_type as Row | null)?.id) === "owner");
  const c = (owner?.contact ?? null) as Row | null;

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
    landlord: c
      ? {
          contactId: str(c.id),
          name: str(c.name) ?? "Name not recorded",
          email: str(c.email_address),
          phone: str(c.phone_number),
        }
      : null,
    docs,
  };
}

/** Is the Power Automate flow reachable? Its URL carries a SAS signature and
 *  is only obtainable from the flow's own trigger card — not the export. */
export function handoffFlowConfigured(): boolean {
  return Boolean((process.env.POWER_AUTOMATE_ACCEPTED_URL ?? "").trim());
}

export async function buildHandoff(application: Application): Promise<Handoff> {
  const listingId = application.listingId;
  const { landlord, docs } = listingId
    ? await landlordOf(listingId)
    : { landlord: null, docs: [] as HandoffDoc[] };

  const certificates = application.propertyId
    ? await certificatesFor(application.propertyId, application.startDate)
    : [];

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

  const tenants = application.applicants.map((a) => ({
    contactId: a.contactId,
    name: a.name,
    email: a.email,
    phone: a.phone,
    isPrimary: a.isPrimary,
  }));

  const blockers: string[] = [];
  if (!listingId) blockers.push("No listing on the application.");
  if (!landlord) {
    blockers.push(
      "No landlord on the listing — nothing to create the Propoly landlord from."
    );
  } else if (!landlord.email) {
    blockers.push(`${landlord.name} has no email address, so they can't be told.`);
  } else if (/@(thelettingexperts|theexpertsgroup)\.co\.uk$/i.test(landlord.email)) {
    // Measured on 4 of 40 accepted deals. The mail-merge dutifully sends the
    // "your property is let" email to a colleague, and the landlord hears
    // nothing — a silent failure, which is the worst kind.
    blockers.push(
      `${landlord.name}'s email is a TLE staff address (${landlord.email}) — the landlord email would go to us, not them.`
    );
  }
  if (!tenants.length) blockers.push("No applicants on the application.");
  if (tenants.some((t) => !t.email)) {
    blockers.push(
      `${tenants.filter((t) => !t.email).map((t) => t.name).join(", ")} has no email address.`
    );
  }
  if (!application.startDate) blockers.push("No move-in date agreed.");
  if (!application.offerAmount) blockers.push("No agreed rent on the application.");
  // Right to Rent is the one that must not be discovered late — a tenancy
  // granted without it is the agent's liability, not the landlord's.
  if (application.rightToRentIncomplete) {
    blockers.push("Right to rent isn't recorded for every applicant.");
  }
  for (const m of missing) {
    blockers.push(`${m.label}: ${m.why}`);
  }

  return {
    applicationId: application.id,
    listingId,
    property: application.property,
    locality: application.locality,
    landlord,
    tenants,
    rentPcm: application.offerAmount,
    startDate: application.startDate,
    agreementMonths: application.agreementMonths,
    acceptedOn: application.dateAccepted,
    agent: application.agent,
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
  return app ? buildHandoff(app) : null;
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
