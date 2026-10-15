import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { isScope, R2_BUCKET, r2Configured, r2Problem, safeName, SCOPES, withR2 } from "@/lib/r2";
import { whoIs } from "@/lib/admin";
import { refusal } from "@/lib/r2-access";

/**
 * What's already filed against a record.
 *
 * The missing half of the vault: uploads worked, but nothing ever asked the
 * bucket what was in it, so every attached certificate vanished from the
 * screen on refresh. It was still stored — just invisible, which is the
 * worst of both worlds, because it invites someone to upload it again.
 *
 * Scoped to ONE record's prefix per call (scope + ref), never the whole
 * bucket: a route that can enumerate everything is a route that leaks the
 * whole filing cabinet the first time an access check is wrong.
 *
 * The `ref` is rebuilt through safeName here exactly as it was on the way
 * in, so callers pass the natural reference ("compliance-277172-eicr") and
 * cannot reach a prefix they didn't earn by hand-crafting one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read a page at a time until the record is all read. This was one page of
 * 100, "plenty for one record" - true of a certificate folder, not of the
 * File Store, where Francesca's 101st file simply never appeared (ticket
 * 1a8b37e9, 7 Oct 2026). The ceiling is only a backstop against a runaway.
 */
const PAGE_KEYS = 1000;
const MAX_PAGES = 20;

export interface StoredFile {
  key: string;
  name: string;
  /** The folder under the record it sits in ("" at the top). Only the File
   *  Store files into folders: library/shelf/<folder>/<timestamp>-<name>. */
  folder: string;
  size: number;
  uploadedAt: string | null;
}

export async function GET(req: NextRequest) {
  // Validate BEFORE the configured check, so the route answers the same way
  // on every environment — otherwise a machine without credentials silently
  // accepts requests the real one rejects, and the guards go untested.
  const scopeRaw = String(req.nextUrl.searchParams.get("scope") ?? "document");
  const refRaw = String(req.nextUrl.searchParams.get("ref") ?? "");
  if (!isScope(scopeRaw)) {
    return NextResponse.json({ ok: false, error: "Unknown file type." }, { status: 400 });
  }
  const ref = safeName(refRaw);
  if (!refRaw || !ref) {
    return NextResponse.json({ ok: false, error: "Which record?" }, { status: 400 });
  }
  /* Who is asking, and may they (lib/r2-access, 22 Sep 2026). */
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const no = await refusal(actor, scopeRaw, ref);
  if (no) return NextResponse.json({ ok: false, error: no }, { status: 403 });

  if (!r2Configured) {
    // Not an error the user needs to see — the screen simply shows nothing
    // filed, which is true of an environment with no vault.
    return NextResponse.json({ ok: true, configured: false, files: [] });
  }

  const prefix = `${SCOPES[scopeRaw].prefix}/${ref}/`;

  try {
    const files: StoredFile[] = [];
    /* Folders, including an empty one held by its "<folder>/" marker. */
    const folders = new Set<string>();
    let token: string | undefined;
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const out = await withR2((client) =>
        client.send(
          new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: PAGE_KEYS, ContinuationToken: token })
        )
      );
      for (const o of out.Contents ?? []) {
        if (!o.Key) continue;
        // Keys are prefix/[folder/]<timestamp>-<name>; show the human half.
        const tail = o.Key.slice(prefix.length);
        const cut = tail.lastIndexOf("/");
        const folder = cut > 0 ? tail.slice(0, cut) : "";
        if (folder) folders.add(folder);
        if (o.Key.endsWith("/")) continue;
        files.push({
          key: o.Key,
          name: tail.slice(cut + 1).replace(/^\d+-/, ""),
          folder,
          size: o.Size ?? 0,
          uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null,
        });
      }
      if (!out.IsTruncated || !out.NextContinuationToken) {
        complete = true;
        break;
      }
      token = out.NextContinuationToken;
    }
    // Newest first — the current certificate is the one that matters.
    files.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));

    return NextResponse.json({
      ok: true,
      configured: true,
      files,
      folders: [...folders].sort((a, b) => a.localeCompare(b, "en-GB", { sensitivity: "base" })),
      /* Said rather than hidden, should the backstop ever be reached. */
      ...(complete ? {} : { more: true }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: r2Problem(e, "Could not read the vault.") },
      { status: 502 }
    );
  }
}
