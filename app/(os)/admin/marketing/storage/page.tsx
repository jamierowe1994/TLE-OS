"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The File Store — Francesca's shelf of guides, brochures and anything made.
 *
 * ── It was asking the vault a question it refuses to answer ───────────────
 *
 * This page counted files by calling /api/r2/list with no parameters. That
 * route is scoped to one prefix per call ON PURPOSE — a route that can
 * enumerate the whole bucket leaks the entire filing cabinet the first time an
 * access check is wrong — so a bare call is answered with 400 "Which record?".
 * The page read that as a dead bucket and had been printing "Couldn't reach the
 * bucket" since the day it was written, on a bucket that was perfectly healthy.
 *
 * So the shelf needs a prefix of its own, and now has one: documents/library/.
 * Everything here is uploaded to and listed from that single reference, which
 * keeps the scoping guarantee intact rather than punching a hole in it.
 *
 * ── Why it goes to the same bucket as everything else ─────────────────────
 *
 * Deliberately not a separate store. A brochure Francesca uploads here is the
 * brochure a landlord deck reaches for, and two buckets means two answers to
 * "where is the current one".
 *
 * ── What it will not take ─────────────────────────────────────────────────
 *
 * PDFs and images, up to 25MB, because those are the types the document scope
 * allows in lib/r2.ts. A Word or PowerPoint file is refused BY THE SERVER, so
 * the limit is stated up front here rather than discovered halfway through an
 * upload. Widening it is a change to SCOPES, and James's call — the bucket
 * holds right-to-rent evidence as well as brochures.
 */

/** The one reference this shelf lives under. */
const LIBRARY_REF = "library";

interface StoredFile {
  key: string;
  name: string;
  size: number;
  uploadedAt: string | null;
}

const KB = 1024;
function size(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Storage() {
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  /** Null while unknown, false when this environment has no vault at all. */
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/r2/list?scope=document&ref=${LIBRARY_REF}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Could not read the shelf.");
      setConfigured(j.configured !== false);
      setFiles(j.files ?? []);
      setFailed(null);
    } catch (e) {
      /* Say which failed. "No files" and "could not look" are different facts
         and only one of them means somebody should do something. */
      setFailed(e instanceof Error ? e.message : "Could not read the shelf.");
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(picked: FileList | null) {
    if (!picked?.length) return;
    setBusy(true);
    setUploadErr(null);
    try {
      /* One at a time rather than Promise.all: these are up to 25MB each and a
         parallel burst is how you turn a slow connection into several failed
         uploads instead of one slow one. */
      for (const file of Array.from(picked)) {
        const body = new FormData();
        body.set("file", file);
        body.set("scope", "document");
        body.set("ref", LIBRARY_REF);
        const res = await fetch("/api/r2/upload", { method: "POST", body });
        const j = await res.json();
        if (!j.ok) throw new Error(`${file.name}: ${j.error ?? "upload failed"}`);
      }
      await load();
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        title="File Store"
        blurb="Guides, brochures and anything we've made. The same bucket the rest of the OS uses, so a brochure filed here is the one a deck reaches for."
      />

      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px]">The shelf</p>
            <p className="mt-1 text-[12px] text-muted">
              {files === null
                ? "Looking…"
                : failed
                  ? "Couldn't read the shelf."
                  : `${files.length} file${files.length === 1 ? "" : "s"} · PDFs and images, up to 25MB each`}
            </p>
          </div>

          <input
            ref={picker}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <button
            type="button"
            disabled={busy || configured === false}
            onClick={() => picker.current?.click()}
            className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Upload files"}
          </button>
        </div>

        {configured === false && (
          <p className="mt-3 rounded-xl border border-line/70 bg-box p-3 text-[12px] leading-relaxed text-muted">
            There&apos;s no file storage on this environment, so nothing can be uploaded
            here. On the live site this is Cloudflare R2, EU jurisdiction.
          </p>
        )}

        {failed && (
          <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px] leading-relaxed">
            {failed}
          </p>
        )}

        {uploadErr && (
          <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px] leading-relaxed">
            {uploadErr}
          </p>
        )}

        {files !== null && files.length === 0 && !failed && configured !== false && (
          <p className="mt-4 text-[12.5px] text-muted">
            Nothing filed yet. Anything you put here is available to the rest of the OS.
          </p>
        )}

        {files !== null && files.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {files.map((f) => (
              <li key={f.key}>
                {/* A plain link, because /api/r2/file signs a five-minute URL and
                    redirects to it — the bucket itself stays private. */}
                <a
                  href={`/api/r2/file?key=${encodeURIComponent(f.key)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-line/70 p-3 transition-colors hover:border-ink"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-box text-muted">
                    <DoodleIcon name="doc" size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{f.name}</span>
                    <span className="block text-[11px] text-muted">
                      {size(f.size)}
                      {f.uploadedAt ? ` · ${when(f.uploadedAt)}` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
