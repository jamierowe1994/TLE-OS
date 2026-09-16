import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { recordLandlordDocument, type DocKind, type LandlordDocument } from "@/lib/landlord-account";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";
import { hasDb } from "@/lib/db";
import { bindPages, canBind } from "@/lib/doc-pages";

/**
 * FILING ONE DOCUMENT, whoever is asking.
 *
 * Lifted out of app/api/landlord/documents on 16 Sep 2026, when the phone
 * hand-off gave the same bytes a second way in. The two routes differ only in
 * how they decide WHO the landlord is - a session cookie on one, a QR token on
 * the other - and that is the one thing worth keeping apart. Everything after
 * it (the size, the type, the key, the row) must be identical, because a file
 * that lands under a different prefix or with no kind on it is a file the
 * landlord's list cannot tick off.
 *
 * Callers pass an ALREADY-RESOLVED account id. This function deliberately does
 * no authentication of its own: a helper that sometimes checks and sometimes
 * does not is the shape that eventually ships without checking.
 */

export type StoreResult =
  | { ok: true; document: LandlordDocument }
  | { ok: false; status: number; error: string };

/**
 * Several photographs of one document, filed as one.
 *
 * The routes both take a repeated `file` field rather than a single one, so a
 * two-sided gas certificate arrives as two shots and goes onto the record as
 * one PDF. Anything that cannot be bound - a lone page, a HEIC, a PDF picked
 * out of Files - falls through to being filed on its own, which is also what
 * happens for every upload that was never a camera in the first place.
 */
export async function storeLandlordPages(d: {
  accountId: string;
  appraisalId: string | null;
  kind: DocKind;
  files: File[];
  label?: string;
  via?: "portal" | "handoff";
}): Promise<StoreResult> {
  const files = d.files.filter((f) => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, status: 400, error: "No file was attached." };

  if (canBind(files)) {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${(d.label || "Document").replace(/[^\w\s-]/g, "").trim() || "Document"} ${stamp}`;
    try {
      const bound = await bindPages(files, name);
      return storeLandlordDocument({ ...d, file: bound });
    } catch (e) {
      /* A page that will not embed must not lose the whole send. Fall through
         and file them individually, which is the outcome without this feature
         rather than an error. */
      console.error("[landlord/documents] could not bind pages", (e as Error).message);
    }
  }

  let last: StoreResult = { ok: false, status: 400, error: "No file was attached." };
  for (const file of files) {
    last = await storeLandlordDocument({ ...d, file });
    if (!last.ok) return last;
  }
  return last;
}

export async function storeLandlordDocument(d: {
  accountId: string;
  appraisalId: string | null;
  kind: DocKind;
  file: File;
  /** How it arrived, for the object's own metadata: a session, or a QR. */
  via?: "portal" | "handoff";
}): Promise<StoreResult> {
  if (!hasDb()) return { ok: false, status: 503, error: "No database on this environment." };
  if (!r2Configured) {
    return { ok: false, status: 503, error: "Document storage isn't set up on this environment yet." };
  }

  const { file } = d;
  const scope = SCOPES.document;
  if (file.size === 0) return { ok: false, status: 400, error: "No file was attached." };
  if (file.size > scope.maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `That file is too big. Up to ${Math.round(scope.maxBytes / 1024 / 1024)}MB, please.`,
    };
  }
  if (!(scope.types as readonly string[]).includes(file.type)) {
    return { ok: false, status: 415, error: "A PDF or a photograph, please." };
  }

  const clean = safeName(file.name) || "document";
  const key = `${scope.prefix}/landlord/${d.accountId}/${Date.now()}-${clean}`;
  const body = new Uint8Array(await file.arrayBuffer());

  try {
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.type,
          Metadata: {
            "original-name": encodeURIComponent(file.name),
            "landlord-account": d.accountId,
            kind: d.kind,
            via: d.via ?? "portal",
          },
        })
      )
    );
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("[landlord/documents] R2 upload failed", err.name, err.message);
    return { ok: false, status: 502, error: "Upload failed. The file wasn't stored." };
  }

  const document = await recordLandlordDocument({
    accountId: d.accountId,
    appraisalId: d.appraisalId,
    kind: d.kind,
    name: file.name,
    r2Key: key,
    bytes: file.size,
    contentType: file.type,
  });
  return { ok: true, document };
}
