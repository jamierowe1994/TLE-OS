import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { isScope, R2_BUCKET, r2Configured, safeName, SCOPES, withR2 } from "@/lib/r2";

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

/** Plenty for one record; a record with more than this has a different problem. */
const MAX_KEYS = 100;

export interface StoredFile {
  key: string;
  name: string;
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

  if (!r2Configured) {
    // Not an error the user needs to see — the screen simply shows nothing
    // filed, which is true of an environment with no vault.
    return NextResponse.json({ ok: true, configured: false, files: [] });
  }

  const prefix = `${SCOPES[scopeRaw].prefix}/${ref}/`;

  try {
    const out = await withR2((client) =>
      client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: MAX_KEYS }))
    );
    const files: StoredFile[] = (out.Contents ?? [])
      .filter((o) => o.Key && !o.Key.endsWith("/"))
      .map((o) => {
        const key = o.Key!;
        // Keys are prefix/<timestamp>-<name>; show the human half.
        const tail = key.slice(prefix.length);
        return {
          key,
          name: tail.replace(/^\d+-/, ""),
          size: o.Size ?? 0,
          uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null,
        };
      })
      // Newest first — the current certificate is the one that matters.
      .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));

    return NextResponse.json({ ok: true, configured: true, files });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not read the vault." },
      { status: 502 }
    );
  }
}
