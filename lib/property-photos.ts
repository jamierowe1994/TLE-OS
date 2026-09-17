import "server-only";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";

/**
 * THE TAKE-ON PHOTOGRAPHS (James, 17 Sep 2026).
 *
 * "We should be able to upload all of the photos and everything ... a nice
 * big drop box, so they should just be able to grab all of the photos and
 * then drop them into the file in mass."
 *
 * They land in R2 under photos/takeon/<appraisal>/ and the row is the index.
 * One request per photograph, so the drop box can show each one filling up
 * and a percentage across the lot - a single 80MB post shows nothing for a
 * minute and then either works or does not.
 *
 * They are OURS until the listing exists. REX holds a listing's images, and
 * there is no listing on the day the photographs are taken; this is what
 * stops them living on a memory card until somebody remembers.
 */

export interface PropertyPhoto {
  id: string;
  name: string;
  bytes: number | null;
  contentType: string;
  uploadedBy: string;
  uploadedAt: string;
}

type Row = { id: string; name: string; bytes: number | null; content_type: string; uploaded_by: string; uploaded_at: Date | string };

const shape = (r: Row): PropertyPhoto => ({
  id: r.id,
  name: r.name,
  bytes: r.bytes,
  contentType: r.content_type,
  uploadedBy: r.uploaded_by,
  uploadedAt: new Date(r.uploaded_at).toISOString(),
});

export async function listPhotos(appraisalId: string): Promise<PropertyPhoto[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT id, name, bytes, content_type, uploaded_by, uploaded_at
       FROM os_property_photos WHERE appraisal_id = $1 ORDER BY uploaded_at ASC LIMIT 200`,
    [appraisalId]
  ).catch(() => []);
  return rows.map(shape);
}

export async function storePhoto(p: { appraisalId: string; file: File; by: string }): Promise<{ ok: true; photo: PropertyPhoto } | { ok: false; status: number; error: string }> {
  if (!hasDb()) return { ok: false, status: 503, error: "No database on this environment." };
  if (!r2Configured) return { ok: false, status: 503, error: "Photo storage isn't set up on this environment yet." };
  const scope = SCOPES.photo;
  const { file } = p;
  if (!file || file.size === 0) return { ok: false, status: 400, error: "No photograph was attached." };
  if (file.size > scope.maxBytes) return { ok: false, status: 413, error: `${file.name} is too big. Up to ${Math.round(scope.maxBytes / 1024 / 1024)}MB each.` };
  if (!(scope.types as readonly string[]).includes(file.type)) return { ok: false, status: 415, error: `${file.name} is not a photograph we can take.` };

  const key = `${scope.prefix}/takeon/${p.appraisalId}/${Date.now()}-${safeName(file.name) || "photo"}`;
  const body = new Uint8Array(await file.arrayBuffer());
  try {
    await withR2((client) =>
      client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type, Metadata: { appraisal: p.appraisalId } }))
    );
  } catch (e) {
    console.error("[photos] R2 upload failed", (e as Error).message);
    return { ok: false, status: 502, error: "That one didn't store. Try it again." };
  }
  const id = uid();
  const rows = await q<Row>(
    `INSERT INTO os_property_photos (id, appraisal_id, r2_key, name, bytes, content_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, bytes, content_type, uploaded_by, uploaded_at`,
    [id, p.appraisalId, key, file.name, file.size, file.type, p.by]
  );
  return { ok: true, photo: shape(rows[0]) };
}

export async function deletePhoto(appraisalId: string, id: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ r2_key: string }>(`DELETE FROM os_property_photos WHERE id = $1 AND appraisal_id = $2 RETURNING r2_key`, [id, appraisalId]).catch(() => []);
  const key = rows[0]?.r2_key;
  if (!key) return false;
  await withR2((client) => client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))).catch(() => null);
  return true;
}

/** A link the browser (or the advert writer) can fetch for an hour. */
export async function photoUrl(appraisalId: string, id: string): Promise<string | null> {
  if (!hasDb() || !r2Configured) return null;
  const rows = await q<{ r2_key: string }>(`SELECT r2_key FROM os_property_photos WHERE id = $1 AND appraisal_id = $2`, [id, appraisalId]).catch(() => []);
  const key = rows[0]?.r2_key;
  if (!key) return null;
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return withR2((client) => getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 3600 }));
}
