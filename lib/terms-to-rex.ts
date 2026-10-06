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

export async function rexHasTerms(propertyId: string): Promise<boolean | null> {
  const res = await rexCall("ComplianceEntries", "search", {
    criteria: [{ name: "parent_object_id", type: "in", value: [propertyId] }],
    limit: 100,
  });
  if (!res.ok) return null;
  return rexRows(res.result).some((r) => r.type_id === "terms_of_business" && r.system_record_state !== "archived");
}

export async function fileTermsToRex(p: { propertyId: string; r2Key: string; fileName: string; uploadedAt?: Date | string | null; byName?: string | null }): Promise<{ ok: boolean; note: string }> {
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
            notes: `Written by TLE OS from the terms uploaded on the listing${p.byName ? ` by ${p.byName}` : ""} (${p.fileName}). Issue date is the upload date.`.slice(0, 500),
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

/** The latest terms of business uploaded in the OS for this home, if any. */
export async function osTermsFor(propertyId: string): Promise<{ r2_key: string; file_name: string; at: Date | null; by_name: string | null } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ r2_key: string; file_name: string; at: Date | null; by_name: string | null }>(
    `SELECT r2_key, file_name, at, by_name FROM os_file_documents
      WHERE rex_property_id = $1 AND type = 'terms_of_business' AND NOT is_test AND removed_at IS NULL
      ORDER BY at DESC NULLS LAST LIMIT 1`,
    [propertyId]
  ).catch(() => []);
  return rows[0] ?? null;
}

/**
 * Before a push: REX's entry if it has one; otherwise file the OS upload now.
 * True when REX holds terms (or has just been given them).
 */
export async function ensureTermsInRex(propertyId: string): Promise<boolean> {
  if ((await rexHasTerms(propertyId)) !== false) return true;
  const mine = await osTermsFor(propertyId);
  if (!mine) return false;
  const r = await fileTermsToRex({ propertyId, r2Key: mine.r2_key, fileName: mine.file_name, uploadedAt: mine.at, byName: mine.by_name });
  return r.ok;
}
