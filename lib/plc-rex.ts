import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { rexCall, rexConfigured, rexWritesLocked } from "@/lib/rex";
import { switchOn } from "@/lib/switches";
import { getApplications } from "@/lib/applications";
import { fetchListingBook } from "@/lib/rex-listings";
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
  if (!(await switchOn("rex_compliance_write"))) {
    const push = skipAll("Certificates into REX is switched off (Admin, Switches).");
    await recordRexPush(caseId, push);
    return push;
  }
  if (!rexConfigured()) {
    const push = skipAll("REX isn't connected on this environment.");
    await recordRexPush(caseId, push);
    return push;
  }
  const locked = [["ComplianceEntries", "create"], ["Upload", "uploadFileFromUrl"]].filter(([s, m]) => rexWritesLocked(s, m));
  if (locked.length) {
    const push = skipAll(`REX writes are locked - REX_ALLOW_WRITES needs ${locked.map(([s, m]) => `${s}/${m}`).join(" and ")}.`);
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
    try {
      const url = await presigned(doc);
      const up = await rexCall("Upload", "uploadFileFromUrl", { url });
      const uri = (up.result as { uri?: string } | undefined)?.uri;
      if (!up.ok || !uri) {
        results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "failed", note: `REX would not take the file: ${up.error ?? JSON.stringify(up.result ?? "").slice(0, 160)}` });
        continue;
      }
      const issue = issueFrom(expiry, type);
      const notes = `Written by TLE OS from PLC pack ${c.id} (${doc.name}).${issue ? " Issue date derived from the expiry." : ""}`;
      const detail: Record<string, unknown> = { expiry_date: expiry, notes };
      if (issue) detail.issue_date = issue;
      if (type === "eicr") detail.status = "eicr_satisfactory";
      if (type === "gas_safety") {
        detail.status = "pass";
        detail.not_required = false;
      }
      const res = await rexCall("ComplianceEntries", "create", {
        data: {
          parent_object_type_id: "property",
          parent_object_id: Number(propertyId),
          type_id: type,
          file_uri: uri,
          details: { [type]: detail },
        },
        return_id: true,
      });
      if (res.ok) {
        done.add(type);
        results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "uploaded", note: `On the property in REX, expires ${expiry}.` });
      } else {
        results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "failed", note: res.error ?? `REX answered ${res.status}.` });
      }
    } catch (e) {
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "failed", note: e instanceof Error ? e.message : "write failed" });
    }
  }

  const push: RexPush = { at, by, propertyId, results };
  await recordRexPush(caseId, push);
  /* The tracker reads a cached book; a certificate just written should not
     stay "missing" until the hour is up. */
  if (results.some((r) => r.outcome === "uploaded")) void refreshComplianceBook().catch(() => null);
  return push;
}
