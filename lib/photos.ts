import "server-only";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/**
 * The photo archive.
 *
 * The feed hands over one picture per advert as a link into the listing
 * agent's storage. Adverts come down, links die, and the picture that told
 * you which house it was is gone. So the sweep keeps the link, and this
 * copies the picture into our own bucket the first time it is seen. James,
 * 3 Sep: "every time that we see a photo of a property, we save it."
 *
 * ── Limits, on purpose ────────────────────────────────────────────────────
 *
 * A run copies a few hundred at a time, oldest first, and stops. The first
 * days catch up on the backlog; after that a run has a few dozen new adverts
 * to copy. Nothing here is on the request path: the daily run calls it after
 * the rescore, and a failure copies nothing and tries again tomorrow.
 *
 * The pictures are the listing agent's, and this copy is internal reference
 * so a door can be recognised. They are never put on anything Bond sends.
 *
 * Keys live under their own prefix, separate from the OS's photo and
 * document scopes in lib/r2, so retention and access can differ later.
 */

export const PHOTO_PREFIX = "bond/photos";

function keyFor(listingKey: string): string {
  return `${PHOTO_PREFIX}/${listingKey.replace(/[^A-Za-z0-9._-]+/g, "_")}.jpg`;
}

export async function archivePhotos(limit = 500): Promise<{ copied: number; failed: number; skipped: string | null }> {
  if (!hasDb()) return { copied: 0, failed: 0, skipped: "no database" };
  if (!r2Configured) return { copied: 0, failed: 0, skipped: "R2 is not configured on this environment, so the pictures stay as links." };

  const todo = await q<{ listing_key: string; image_url: string }>(
    `SELECT listing_key, image_url FROM os_listing_capture
      WHERE image_url IS NOT NULL AND image_key IS NULL
      ORDER BY first_seen ASC LIMIT $1`,
    [limit]
  );
  let copied = 0;
  let failed = 0;
  for (const row of todo) {
    try {
      const r = await fetch(row.image_url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      const type = r.headers.get("content-type") ?? "image/jpeg";
      if (!type.startsWith("image/")) throw new Error(`not an image: ${type}`);
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length === 0 || body.length > 15 * 1024 * 1024) throw new Error(`size ${body.length}`);
      const key = keyFor(row.listing_key);
      await withR2((client) =>
        client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: type, CacheControl: "public, max-age=31536000, immutable" }))
      );
      await q(`UPDATE os_listing_capture SET image_key = $2 WHERE listing_key = $1`, [row.listing_key, key]);
      copied++;
    } catch {
      /* Left with image_key NULL: it is tried again next run. A link that is
         already dead fails every day, cheaply, until the row itself ages out
         of the front of the queue - which is fine, and honest. */
      failed++;
    }
  }
  /* The prospect shows the archived copy as soon as its listing has one. */
  await q(
    `UPDATE os_radar_prospects p
        SET image_key = c.image_key
       FROM os_listing_capture c
      WHERE c.listing_key = p.listing_key AND c.image_key IS NOT NULL AND p.image_key IS NULL`
  );
  return { copied, failed, skipped: null };
}

/** One archived picture, for the photo route. Null when it is not ours. */
export async function readPhoto(key: string): Promise<{ body: Uint8Array; type: string } | null> {
  if (!r2Configured || !key.startsWith(`${PHOTO_PREFIX}/`)) return null;
  try {
    const res = await withR2((client) => client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })));
    if (!res.Body) return null;
    const body = await res.Body.transformToByteArray();
    return { body, type: res.ContentType ?? "image/jpeg" };
  } catch {
    return null;
  }
}
