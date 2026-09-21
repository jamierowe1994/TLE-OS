import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/**
 * What somebody adds to a report themselves: a recording of their screen, or
 * pictures of their own.
 *
 * James, 21 Sep 2026: Howard is testing everything, and needs "a way to either
 * record his screen, take a screenshot and add details". The picture the OS
 * takes on its own (lib/screenshot) is one still of one moment. A fault that
 * only shows while you are DOING something - a drawer that closes itself, a
 * figure that flickers, four clicks that end somewhere wrong - is not in it.
 *
 * ── Where the files go, and who can open them ─────────────────────────────
 *
 * R2, under `bug-reports/`. That prefix is deliberately NOT one of the upload
 * scopes in lib/r2: `keyIsOurs` refuses it, so /api/r2/file will not hand a
 * recording to anybody who learns its key. A recording of this product shows
 * landlords, tenants and arrears for as long as it runs. The only door is
 * `mediaFor`, behind `see:reports`.
 *
 * ── Thirty days, like the pictures ────────────────────────────────────────
 *
 * Swept on write, for the reason lib/pilot gives: no cron to forget. Here the
 * sweep has to delete the file as well as the row, so it reads the old rows
 * first and only forgets the ones whose file really went.
 */

const PREFIX = "bug-reports";

/** What a browser's recorder produces, and what a screenshot arrives as. */
export const MEDIA_TYPES = ["video/webm", "video/mp4", "image/png", "image/jpeg", "image/webp"] as const;

/* Three minutes of screen at the bitrate lib/screen-record asks for is about
   20MB. The route buffers the file, so this is also the memory one upload
   costs; double the expected size and no more. */
export const MEDIA_MAX_BYTES = 40 * 1024 * 1024;
/** A recording and a few pictures. More than this is a conversation. */
export const MEDIA_MAX_PER_BUG = 6;

export interface BugMedia {
  id: string;
  mime: string;
  bytes: number;
  url: string;
}

const EXT: Record<string, string> = {
  "video/webm": "webm", "video/mp4": "mp4", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};

/** Store one file against a report. Only the person who filed it may add to it. */
export async function addBugMedia(p: {
  bugId: string; reporterId: string; mime: string; body: Uint8Array;
}): Promise<"ok" | "not-yours" | "full" | "no-storage" | "failed"> {
  if (!hasDb() || !r2Configured) return "no-storage";
  const own = await q<{ id: string }>(
    `select id from os_bugs where id = $1 and reporter_id = $2`, [p.bugId, p.reporterId]
  );
  if (!own.length) return "not-yours";
  const have = await q<{ n: string }>(`select count(*)::text as n from os_bug_media where bug_id = $1`, [p.bugId]);
  if (Number(have[0]?.n ?? 0) >= MEDIA_MAX_PER_BUG) return "full";

  const id = uid();
  const key = `${PREFIX}/${p.bugId}/${id}.${EXT[p.mime] ?? "bin"}`;
  try {
    await withR2((client) =>
      client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: p.body, ContentType: p.mime }))
    );
    await q(
      `insert into os_bug_media (id, bug_id, r2_key, mime, bytes) values ($1,$2,$3,$4,$5)`,
      [id, p.bugId, key, p.mime, p.body.byteLength]
    );
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("bug media failed to store", err.name, err.message);
    return "failed";
  }
  void sweep();
  return "ok";
}

/** Everything added to one report, each with a link that works for five minutes. */
export async function mediaFor(bugId: string): Promise<BugMedia[]> {
  if (!hasDb() || !r2Configured) return [];
  const rows = await q<{ id: string; r2_key: string; mime: string; bytes: number }>(
    `select id, r2_key, mime, bytes from os_bug_media where bug_id = $1 order by created_at`, [bugId]
  );
  const out: BugMedia[] = [];
  for (const r of rows) {
    const url = await withR2((client) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: r.r2_key }), { expiresIn: 300 })
    ).catch(() => "");
    if (url) out.push({ id: r.id, mime: r.mime, bytes: r.bytes, url });
  }
  return out;
}

async function sweep(): Promise<void> {
  try {
    const old = await q<{ id: string; r2_key: string }>(
      `select id, r2_key from os_bug_media where created_at < now() - interval '30 days' limit 25`
    );
    for (const o of old) {
      await withR2((client) => client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: o.r2_key })));
      await q(`delete from os_bug_media where id = $1`, [o.id]);
    }
  } catch {
    /* Tried again on the next upload. */
  }
}
