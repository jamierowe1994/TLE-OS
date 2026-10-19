import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, withR2 } from "@/lib/r2";
import { rexCall, rexRows, rexWritesLocked } from "@/lib/rex";

/**
 * TERMS OF BUSINESS UPLOADED IN THE OS COUNT IN REX (James, 6 Oct 2026).
 *
 * REX will not publish a listing until its property carries a
 * terms_of_business compliance entry. Lianna uploaded the signed terms for
 * 6 Ruskin Place on the listing's Documents tab, marked Terms of Business -
 * the OS kept it, REX never heard, and the push was refused again. James:
 * "If they mark that as the terms of business, we have to assume that's the
 * terms of business and allow them to push through."
 *
 * So a document marked terms_of_business is filed into REX as that entry
 * (same calls as lib/plc-rex: upload the file, then ComplianceEntries/create
 * with the file inside details.<type>), on upload, and again just before a
 * push if it never got there. REX keeps one active entry per type: if one is
 * already there, that is the answer, not an error.
 */

/**
 * Does REX hold terms of business for this home? True, false, or null when
 * REX did not answer - and null is not a yes (15 Oct 2026, bugs 2fb80600 and
 * 718558c6: a timed-out search waved 6 Ruskin Place through, REX refused the
 * publish, and Lianna saw only "The portals did not take that change").
 * A slow first try is asked once more, quietly, before giving up.
 */
export async function rexHasTerms(propertyId: string): Promise<boolean | null> {
  const ask = (quiet: boolean) =>
    rexCall("ComplianceEntries", "search", { criteria: [{ name: "parent_object_id", type: "in", value: [propertyId] }], limit: 100 }, null, { quiet });
  let res = await ask(true).catch(() => null);
  if (!res?.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await ask(false).catch(() => null);
  }
  if (!res?.ok) return null;
  return rexRows(res.result).some((r) => r.type_id === "terms_of_business" && r.system_record_state !== "archived");
}

/**
 * Plain ASCII for anything written into REX's notes (19 Oct 2026). The first
 * DocuSeal-signed terms to reach a push, 5 Strawberry Path for Richard, were
 * named "TLE Terms of Business — England, Sep 26": REX answered 500
 * "Malformed UTF-8 characters" to the em dash, twice, and the push was
 * refused. The same wall lib/plc-rex plainName met on 6 Sep. Dashes become
 * "-", accents lose their marks, anything else non-ASCII goes.
 */
export function rexPlain(text: string): string {
  return text
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fileTermsToRex(p: { propertyId: string; r2Key: string; fileName: string; uploadedAt?: Date | string | null; byName?: string | null; source?: OsTerms["source"] }): Promise<{ ok: boolean; note: string }> {
  if (rexWritesLocked("Upload", "uploadFileFromUrl") || rexWritesLocked("ComplianceEntries", "create")) {
    return { ok: false, note: "Filing compliance into REX is not switched on." };
  }
  try {
    const url = await withR2((c) => getSignedUrl(c, new GetObjectCommand({ Bucket: R2_BUCKET, Key: p.r2Key }), { expiresIn: 600 }));
    const up = await rexCall("Upload", "uploadFileFromUrl", { url });
    const uri = (up.result as { uri?: string } | undefined)?.uri;
    if (!up.ok || !uri) return { ok: false, note: "REX would not take the file." };
    const issue = new Date(p.uploadedAt ?? Date.now()).toISOString().slice(0, 10);
    const res = await rexCall("ComplianceEntries", "create", {
      data: {
        parent_object_type_id: "property",
        parent_object_id: Number(p.propertyId),
        type_id: "terms_of_business",
        details: {
          terms_of_business: {
            issue_date: issue,
            start_date: issue,
            file: uri,
            notes: rexPlain(
              p.source === "signed"
                ? `Written by TLE OS from the terms signed in DocuSeal${p.byName ? ` by ${p.byName}` : ""} (${p.fileName}). Issue date is the signing date.`
                : `Written by TLE OS from the terms uploaded on the listing${p.byName ? ` by ${p.byName}` : ""} (${p.fileName}). Issue date is the upload date.`
            ).slice(0, 500),
          },
        },
      },
      return_id: true,
    });
    if (res.ok) return { ok: true, note: "Filed in REX as the terms of business." };
    if (/already an active compliance entry/i.test(res.error ?? "")) return { ok: true, note: "REX already holds terms of business for this home." };
    console.error("[terms-to-rex] create refused", { propertyId: p.propertyId, status: res.status });
    return { ok: false, note: "REX did not take the terms entry." };
  } catch (e) {
    console.error("[terms-to-rex] failed", (e as Error)?.message);
    return { ok: false, note: "The terms could not be filed in REX just now." };
  }
}

/**
 * The latest terms of business the OS holds for this home, if any: one
 * uploaded and marked as terms, else the contract the landlord signed in
 * DocuSeal on an appraisal or a New listing file for this property (James,
 * 12 Oct 2026: "DocuSeal-signed terms count"). Either is filed into REX
 * before a push by ensureTermsInRex, because REX will not publish without it.
 */
export type OsTerms = { r2_key: string; file_name: string; at: Date | null; by_name: string | null; source: "upload" | "signed" | "record" };

export async function osTermsFor(propertyId: string, opts: { record?: boolean } = {}): Promise<OsTerms | null> {
  if (!hasDb()) return null;
  const rows = await q<{ r2_key: string; file_name: string; at: Date | null; by_name: string | null }>(
    `SELECT r2_key, file_name, at, by_name FROM os_file_documents
      WHERE rex_property_id = $1 AND type = 'terms_of_business' AND NOT is_test AND removed_at IS NULL
      ORDER BY at DESC NULLS LAST LIMIT 1`,
    [propertyId]
  ).catch(() => []);
  if (rows[0]) return { ...rows[0], source: "upload" };
  const signed = await q<{ r2_key: string; file_name: string; at: Date | null; by_name: string | null }>(
    `SELECT d.r2_key, COALESCE(NULLIF(d.template_name, ''), 'Terms of business') || '.pdf' AS file_name,
            d.completed_at AS at, NULLIF(d.signer_name, '') AS by_name
       FROM os_signed_documents d
       JOIN os_market_appraisals a ON a.id = d.appraisal_id
      WHERE a.rex_property_id = $1 AND d.completed_at IS NOT NULL AND d.r2_key <> ''
      ORDER BY d.completed_at DESC LIMIT 1`,
    [propertyId]
  ).catch(() => []);
  if (signed[0]) return { ...signed[0], source: "signed" };
  /* The property record's copy is shown on screen, but is not filed into
     REX until James says yes to that write (hands off REX, 13 Oct 2026), so
     the go-live gate and the push leave it out. */
  return opts.record ? recordTermsFor(propertyId) : null;
}

/**
 * Terms filed on the OS property record (the clean sweep's papers). James,
 * 12 Oct 2026, on 32 Elm Close: "the property is already on the system with
 * terms of business. We don't need to sign them again" - the record held
 * them and the listing still asked for a signature.
 */
export async function recordTermsFor(propertyId: string): Promise<OsTerms | null> {
  if (!hasDb()) return null;
  const homes = await q<{ id: string }>(`SELECT id FROM os_properties WHERE rex_property_id = $1 OR id = $1`, [propertyId]).catch(() => []);
  if (!homes.length) return null;
  const { recordFiles } = await import("@/lib/listing-record");
  for (const h of homes) {
    const files = await recordFiles(h.id).catch(() => []);
    const t = files.find((f) => f.field === "doc_terms_of_business");
    if (t) return { r2_key: t.key, file_name: t.name, at: null, by_name: null, source: "record" };
  }
  return null;
}

/**
 * Before a push: REX's entry if it has one; otherwise file the OS upload now.
 *
 *   "yes"     REX holds terms, or has just been given them
 *   "no"      REX holds none and the OS has none to give it
 *   "unknown" REX did not answer and the OS has none to give it - NOT a yes
 *             (15 Oct 2026: REX refused the publish when this was a yes)
 *
 * When REX does not answer and the OS does hold signed terms, they are filed
 * anyway: fileTermsToRex already takes "an active entry is already there" as
 * success, so filing onto a home REX was holding terms for all along is safe.
 */
export async function ensureTermsInRex(propertyId: string): Promise<"yes" | "no" | "unknown" | "not_filed"> {
  const inRex = await rexHasTerms(propertyId);
  if (inRex === true) return "yes";
  const mine = await osTermsFor(propertyId);
  if (!mine) return inRex === false ? "no" : "unknown";
  const r = await fileTermsToRex({ propertyId, r2Key: mine.r2_key, fileName: mine.file_name, uploadedAt: mine.at, byName: mine.by_name, source: mine.source });
  return r.ok ? "yes" : "not_filed";
}
