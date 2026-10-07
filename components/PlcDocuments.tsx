"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import {
  CHECK_GROUPS,
  COVERABLE,
  gateOf,
  groupOf,
  guessCheck,
  PLC_CHECKS,
  checkById,
  type CheckId,
  type FileRead,
  type PlcCase,
  type PlcDocument,
} from "@/lib/plc";

/**
 * The two document screens of the PLC wizard: Landlord Documents and Tenant
 * Documents.
 *
 * ── Drop the folder, not the files (James, 6 Oct 2026) ──────────────────────
 *
 * Walking Rhiannon's room at 5b Newton Road through the old screens: nine
 * boxes, a dropdown per file, no PAT slot, no preview, no way back. Agents
 * keep a folder per let. So the folder is the unit: drop it (or pick it), and
 * every file in it is uploaded, READ, and filed under the check it belongs to
 * with the dates on it shown. The agent's job becomes checking the sort, not
 * doing it.
 *
 * A file goes where it belongs whichever screen it was dropped on. A tenant's
 * referencing report dropped with the landlord's folder is filed under Tenant
 * checks and the screen says so, rather than refusing it or filing it wrong.
 *
 * ── Three at a time, filed one at a time ────────────────────────────────────
 *
 * Upload and read run three files in parallel: a folder of twenty would
 * otherwise take minutes. Filing is strictly one after another, because each
 * filing answers with the whole case and five in flight together means the
 * last answer overwrites the other four.
 */

type Row = {
  id: string;
  file: File;
  /** The check the agent forced by pressing Add on a row, if any. */
  forced: CheckId | null;
  state: "waiting" | "uploading" | "reading" | "filing" | "done" | "failed" | "skipped";
  /** Where it ended up, once filed. */
  filedAs?: CheckId;
  error?: string;
  preview?: string;
};

const PARALLEL = 3;

/** SHA-256 of a file, hex. Null where the browser will not do it (an insecure origin). */
async function hashOf(file: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** What can go on a pack: a PDF or a photograph. Everything else is skipped, said so. */
const OK_TYPE = /^(application\/pdf|image\/(jpeg|png|webp|heic))$/;
const OK_NAME = /\.(pdf|jpe?g|png|webp|heic)$/i;
const isImageName = (n: string) => /\.(jpe?g|png|webp|gif)$/i.test(n);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `That didn't work (${res.status}).`);
  return body as T;
}

/**
 * Every file under whatever was dropped, folders walked all the way down.
 * The entries have to be taken from the event before the first await - the
 * browser empties the drop's item list once the handler returns.
 */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => Boolean(e));
  if (!entries.length) return Array.from(dt.files ?? []);
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
      return;
    }
    if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      /* readEntries hands back a page at a time (100 in Chrome) until empty. */
      for (;;) {
        const page = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!page.length) break;
        for (const p of page) await walk(p);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

const pretty = (ymd: string | null | undefined) =>
  ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** The one line under a filed document: what the reader saw, and the date that matters. */
function readLine(d: PlcDocument, moveIn: string | null): { text: string; warn: boolean } | null {
  const r = d.read;
  if (!r) return null;
  const bits: string[] = [];
  if (r.what) bits.push(r.what);
  if (r.expiryDate) bits.push(`valid until ${pretty(r.expiryDate)}${r.expiryDerived ? " (worked out)" : ""}`);
  else if (r.issueDate) bits.push(`dated ${pretty(r.issueDate)}`);
  if (r.names.length && !r.expiryDate) bits.push(r.names.slice(0, 3).join(", "));
  const expiresFirst = Boolean(r.expiryDate && moveIn && r.expiryDate < moveIn);
  if (expiresFirst) bits.push("runs out before the move-in date");
  if (r.note && !expiresFirst) bits.push(r.note.replace(/\.$/, ""));
  return bits.length ? { text: bits.join(" · "), warn: expiresFirst } : null;
}

function Thumb({ name, url, preview }: { name: string; url?: string; preview?: string }) {
  const src = preview ?? (url && url !== "#" && isImageName(name) ? url : null);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className="h-12 w-10 shrink-0 rounded border border-line object-cover" />;
  }
  return (
    <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded border border-line bg-box text-[10px] uppercase tracking-wide text-muted">
      {(name.split(".").pop() ?? "file").slice(0, 4)}
    </span>
  );
}

export default function PlcDocuments({
  step,
  kase,
  onChanged,
  context,
  focus,
  demo,
}: {
  step: "landlord" | "tenant";
  kase: PlcCase;
  onChanged: (c: PlcCase) => void;
  /** Who is who, so the reader can tell the landlord's passport from a tenant's. */
  context: { tenants: string[]; landlord: string | null };
  /** A check the review screen sent the agent here to fill. */
  focus?: CheckId | null;
  /** Attach for show: nothing is uploaded, read or recorded. */
  demo?: boolean;
}) {
  const group = CHECK_GROUPS.find((g) => g.id === step)!;
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const filesInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const addInput = useRef<HTMLInputElement | null>(null);
  const forceNext = useRef<CheckId | null>(null);
  const depth = useRef(0);
  const running = useRef(0);
  /* Started once, however many times React runs the effect below. */
  const started = useRef(new Set<string>());
  const filing = useRef<Promise<unknown>>(Promise.resolve());
  /* The newest case, for the filing chain: a closure would file against the
     case as it stood when the file was dropped. */
  const latest = useRef(kase);
  latest.current = kase;
  const counter = useRef(0);
  /* Contents already claimed by a file in this drop, so the same PDF twice in
     one folder is caught before either has been filed. */
  const claimed = useRef(new Map<string, string>());

  const update = (id: string, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const take = useCallback((files: File[], forced: CheckId | null = null) => {
    const fresh: Row[] = [];
    for (const file of files) {
      /* .DS_Store, Thumbs.db and the like: never worth a line. */
      if (file.name.startsWith(".") || /^thumbs\.db$/i.test(file.name)) continue;
      const ok = OK_TYPE.test(file.type) || OK_NAME.test(file.name);
      counter.current += 1;
      fresh.push({
        id: `f${counter.current}`,
        file,
        forced,
        state: ok ? "waiting" : "skipped",
        error: ok ? undefined : "Skipped - only PDFs and photos can go on a pack.",
        preview: ok && file.type.startsWith("image/") && file.type !== "image/heic" ? URL.createObjectURL(file) : undefined,
      });
    }
    if (fresh.length) setRows((r) => [...fresh, ...r]);
  }, []);

  /* The whole window is the target: a drop two pixels outside the box must not
     silently do nothing. Folders are walked here. */
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth.current += 1;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const dragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      void filesFromDrop(e.dataTransfer).then((files) => take(files));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", dragOver);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", dragOver);
      window.removeEventListener("drop", drop);
    };
  }, [take]);

  /** Upload, read, then queue the filing behind whatever is already filing. */
  const process = async (row: Row) => {
    const c = latest.current;
    try {
      let key = "";
      let name = row.file.name;
      let placeholder = false;
      let read: FileRead | null = null;

      /* Never the same file twice (Michael, 7 Oct 2026). Same contents as a
         file already on the pack, or in this drop: skipped, and it says where
         the first one is. A pack filed before contents were recorded is
         matched on the file name instead. */
      const hash = demo ? null : await hashOf(row.file);
      const docs = latest.current.documents;
      const twin = (hash && docs.find((d) => d.hash === hash)) || docs.find((d) => !d.hash && d.name === row.file.name);
      if (twin) {
        update(row.id, { state: "skipped", error: `Already on the pack as "${twin.name}" under ${checkById(twin.checkId)?.label ?? "Anything else"}.` });
        return;
      }
      if (hash) {
        const first = claimed.current.get(hash);
        if (first && first !== row.id) {
          update(row.id, { state: "skipped", error: "The same file is in this drop twice, so it was added once." });
          return;
        }
        claimed.current.set(hash, row.id);
      }

      if (demo) {
        placeholder = true;
        key = `documents/sample/${name.replace(/[^\w.\- ]+/g, "")}`;
      } else {
        update(row.id, { state: "uploading" });
        const form = new FormData();
        form.append("file", row.file);
        form.append("scope", "document");
        form.append("ref", c.id);
        const up = await fetch("/api/r2/upload", { method: "POST", body: form });
        const stored = await up.json().catch(() => ({}));
        if (up.ok && stored.ok) {
          key = stored.key;
          name = stored.name;
        } else if (up.status === 503) {
          /* No bucket on this machine: recorded by name, flagged all the way down. */
          key = `documents/${c.id}/${row.file.name.replace(/[^\w.\- ]+/g, "")}`;
          placeholder = true;
        } else if (up.status === 413) {
          throw new Error("Too big to upload. Split it, or save a smaller copy.");
        } else {
          throw new Error(stored.error ?? "The upload failed.");
        }
        if (!placeholder) {
          update(row.id, { state: "reading" });
          try {
            const r = await api<{ read: FileRead }>(`/api/plc/${c.id}/read`, {
              method: "POST",
              body: JSON.stringify({ key, name, tenants: context.tenants, landlord: context.landlord }),
            });
            read = r.read;
          } catch {
            read = null;
          }
        }
      }

      const checkId: CheckId = row.forced ?? read?.checkId ?? guessCheck(name) ?? "other";
      update(row.id, { state: "filing" });
      await (filing.current = filing.current.then(async () => {
        if (demo) {
          const doc: PlcDocument = {
            checkId,
            name,
            key,
            url: "#",
            addedAt: new Date().toISOString(),
            addedBy: latest.current.agentName,
            placeholder: true,
          };
          const next = { ...latest.current, documents: [...latest.current.documents, doc] };
          latest.current = next;
          onChanged(next);
          return;
        }
        const res = await api<{ case: PlcCase }>(`/api/plc/${c.id}/documents`, {
          method: "POST",
          body: JSON.stringify({ checkId, name, key, placeholder, read, hash }),
        });
        latest.current = res.case;
        onChanged(res.case);
      }));
      update(row.id, { state: "done", filedAs: checkId });
    } catch (e) {
      const message = (e as Error).message;
      update(row.id, { state: /^Already on the pack/.test(message) ? "skipped" : "failed", error: message });
    }
  };

  /* Start the next waiting file whenever a slot is free. */
  useEffect(() => {
    const waiting = rows.filter((r) => r.state === "waiting" && !started.current.has(r.id));
    while (running.current < PARALLEL && waiting.length) {
      const next = waiting.shift()!;
      started.current.add(next.id);
      running.current += 1;
      update(next.id, { state: "uploading" });
      void process(next).finally(() => {
        running.current -= 1;
        setRows((r) => [...r]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /* Object URLs are freed when the screen goes. */
  useEffect(() => () => rows.forEach((r) => r.preview && URL.revokeObjectURL(r.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sent here from the review screen to fill one check: scroll to it. */
  useEffect(() => {
    if (!focus) return;
    window.setTimeout(() => document.getElementById(`check-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
  }, [focus]);

  const move = async (d: PlcDocument, to: CheckId) => {
    setErr(null);
    if (demo) {
      onChanged({ ...kase, documents: kase.documents.map((x) => (x.key === d.key ? { ...x, checkId: to } : x)) });
      return;
    }
    setBusyKey(d.key);
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}/documents`, {
        method: "PATCH",
        body: JSON.stringify({ key: d.key, checkId: to }),
      });
      onChanged(res.case);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (d: PlcDocument) => {
    setErr(null);
    if (demo) {
      onChanged({ ...kase, documents: kase.documents.filter((x) => x.key !== d.key) });
      return;
    }
    setBusyKey(d.key);
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}/documents?key=${encodeURIComponent(d.key)}`, {
        method: "DELETE",
      });
      onChanged(res.case);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  /* A reference report that carries the Right to Rent check too: ticked here,
     and the Right to Rent line reads as covered. */
  const setCovers = async (d: PlcDocument, covers: CheckId[]) => {
    setErr(null);
    if (demo) {
      onChanged({ ...kase, documents: kase.documents.map((x) => (x.key === d.key ? { ...x, covers } : x)) });
      return;
    }
    setBusyKey(d.key);
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}/documents`, {
        method: "PATCH",
        body: JSON.stringify({ key: d.key, covers }),
      });
      onChanged(res.case);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  const addTo = (id: CheckId) => {
    forceNext.current = id;
    addInput.current?.click();
  };

  const inFlight = rows.filter((r) => ["waiting", "uploading", "reading", "filing"].includes(r.state));
  const problems = rows.filter((r) => r.state === "failed" || r.state === "skipped");
  const done = rows.filter((r) => r.state === "done");
  const elsewhere = done.filter((r) => r.filedAs && r.filedAs !== "other" && groupOf(r.filedAs) !== step);
  const unsorted = kase.documents.filter((d) => d.checkId === "other");
  const checks = PLC_CHECKS.filter((c) => group.checks.includes(c.id));
  const otherStep = CHECK_GROUPS.find((g) => g.id !== step)!;

  const badge = (id: CheckId) => {
    const g = gateOf(checkById(id)!, kase.letType);
    if (g === "required") return { text: "Needed", tone: "text-rose-700" };
    if (g === "conditional") return { text: "Needed, or say why not", tone: "text-amber-700" };
    if (g === "after") return { text: "After the check", tone: "text-muted" };
    if (g === "manual") return { text: "Checked separately", tone: "text-muted" };
    return { text: "If you have it", tone: "text-muted" };
  };

  const docRow = (d: PlcDocument) => {
    const line = readLine(d, kase.moveInDate);
    return (
      <li key={d.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2">
        <Thumb name={d.name} url={d.url} />
        <div className="min-w-0 flex-1 basis-40">
          {d.url && d.url !== "#" ? (
            <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-ink hover:underline">
              {d.name}
            </a>
          ) : (
            <span className="block truncate text-sm">{d.name}</span>
          )}
          {line ? (
            <span className={`block truncate text-xs ${line.warn ? "text-rose-700" : "text-muted"}`}>{line.text}</span>
          ) : d.placeholder ? (
            <span className="block text-xs text-amber-700">Recorded by name only</span>
          ) : null}
        </div>
        {(COVERABLE[d.checkId] ?? []).length > 0 && (
          <div className="order-last flex w-full flex-wrap gap-x-4 gap-y-1 pl-[3.25rem]">
            {(COVERABLE[d.checkId] ?? []).map((other) => {
              const on = Boolean(d.covers?.includes(other));
              return (
                <label key={other} className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busyKey === d.key}
                    onChange={() => void setCovers(d, on ? (d.covers ?? []).filter((x) => x !== other) : [...(d.covers ?? []), other])}
                    className="h-3.5 w-3.5 accent-[#56634a]"
                  />
                  This report covers {checkById(other)?.label ?? other} too
                </label>
              );
            })}
          </div>
        )}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <select
            value={d.checkId}
            disabled={busyKey === d.key}
            onChange={(e) => void move(d, e.target.value as CheckId)}
            aria-label="Move to another check"
            className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1 text-xs sm:w-[9.5rem] sm:flex-none"
          >
            {PLC_CHECKS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void remove(d)}
            disabled={busyKey === d.key}
            aria-label={`Take ${d.name} off the pack`}
            className="shrink-0 rounded-md px-1.5 py-1 text-muted transition hover:bg-box hover:text-ink disabled:opacity-40"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </li>
    );
  };

  return (
    <div>
      <p className="text-sm text-muted">{group.blurb}</p>

      <div
        className={`relative mt-5 flex min-h-[13rem] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          over ? "border-accent bg-accent-soft" : "border-line"
        }`}
      >
        <DoodleIcon
          name={step === "landlord" ? "home" : "file-contract"}
          size={104}
          className="pointer-events-none absolute text-ink opacity-[0.06]"
        />
        <p className="relative text-base text-ink">{over ? "Let go" : "Drop the whole folder here"}</p>
        <p className="relative mx-auto mt-1 max-w-md text-sm text-muted">
          Every file is read, sorted into the right check, and its dates pulled out for you to check. Anything for the{" "}
          {otherStep.title.toLowerCase()} goes there by itself.
        </p>
        <div className="relative mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className="rounded-lg border border-ink bg-ink px-3.5 py-2 text-sm text-white transition hover:border-accent hover:bg-accent"
          >
            Choose a folder
          </button>
          <button
            type="button"
            onClick={() => filesInput.current?.click()}
            className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm transition hover:bg-box"
          >
            Choose files
          </button>
        </div>
        <input
          ref={filesInput}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            take(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            take(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={addInput}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            take(Array.from(e.target.files ?? []), forceNext.current);
            forceNext.current = null;
            e.target.value = "";
          }}
        />
      </div>

      {(inFlight.length > 0 || problems.length > 0 || done.length > 0) && (
        <div className="mt-4 space-y-2">
          {done.length > 0 && inFlight.length === 0 && (
            <p className="text-sm text-emerald-700">
              Sorted {done.length === 1 ? "1 file" : `${done.length} files`}.
              {elsewhere.length > 0 &&
                ` ${elsewhere.length === 1 ? "1 went" : `${elsewhere.length} went`} to ${otherStep.title}.`}{" "}
              Check each one below is where it should be.
            </p>
          )}
          {[...inFlight, ...problems].length > 0 && (
            <ul className="space-y-1.5">
              {[...inFlight, ...problems].map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <Thumb name={r.file.name} preview={r.preview} />
                  <span className="min-w-0 flex-1 truncate">{r.file.name}</span>
                  <span
                    className={`shrink-0 text-xs ${
                      r.state === "failed" ? "text-rose-700" : r.state === "skipped" ? "text-muted" : "text-muted"
                    }`}
                  >
                    {r.state === "waiting" && "Waiting"}
                    {r.state === "uploading" && "Uploading…"}
                    {r.state === "reading" && "Reading…"}
                    {r.state === "filing" && "Filing…"}
                    {(r.state === "failed" || r.state === "skipped") && r.error}
                  </span>
                  {r.state === "failed" && (
                    <button
                      type="button"
                      onClick={() => {
                        started.current.delete(r.id);
                        update(r.id, { state: "waiting", error: undefined });
                      }}
                      className="shrink-0 text-xs underline hover:text-ink"
                    >
                      Try again
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {err && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      )}

      {step === "landlord" && unsorted.length > 0 && (
        <div id="check-other" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            {unsorted.length === 1 ? "One file" : `${unsorted.length} files`} we could not sort. Pick where each one goes,
            or leave it under Anything else.
          </p>
          <ul className="mt-2 space-y-1.5">{unsorted.map(docRow)}</ul>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {checks.map((c) => {
          const filed = kase.documents.filter((d) => d.checkId === c.id);
          const coveredBy = kase.documents.filter((d) => d.checkId !== c.id && d.covers?.includes(c.id));
          const has = filed.length > 0 || coveredBy.length > 0;
          const b = badge(c.id);
          return (
            <li
              key={c.id}
              id={`check-${c.id}`}
              className={`rounded-xl border px-3 py-2.5 transition ${focus === c.id ? "border-accent" : "border-line"}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 self-center rounded-full ${has ? "bg-emerald-500" : "bg-neutral-300"}`}
                />
                <span className={`text-sm ${has ? "text-ink" : ""}`}>{c.label}</span>
                <span className={`text-xs ${has ? "text-emerald-700" : b.tone}`}>
                  {filed.length
                    ? filed.length === 1 ? "1 file" : `${filed.length} files`
                    : coveredBy.length
                      ? `Covered by the ${checkById(coveredBy[0].checkId)?.label.toLowerCase() ?? "report"}`
                      : b.text}
                </span>
                <button
                  type="button"
                  onClick={() => addTo(c.id)}
                  className="ml-auto text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Add
                </button>
              </div>
              {filed.length ? (
                <ul className="mt-2 space-y-1.5">{filed.map(docRow)}</ul>
              ) : coveredBy.length ? (
                <p className="mt-0.5 pl-5 text-xs text-muted">
                  In {coveredBy.map((d) => `"${d.name}"`).join(", ")}. Add its own document too if you have one.
                </p>
              ) : (
                <p className="mt-0.5 pl-5 text-xs text-muted">{c.needs}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
