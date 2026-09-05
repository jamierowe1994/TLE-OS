import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { rexCall, rexConfigured, rexWritesLocked } from "@/lib/rex";
import { switchOn } from "@/lib/switches";
import { getApplications } from "@/lib/applications";
import { fetchListingBook } from "@/lib/rex-listings";
import { getListingDocuments } from "@/lib/business/rex-stats";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { refreshComplianceBook } from "@/lib/compliance-cache";
import { getCase, recordRexPush } from "@/lib/plc-store";
import { checkById, type CheckId, type PlcCase, type PlcDocument, type PushResult, type RexPush } from "@/lib/plc";

/**
 * The approved pack, into REX's compliance table.
 *
 * ── Why REX, when the files already go to Propoly ─────────────────────────
 *
 * James, 5 Sep 2026: the certificates agents upload live in Propoly against
 * the deal, and Propoly's API cannot list or read them back. REX's compliance
 * table - the one the Compliance tracker, the certificate chases and REX PM's
 * own screen all read - stays empty, so the tracker calls 911 certificates
 * outstanding when most exist. Writing each one here on approval means the
 * upload Kirstie already does counts in REX, Propoly and the OS at once.
 *
 * ── What REX wants ────────────────────────────────────────────────────────
 *
 * Read live from ComplianceEntries::describeModel and getSchemaForType on
 * 5 Sep: an entry is parent_object_type_id + parent_object_id (the property),
 * type_id, and a details block keyed by the type. EICR requires issue_date,
 * expiry_date and status; gas takes issue, expiry, pass/failed and a
 * not_required flag; EPC takes expiry and issue. The file is an Upload
 * first (uploadFileFromUrl gives a rextmp:// uri) and then file_uri on the
 * entry - the same two-step the signed terms use.
 *
 * ── Two locks, and it says which ──────────────────────────────────────────
 *
 * The switch (Admin, Switches, Certificates into REX) and the REX write
 * allowlist naming ComplianceEntries/create and Upload/uploadFileFromUrl.
 * Either off, the run is recorded as skipped with the reason and nothing
 * touches REX. The first run is meant to be watched.
 *
 * ── The issue date ────────────────────────────────────────────────────────
 *
 * The reader finds the EXPIRY on a certificate; REX insists on an issue date
 * for an EICR. It is derived from the expiry by the certificate's usual
 * life (EICR five years, gas one, EPC ten) and said so in the entry's notes,
 * so nobody later mistakes a derived date for a read one.
 */

const TYPE_WORDS: Record<string, string> = {
  gas_safety: "Gas safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  mandatory_hmo_license: "HMO licence",
  additional_hmo_license: "HMO licence (additional)",
  selective_hmo_license: "Selective licence",
  legionella_risk_assessment: "Legionella risk assessment",
  portable_appliance_testing: "PAT",
  smoke_alarms: "Smoke alarms",
  co_alarms: "CO alarms",
  emergency_lighting_fire_exit: "Fire safety",
};

/** "EICR - expires 2028-09-06 - file.pdf": what the document is called in REX. */
function docDescription(type: string, expiry: string, name: string): string {
  return `${TYPE_WORDS[type] ?? type} - expires ${expiry} - ${name}`.slice(0, 200);
}

const LIFE_MONTHS: Partial<Record<string, number>> = { eicr: 60, gas_safety: 12, epc: 120, legionella_risk_assessment: 24, portable_appliance_testing: 12 };

/** Which REX compliance type a check writes, by check and then by filename. */
export function rexTypeFor(checkId: CheckId, name: string): string | null {
  const n = name.toLowerCase();
  switch (checkId) {
    case "gas-safety":
      return "gas_safety";
    case "eicr":
      return "eicr";
    case "epc":
      return "epc";
    case "licensing":
      if (/requirement|exempt|not.?required/.test(n)) return null;
      return /additional/.test(n) ? "additional_hmo_license" : /selective/.test(n) ? "selective_hmo_license" : "mandatory_hmo_license";
    default:
      /* ID, references, right to rent, agreements: not certificates. */
      return null;
  }
}

function expiryFor(c: PlcCase, checkId: CheckId): string | null {
  const f = c.findings.find((x) => x.checkId === checkId && x.foundDate);
  return f?.foundDate ?? null;
}

function issueFrom(expiry: string, type: string): string | null {
  const months = LIFE_MONTHS[type];
  if (!months) return null;
  const d = new Date(`${expiry}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function presigned(doc: PlcDocument): Promise<string> {
  if (doc.placeholder) throw new Error("recorded by name only, never stored");
  if (!r2Configured) throw new Error("file storage isn't configured here");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return withR2((client) => getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.key }), { expiresIn: 3600 }));
}

/**
 * The REX property this pack is about: the application's property when the
 * pack came from one, else the listing whose address matches. Certificates
 * hang off the PROPERTY, never the listing.
 */
export async function rexPropertyForCase(c: PlcCase): Promise<string | null> {
  const apps = await getApplications(300).catch(() => []);
  const app = apps.find((a) => String(a.id) === String(c.applicationRef));
  if (app?.propertyId) return app.propertyId;
  const key = propertyKey(c.address);
  if (!key) return null;
  const book = await fetchListingBook().catch(() => null);
  const hit = book?.listings.find((l) => l.propertyId && propertyKey(l.name) === key);
  return hit?.propertyId ?? null;
}

/** Why a write cannot happen right now, or null when it can. Checked once per run. */
export async function rexWriteBlockedBecause(): Promise<string | null> {
  if (!(await switchOn("rex_compliance_write"))) return "Certificates into REX is switched off (Admin, Switches).";
  if (!rexConfigured()) return "REX isn't connected on this environment.";
  const locked = [["ComplianceEntries", "create"], ["Upload", "uploadFileFromUrl"]].filter(([s, m]) => rexWritesLocked(s, m));
  if (locked.length) return `REX writes are locked - REX_ALLOW_WRITES needs ${locked.map(([s, m]) => `${s}/${m}`).join(" and ")}.`;
  return null;
}

/**
 * The same file, into REX's Documents on the listing.
 *
 * James, 5 Sep: "they need to be saved into the documentation as well." A
 * compliance entry is what the tracker reads; the listing's Documents is
 * where a person looks. Same two-step as the signed terms: the upload's
 * rextmp uri, then Listings/update with a nested listing_documents row.
 * Skipped, and said, when the property has no listing or the file is
 * already there by name. Listings/update is on the allowlist already.
 */
export async function attachCertificateToListing(input: {
  propertyId: string;
  uri: string;
  name: string;
  description: string;
}): Promise<{ ok: boolean; note: string; listingId?: string }> {
  try {
    const book = await fetchListingBook().catch(() => null);
    const listing = book?.listings.find((l) => l.propertyId === input.propertyId);
    if (!listing) return { ok: false, note: "No listing on this property, so nothing to file the document under." };
    if (rexWritesLocked("Listings", "update")) return { ok: false, note: "REX_ALLOW_WRITES does not name Listings/update." };
    const held = await getListingDocuments(String(listing.id)).catch(() => []);
    if (held.some((d) => d.name === input.description)) return { ok: true, note: "Already in the listing's Documents.", listingId: String(listing.id) };
    const res = await rexCall("Listings", "update", {
      data: { id: Number(listing.id), related: { listing_documents: [{ description: input.description, uri: input.uri }] } },
    });
    if (!res.ok) return { ok: false, note: res.error ?? `REX answered ${res.status}.` };
    return { ok: true, note: "Filed in the listing's Documents.", listingId: String(listing.id) };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : "attach failed" };
  }
}

/**
 * One certificate, into REX. Shared by the approved pack and the batch
 * intake, so a certificate written either way lands identically.
 */
export async function writeCertificateToRex(input: {
  propertyId: string;
  type: string;
  expiry: string;
  /** Read off the certificate when known; derived from the expiry otherwise. */
  issue?: string | null;
  /** R2 key of the file. */
  key: string;
  name: string;
  /** Where it came from, for the entry's notes. */
  provenance: string;
  /** An entry the OS already wrote: update it (needs ComplianceEntries/update) rather than make a second. */
  existingEntryId?: string | null;
}): Promise<{ ok: boolean; note: string; entryId?: string }> {
  try {
    /* An entry the OS already made: the Documents copy is always worth
       filing (Listings/update is allowed); touching the entry itself needs
       ComplianceEntries/update, and is skipped with a word when it is not. */
    const url = await presigned({ key: input.key, name: input.name } as PlcDocument);
    const up = await rexCall("Upload", "uploadFileFromUrl", { url });
    const uri = (up.result as { uri?: string } | undefined)?.uri;
    if (!up.ok || !uri) return { ok: false, note: `REX would not take the file: ${up.error ?? JSON.stringify(up.result ?? "").slice(0, 160)}` };
    const derived = !input.issue;
    const issue = input.issue ?? issueFrom(input.expiry, input.type);
    const notes = `${input.provenance}${derived && issue ? " Issue date derived from the expiry." : ""}`;
    /* The file goes INSIDE the type's details block as well as on the entry.
       Learned live on 5 Sep: gas took file_uri on the entry; the EICR came
       back "Field 'upload certificate': This field is required" until the
       uri was also given as details.eicr.file, which is where the type's
       own schema declares it. */
    const detail: Record<string, unknown> = { expiry_date: input.expiry, notes, file: uri };
    if (issue) detail.issue_date = issue;
    if (input.type === "eicr") detail.status = "eicr_satisfactory";
    if (input.type === "gas_safety") {
      detail.status = "pass";
      detail.not_required = false;
    }
    if (input.existingEntryId) {
      let entryNote: string;
      if (rexWritesLocked("ComplianceEntries", "update")) {
        entryNote = `Entry ${input.existingEntryId} left as it is (ComplianceEntries/update is not on the allowlist).`;
      } else {
        const upd = await rexCall("ComplianceEntries", "update", {
          data: { id: Number(input.existingEntryId), details: { [input.type]: detail } },
          return_id: true,
        });
        entryNote = upd.ok ? `Entry ${input.existingEntryId} updated, expires ${input.expiry}.` : `Entry ${input.existingEntryId} not updated: ${upd.error ?? `REX answered ${upd.status}.`}`;
      }
      const doc = await attachCertificateToListing({ propertyId: input.propertyId, uri, name: input.name, description: docDescription(input.type, input.expiry, input.name) });
      return { ok: true, note: `${entryNote} Documents: ${doc.note}`, entryId: input.existingEntryId };
    }
    const res = await rexCall("ComplianceEntries", "create", {
      data: {
        parent_object_type_id: "property",
        parent_object_id: Number(input.propertyId),
        type_id: input.type,
        details: { [input.type]: detail },
      },
      return_id: true,
    });
    if (!res.ok) return { ok: false, note: res.error ?? `REX answered ${res.status}.` };
    const id = typeof res.result === "number" || typeof res.result === "string" ? String(res.result) : String((res.result as { id?: unknown })?.id ?? "");
    const doc = await attachCertificateToListing({ propertyId: input.propertyId, uri, name: input.name, description: docDescription(input.type, input.expiry, input.name) });
    return { ok: true, note: `On the property in REX with its file, expires ${input.expiry}. Documents: ${doc.note}`, entryId: id || undefined };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : "write failed" };
  }
}

export async function pushCaseToRex(caseId: string, by: string): Promise<RexPush> {
  const c = await getCase(caseId);
  if (!c) throw new Error("That pack no longer exists.");
  if (c.state !== "approved") throw new Error("Only an approved pack goes into REX.");

  const at = new Date().toISOString();
  const certs = c.documents.filter((d) => rexTypeFor(d.checkId, d.name));
  const skipAll = (note: string): RexPush => ({
    at,
    by,
    propertyId: null,
    results: certs.map((d) => ({ checkId: d.checkId, name: d.name, type: rexTypeFor(d.checkId, d.name), outcome: "skipped", note })),
  });

  if (!certs.length) {
    const push = { at, by, propertyId: null, results: [] };
    await recordRexPush(caseId, push);
    return push;
  }
  const blocked = await rexWriteBlockedBecause();
  if (blocked) {
    const push = skipAll(blocked);
    await recordRexPush(caseId, push);
    return push;
  }

  const propertyId = await rexPropertyForCase(c);
  if (!propertyId) {
    const push = skipAll("No REX property matched this pack's address, so there is nothing to write the certificates onto.");
    await recordRexPush(caseId, push);
    return push;
  }

  const results: PushResult[] = [];
  const done = new Set<string>();
  for (const doc of certs) {
    const type = rexTypeFor(doc.checkId, doc.name) as string;
    const label = checkById(doc.checkId)?.label ?? doc.checkId;
    if (done.has(type)) {
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "skipped", note: "REX takes one entry per certificate type and this pack already wrote one." });
      continue;
    }
    const expiry = expiryFor(c, doc.checkId);
    if (!expiry) {
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "skipped", note: `REX needs an expiry date for ${label} and the reader did not find one on the document.` });
      continue;
    }
    if (doc.placeholder) {
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "skipped", note: "Recorded by name only on this environment - there is no file to send." });
      continue;
    }
    const w = await writeCertificateToRex({
      propertyId,
      type,
      expiry,
      key: doc.key,
      name: doc.name,
      provenance: `Written by TLE OS from PLC pack ${c.id} (${doc.name}).`,
    });
    if (w.ok) done.add(type);
    results.push({ checkId: doc.checkId, name: doc.name, type, outcome: w.ok ? "uploaded" : "failed", note: w.note });
  }

  const push: RexPush = { at, by, propertyId, results };
  await recordRexPush(caseId, push);
  /* The tracker reads a cached book; a certificate just written should not
     stay "missing" until the hour is up. */
  if (results.some((r) => r.outcome === "uploaded")) void refreshComplianceBook().catch(() => null);
  return push;
}
