import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/**
 * The File Store's shelf (Marketing hub > File Store, R2 library/shelf/), as
 * a list (James, 2 Oct 2026: "Steve's knowledge ... should be pulling
 * everything from the file storage area ... serve them back to the person as
 * a downloadable"). Any signed-in person may read the library scope
 * (lib/r2-access), and a download goes through /api/r2/file, which signs a
 * five-minute link - nothing here hands out a bucket URL.
 */
export type LibraryFile = { key: string; name: string; size: number; uploadedAt: string | null; href: string };

const PREFIX = "library/shelf/";

export async function shelfFiles(): Promise<LibraryFile[]> {
  if (!r2Configured) return [];
  const out: LibraryFile[] = [];
  let token: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await withR2((c) => c.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: PREFIX, MaxKeys: 1000, ContinuationToken: token })));
    for (const o of res.Contents ?? []) {
      if (!o.Key || o.Key.endsWith("/")) continue;
      out.push({
        key: o.Key,
        /* "<timestamp>-5_Renters Rights Act FAQ.pdf": the upload stamp and
           the team's own ordering number come off for reading. */
        name: o.Key.slice(PREFIX.length).replace(/^\d+-/, "").replace(/^\d{1,3}_/, ""),
        size: o.Size ?? 0,
        uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null,
        href: `/api/r2/file?key=${encodeURIComponent(o.Key)}&save=1`,
      });
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  return out.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}
