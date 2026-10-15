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
 * So the shelf needs a prefix of its own, and now has one: library/shelf/.
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
 * PDFs, images, GIFs, MP4 and MOV video, Word and PowerPoint, up to 500MB.
 * That list is the `library` scope in lib/r2.ts, which exists precisely so
 * this shelf can take Office files WITHOUT compliance evidence being able to.
 * Anything else is refused by the server, so the limits are stated up front
 * here rather than discovered halfway through an upload.
 *
 * ── Big files go up in pieces (30 Sep 2026) ───────────────────────────────
 *
 * Francesca's 135MB file failed without a word: the old route could never
 * receive more than 10MB. Files now go to /api/r2/library/upload in 8MB
 * pieces with a progress bar, and a file that fails says which and why while
 * the rest carry on. Files can be deleted, and locked so they can't be.
 *
 * ── Steve reads what arrives (13 Oct 2026) ────────────────────────────────
 *
 * A PDF or picture is read once its upload finishes and written up for
 * Steve's marketing library (lib/library-reader), so he can find it and hand
 * it over. Each file says whether he has; one he couldn't read has Read now.
 *
 * ── Folders, and every file (15 Oct 2026, Francesca's ticket) ─────────────
 *
 * The list stopped at 100 files without a word; it now reads the shelf a
 * page at a time until it has all of it. Folders keep a carousel's slides
 * together: a folder is library/shelf/<folder>/ (lib/library-files), so
 * Steve still reads and finds what goes in one. Files already on the shelf
 * stay at the top, where they were.
 */

/** The scope and reference this shelf lives under: library/shelf/… */
const LIBRARY_SCOPE = "library";
const LIBRARY_REF = "shelf";

/** Mirrors the library scope's server-side list — a hint to the file picker,
 *  never the rule. lib/r2.ts is the only thing that decides. */
const ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/quicktime",
  "image/gif",
].join(",");

/** Said before anything is sent, so a file that is too big is told at once. */
const MAX_BYTES = 500 * 1024 * 1024;

type Lock = { by: string; at: string };
type ReadNote = { state: "reading" | "failed" | "skipped"; at: string; note?: string };

/** A read that hasn't finished in ten minutes isn't going to (a deploy cut it off). */
const STALE_MS = 10 * 60 * 1000;

/** One piece, with its progress. XHR rather than fetch: fetch cannot report
 *  how much of an upload has gone. */
function sendPiece(url: string, blob: Blob, onProgress: (sent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => {
      let j: { ok?: boolean; etag?: string; error?: string } = {};
      try {
        j = JSON.parse(x.responseText);
      } catch {
        /* a proxy page, not our answer */
      }
      if (x.status < 300 && j.ok && j.etag) resolve(j.etag);
      else reject(new Error(j.error ?? `The connection dropped (${x.status || "no answer"}). Try again.`));
    };
    x.onerror = () => reject(new Error("The connection dropped. Try again."));
    x.send(blob);
  });
}

async function postJson<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/r2/library/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ ok: false, error: `The server didn't answer (${r.status}). Try again.` }));
  if (!j.ok) throw new Error(j.error ?? "The upload failed. Try again.");
  return j as T;
}

/** One file, start to finish. Each piece gets a second try before giving up. */
async function uploadFile(file: File, folder: string, onProgress: (sent: number) => void): Promise<void> {
  if (file.size > MAX_BYTES) {
    throw new Error(`It is ${(file.size / 1024 / 1024).toFixed(0)}MB, and the limit is 500MB a file.`);
  }
  const { key, uploadId, partSize } = await postJson<{ key: string; uploadId: string; partSize: number }>({
    action: "start",
    folder,
    name: file.name,
    type: file.type,
    size: file.size,
  });
  const parts: { part: number; etag: string }[] = [];
  try {
    for (let i = 0, part = 1; i < file.size; i += partSize, part++) {
      const blob = file.slice(i, i + partSize);
      const url = `/api/r2/library/upload?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&part=${part}`;
      let etag: string;
      try {
        etag = await sendPiece(url, blob, (n) => onProgress(i + n));
      } catch {
        etag = await sendPiece(url, blob, (n) => onProgress(i + n));
      }
      parts.push({ part, etag });
      onProgress(Math.min(i + partSize, file.size));
    }
    await postJson({ action: "complete", key, uploadId, parts });
  } catch (e) {
    await postJson({ action: "abort", key, uploadId }).catch(() => null);
    throw e;
  }
}

interface StoredFile {
  key: string;
  name: string;
  /** "" at the top of the shelf. */
  folder: string;
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

/** The open folder lives in the address (?folder=), so a refresh or the
 *  browser's Back lands where you were. */
function folderInAddress(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("folder") ?? "";
}

export default function Storage() {
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  /** The folder open now; "" is the top of the shelf. */
  const [folder, setFolder] = useState("");
  /** The New folder box: null while closed. */
  const [naming, setNaming] = useState<string | null>(null);
  /** Null while unknown, false when this environment has no vault at all. */
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  /** What is going up now: which file, how far, and how many are left. */
  const [progress, setProgress] = useState<{ name: string; sent: number; total: number; index: number; of: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [locks, setLocks] = useState<Record<string, Lock>>({});
  const [canManage, setCanManage] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [reads, setReads] = useState<Record<string, ReadNote>>({});
  const [working, setWorking] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/r2/list?scope=${LIBRARY_SCOPE}&ref=${LIBRARY_REF}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Could not read the shelf.");
      setConfigured(j.configured !== false);
      setFiles((j.files ?? []).map((f: StoredFile) => ({ ...f, folder: f.folder ?? "" })));
      setFolders(j.folders ?? []);
      setFailed(null);
      const l = await fetch("/api/r2/library", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (l?.ok) {
        setLocks(l.locked ?? {});
        setCanManage(Boolean(l.canManage));
        setRead(new Set<string>(l.read ?? []));
        setReads(l.reads ?? {});
      }
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

  useEffect(() => {
    setFolder(folderInAddress());
    const back = () => setFolder(folderInAddress());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  function openFolder(name: string) {
    setFolder(name);
    setNaming(null);
    setDone(null);
    setUploadErr(null);
    const url = new URL(window.location.href);
    if (name) url.searchParams.set("folder", name);
    else url.searchParams.delete("folder");
    /* A second click on the same folder is not somewhere new to go back from. */
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  }

  /* Made on the server (lib/library-files cleans the name), then opened. A
     name that matches one already there opens that one instead. */
  async function makeFolder() {
    const wanted = (naming ?? "").trim();
    if (!wanted) return;
    const same = folders.find((f) => f.toLowerCase() === wanted.toLowerCase());
    if (same) {
      openFolder(same);
      return;
    }
    setWorking("folder");
    setUploadErr(null);
    try {
      const r = await fetch("/api/r2/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "folder", folder: wanted }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "The server didn't answer." }));
      if (!j.ok) throw new Error(j.error ?? "The folder wasn't made. Try again.");
      setFolders((fs) => [...new Set([...fs, j.folder as string])].sort((a, b) => a.localeCompare(b, "en-GB", { sensitivity: "base" })));
      openFolder(j.folder);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "The folder wasn't made. Try again.");
    } finally {
      setWorking(null);
    }
  }

  async function dropFolder(name: string) {
    if (!window.confirm(`Delete the empty folder ${name}?`)) return;
    setWorking(`folder:${name}`);
    setUploadErr(null);
    try {
      const r = await fetch("/api/r2/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unfolder", folder: name }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "The server didn't answer." }));
      if (!j.ok) throw new Error(j.error ?? "That didn't work.");
      setFolders((fs) => fs.filter((f) => f !== name));
      setDone(`The folder ${name} is deleted.`);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setWorking(null);
    }
  }
  /* How Steve's read of a file stands. A file uploaded in the last few
     minutes with no write-up yet is still being read. */
  function readState(f: StoredFile): { tone: "ok" | "busy" | "bad" | "off"; text: string } | null {
    if (!canManage) return null;
    if (read.has(f.key)) return { tone: "ok", text: "Read by Steve" };
    const n = reads[f.key];
    const age = (iso: string | null | undefined) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
    if (n?.state === "reading" && age(n.at) < STALE_MS) return { tone: "busy", text: "Steve is reading it" };
    if (n?.state === "skipped") return { tone: "off", text: n.note ?? "Not read" };
    if (n?.state === "failed") return { tone: "bad", text: n.note ?? "Steve couldn't read it" };
    if (!n && age(f.uploadedAt) < 3 * 60 * 1000) return { tone: "busy", text: "Steve is reading it" };
    return { tone: "bad", text: "Not read by Steve yet" };
  }

  /* While anything is being read, look again every few seconds. */
  const anyReading = (files ?? []).some((f) => readState(f)?.tone === "busy");
  useEffect(() => {
    if (!anyReading) return;
    const t = window.setInterval(() => void load(), 6000);
    return () => window.clearInterval(t);
  }, [anyReading, load]);

  /* Leaving mid-upload loses it, so the browser asks first. */
  useEffect(() => {
    if (!busy) return;
    const stop = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [busy]);

  async function upload(picked: FileList | null) {
    if (!picked?.length) return;
    const list = Array.from(picked);
    setBusy(true);
    setUploadErr(null);
    setDone(null);
    const failures: string[] = [];
    let ok = 0;
    /* One at a time: a parallel burst turns one slow connection into several
       failed uploads. A file that fails is reported by name and the rest
       carry on, rather than one bad file stopping the batch. */
    for (const [index, file] of list.entries()) {
      setProgress({ name: file.name, sent: 0, total: file.size, index: index + 1, of: list.length });
      try {
        await uploadFile(file, folder, (sent) =>
          setProgress({ name: file.name, sent, total: file.size, index: index + 1, of: list.length })
        );
        ok++;
      } catch (e) {
        failures.push(`${file.name} didn't upload. ${e instanceof Error ? e.message : "The upload failed. Try again."}`);
      }
    }
    setProgress(null);
    setBusy(false);
    if (picker.current) picker.current.value = "";
    if (failures.length) setUploadErr(failures.join(" "));
    if (ok) setDone(`${ok} file${ok === 1 ? "" : "s"} uploaded${folder ? ` to ${folder}` : ""}.`);
    await load();
  }

  async function manage(action: "lock" | "unlock" | "delete" | "read", f: StoredFile) {
    if (action === "delete" && !window.confirm(`Delete ${f.name}? This can't be undone.`)) return;
    setWorking(f.key);
    setUploadErr(null);
    setDone(null);
    try {
      const r = await fetch("/api/r2/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, key: f.key }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "The server didn't answer." }));
      if (!j.ok) throw new Error(j.error ?? "That didn't work.");
      setLocks(j.locked ?? {});
      if (action === "delete") {
        setFiles((fs) => (fs ?? []).filter((x) => x.key !== f.key));
        setDone(`${f.name} deleted.`);
      }
      if (action === "read") {
        setRead((r) => {
          const next = new Set(r);
          next.delete(f.key);
          return next;
        });
        setReads((r) => ({ ...r, [f.key]: { state: "reading", at: new Date().toISOString() } }));
      }
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setWorking(null);
    }
  }

  /* What the open folder holds, and how full each folder is. */
  const shown = files?.filter((f) => f.folder === folder) ?? null;
  const inFolder = new Map<string, number>();
  for (const f of files ?? []) if (f.folder) inFolder.set(f.folder, (inFolder.get(f.folder) ?? 0) + 1);
  const atTop = folder === "";
  const total = files?.length ?? 0;

  return (
    <>
      <PageHeader
        title="File Store"
        blurb="Guides, brochures and anything we've made. The same bucket the rest of the OS uses, so a brochure filed here is the one a deck reaches for."
      />

      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {atTop ? (
              <p className="text-[15px]">The shelf</p>
            ) : (
              <nav aria-label="Where you are" className="flex min-w-0 items-center gap-1.5 text-[15px]">
                <button type="button" onClick={() => openFolder("")} className="shrink-0 text-muted underline-offset-2 hover:text-ink hover:underline">
                  The shelf
                </button>
                <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-muted">
                  <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="flex min-w-0 items-center gap-1.5">
                  <DoodleIcon name="folder" size={15} className="text-accent-dark" />
                  <span className="truncate">{folder}</span>
                </span>
              </nav>
            )}
            <p className="mt-1 text-[12px] text-muted">
              {files === null || shown === null
                ? "Looking…"
                : failed
                  ? "Couldn't read the shelf."
                  : atTop
                    ? `${total} file${total === 1 ? "" : "s"}${folders.length ? ` · ${folders.length} folder${folders.length === 1 ? "" : "s"}` : ""} · PDFs, images, video, Word and PowerPoint, up to 500MB each`
                    : `${shown.length} file${shown.length === 1 ? "" : "s"} in this folder · uploads go into it`}
            </p>
          </div>

          <input
            ref={picker}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <span className="flex shrink-0 flex-wrap gap-2">
            {!atTop && (
              <button
                type="button"
                onClick={() => openFolder("")}
                className="rounded-lg border border-line/80 px-3 py-2 text-[12.5px]"
              >
                Back to the shelf
              </button>
            )}
            {atTop && canManage && configured !== false && (
              <button
                type="button"
                disabled={busy || naming !== null}
                onClick={() => setNaming("")}
                className="flex items-center gap-1.5 rounded-lg border border-line/80 px-3 py-2 text-[12.5px] disabled:opacity-40"
              >
                <DoodleIcon name="folder" size={14} />
                New folder
              </button>
            )}
            <button
              type="button"
              disabled={busy || configured === false}
              onClick={() => picker.current?.click()}
              className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Uploading…" : atTop ? "Upload files" : "Upload to this folder"}
            </button>
          </span>
        </div>

        {naming !== null && (
          <form
            className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line/70 bg-box p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void makeFolder();
            }}
          >
            <label htmlFor="new-folder" className="sr-only">Folder name</label>
            <input
              id="new-folder"
              autoFocus
              value={naming}
              maxLength={60}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
              placeholder="Folder name, e.g. Pro carousel - landlord tips"
              className="min-w-0 flex-1 basis-56 rounded-lg border border-line/80 bg-panel px-3 py-2 text-[13px] outline-none focus:border-ink"
            />
            <span className="flex gap-2">
              <button
                type="submit"
                disabled={!naming.trim() || working === "folder"}
                className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
              >
                {working === "folder" ? "Making it…" : "Make folder"}
              </button>
              <button type="button" onClick={() => setNaming(null)} className="rounded-lg border border-line/80 px-3 py-2 text-[12.5px]">
                Cancel
              </button>
            </span>
          </form>
        )}

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

        {progress && (
          <div className="mt-3 rounded-xl border border-line/70 bg-box p-3" role="status" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="min-w-0 truncate">
                Uploading {progress.name}
                {progress.of > 1 ? ` (${progress.index} of ${progress.of})` : ""}
              </span>
              <span className="shrink-0 text-muted">
                {size(progress.sent)} of {size(progress.total)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/60">
              <div
                className="h-full rounded-full bg-accent-dark transition-[width] duration-300"
                style={{ width: `${progress.total ? Math.round((progress.sent / progress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Keep this page open until it finishes.</p>
          </div>
        )}

        {done && !progress && (
          <p className="mt-3 rounded-xl border border-line/70 bg-box p-3 text-[12px] leading-relaxed">{done}</p>
        )}

        {uploadErr && (
          <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px] leading-relaxed">
            {uploadErr}
          </p>
        )}

        {files === null && (
          <div className="mt-4 space-y-1.5" aria-label="Loading the shelf">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[62px] animate-pulse rounded-xl border border-line/50 bg-box/70" />
            ))}
          </div>
        )}

        {atTop && files !== null && !failed && folders.length > 0 && (
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {folders.map((name) => {
              const n = inFolder.get(name) ?? 0;
              return (
                <li key={name} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openFolder(name)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line/70 p-3 text-left transition-colors hover:border-ink"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-box text-accent-dark">
                      <DoodleIcon name="folder" size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{name}</span>
                      <span className="block text-[11px] text-muted">{n ? `${n} file${n === 1 ? "" : "s"}` : "Empty"}</span>
                    </span>
                    <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-muted">
                      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {canManage && n === 0 && (
                    <button
                      type="button"
                      disabled={working === `folder:${name}`}
                      onClick={() => dropFolder(name)}
                      className="shrink-0 rounded-lg border border-line/80 px-2.5 py-2 text-[12px] disabled:opacity-40"
                      title="Delete this empty folder"
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {shown !== null && shown.length === 0 && !failed && configured !== false && (atTop ? folders.length === 0 : true) && (
          <p className="mt-4 text-[12.5px] text-muted">
            {atTop
              ? "Nothing filed yet. Anything you put here is available to the rest of the OS."
              : "Nothing in this folder yet. Upload to this folder puts files here, and Steve reads them as he does the rest."}
          </p>
        )}

        {shown !== null && shown.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {atTop && folders.length > 0 && (
              <li className="pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Not in a folder</li>
            )}
            {shown.map((f) => (
              /* On a phone the buttons go under the file rather than
                 squeezing its name down to a few letters. */
              <li key={f.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                {/* A plain link, because /api/r2/file signs a five-minute URL and
                    redirects to it — the bucket itself stays private. */}
                <a
                  href={`/api/r2/file?key=${encodeURIComponent(f.key)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 basis-full items-center gap-3 rounded-xl border border-line/70 p-3 transition-colors hover:border-ink sm:basis-auto"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-box text-muted">
                    <DoodleIcon name="doc" size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{f.name}</span>
                    <span className="block text-[11px] text-muted">
                      {size(f.size)}
                      {f.uploadedAt ? ` · ${when(f.uploadedAt)}` : ""}
                      {locks[f.key] ? ` · Locked by ${locks[f.key].by}` : ""}
                    </span>
                    {(() => {
                      const r = readState(f);
                      if (!r) return null;
                      return (
                        <span className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${r.tone === "bad" ? "text-accent-dark" : "text-muted"}`}>
                          {r.tone === "busy" ? (
                            <span aria-hidden className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                          ) : r.tone === "ok" ? (
                            <svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 text-accent-dark">
                              <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <DoodleIcon name="info" size={11} />
                          )}
                          {r.text}
                        </span>
                      );
                    })()}
                  </span>
                </a>
                {canManage && (
                  <span className="ml-auto flex shrink-0 gap-1.5">
                    {readState(f)?.tone === "bad" && (
                      <button
                        type="button"
                        disabled={working === f.key}
                        onClick={() => manage("read", f)}
                        className="rounded-lg border border-line/80 px-2.5 py-2 text-[12px] disabled:opacity-40"
                        title="Have Steve read it now"
                      >
                        Read now
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={working === f.key}
                      onClick={() => manage(locks[f.key] ? "unlock" : "lock", f)}
                      className="rounded-lg border border-line/80 px-2.5 py-2 text-[12px] disabled:opacity-40"
                      title={locks[f.key] ? "Unlock so it can be deleted" : "Lock so it can't be deleted"}
                    >
                      {locks[f.key] ? "Unlock" : "Lock"}
                    </button>
                    <button
                      type="button"
                      disabled={working === f.key || Boolean(locks[f.key])}
                      onClick={() => manage("delete", f)}
                      className="rounded-lg border border-line/80 px-2.5 py-2 text-[12px] disabled:opacity-40"
                      title={locks[f.key] ? "Locked. Unlock it first." : "Delete"}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
