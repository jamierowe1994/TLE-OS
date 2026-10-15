import { after, NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, SCOPES, withR2 } from "@/lib/r2";
import { forgetLibraryFile, readKeys, readLibraryFile, readNotes } from "@/lib/library-reader";
import { shelfFolder } from "@/lib/library-files";

/**
 * The File Store's housekeeping (30 Sep 2026, Francesca's ticket): delete a
 * file, and lock one so it can't be deleted.
 *
 *   GET                                   -> { locked, read: keys with a write-up, reads: notes }
 *   POST { action: "lock" | "unlock" | "delete" | "read", key }
 *   POST { action: "folder" | "unfolder", folder }   (7 Oct ticket, built 15 Oct)
 *
 * "read" has Steve read the file again now (lib/library-reader); a delete
 * takes the file's library write-up with it.
 *
 * Locks live in os_settings under "library_locks" rather than on the object,
 * because R2 metadata can't be changed without copying the whole file, and a
 * 135MB copy to flip a padlock is silly. A locked file refuses deletion until
 * somebody unlocks it, and the lock says who set it.
 *
 * Marketing and the office only (see:marketing). Agents read the shelf; they
 * don't tidy it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = "library_locks";
const SHELF = `${SCOPES.library.prefix}/shelf/`;

type Locks = Record<string, { by: string; at: string }>;

async function readLocks(): Promise<Locks> {
  if (!hasDb()) return {};
  const rows = await q<{ value: { locks?: Locks } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(
    () => []
  );
  return rows[0]?.value?.locks ?? {};
}

async function writeLocks(locks: Locks, by: string) {
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify({ locks }), by]
  );
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:marketing"))) {
    return NextResponse.json({ ok: true, locked: {}, canManage: false });
  }
  const [locked, read, reads] = await Promise.all([readLocks(), readKeys(), readNotes()]);
  return NextResponse.json({ ok: true, locked, read: [...read], reads, canManage: true });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return NextResponse.json({ ok: false, error: "Only marketing and the office can change the File Store." }, { status: 403 });
  let body: { action?: string; key?: string; folder?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  /* A folder (lib/library-files): one more step in the key under the shelf.
     Made by a zero-byte "<folder>/" object so it shows before anything is in
     it; taken away only when it is empty, so no file goes with it unseen. */
  if (body.action === "folder" || body.action === "unfolder") {
    const folder = shelfFolder(body.folder);
    if (!folder) return NextResponse.json({ ok: false, error: "Give the folder a name." }, { status: 400 });
    if (!r2Configured) {
      return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
    }
    const marker = `${SHELF}${folder}/`;
    try {
      if (body.action === "folder") {
        await withR2((c) => c.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: marker, Body: "", ContentType: "application/x-directory" })));
        return NextResponse.json({ ok: true, folder });
      }
      const inside = await withR2((c) => c.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: marker, MaxKeys: 2 })));
      if ((inside.Contents ?? []).some((o) => o.Key && o.Key !== marker)) {
        return NextResponse.json({ ok: false, error: "Only an empty folder can be deleted. Delete what's in it first." }, { status: 409 });
      }
      await withR2((c) => c.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: marker })));
      return NextResponse.json({ ok: true, folder });
    } catch (e) {
      console.error("library folder failed", e);
      return NextResponse.json({ ok: false, error: "Storage didn't do that. Try again." }, { status: 502 });
    }
  }
  const key = String(body.key ?? "");
  if (!key.startsWith(SHELF) || key.includes("..")) {
    return NextResponse.json({ ok: false, error: "That isn't a File Store file." }, { status: 400 });
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "There's no database on this environment." }, { status: 503 });
  }
  const locks = await readLocks();

  if (body.action === "lock") {
    locks[key] = { by: me.name, at: new Date().toISOString() };
    await writeLocks(locks, me.name);
    return NextResponse.json({ ok: true, locked: locks });
  }
  if (body.action === "unlock") {
    delete locks[key];
    await writeLocks(locks, me.name);
    return NextResponse.json({ ok: true, locked: locks });
  }
  if (body.action === "delete") {
    if (locks[key]) {
      return NextResponse.json(
        { ok: false, error: `That file is locked by ${locks[key].by}. Unlock it first.` },
        { status: 409 }
      );
    }
    if (!r2Configured) {
      return NextResponse.json({ ok: false, error: "Storage isn't configured on this environment." }, { status: 503 });
    }
    try {
      await withR2((c) => c.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })));
    } catch (e) {
      console.error("library delete failed", e);
      return NextResponse.json({ ok: false, error: "Storage didn't delete it. Try again." }, { status: 502 });
    }
    await forgetLibraryFile(key);
    return NextResponse.json({ ok: true, locked: locks });
  }
  if (body.action === "read") {
    after(() => readLibraryFile(key, `Read again by ${me.name}`).then(() => undefined));
    return NextResponse.json({ ok: true, locked: locks });
  }
  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
