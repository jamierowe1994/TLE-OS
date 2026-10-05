"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DOC_ACCEPT, DOC_TYPES, OTHER, SIDE_LABEL, docTypeLabel, type DocSide } from "@/lib/doc-types";

/**
 * DOCUMENTS ON ANY FILE (James, 5 Oct 2026).
 *
 * Press Upload, pick what it is (Kirstie's list, or Other and name it), choose
 * the file, press Upload. It is kept against the HOME (lib/file-documents), so
 * what Kirstie adds on her deal is on the agent's listing and application for
 * the same address, and the other way round. Nothing is sent to anybody.
 *
 * Below what is held, the types not on file yet sit as dashed outlines - the
 * way the office's old system shows them - and pressing one opens the upload
 * with that type already picked.
 */

export type FromKind = "deal" | "listing" | "application" | "appraisal" | "viewing";

type Doc = {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  byName: string;
  at: string;
  from: { kind: FromKind; id: string; label: string };
  url: string;
  canRemove: boolean;
};

const SIDES: DocSide[] = ["tenant", "landlord", "home"];

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

export default function FileDocuments({
  address,
  propertyId,
  from,
  sides = SIDES,
  showMissing = true,
}: {
  address: string;
  propertyId?: string | number | null;
  from: { kind: FromKind; id: string | number };
  /** Which of Kirstie's groups to offer; every one by default. */
  sides?: DocSide[];
  /** The dashed "not on file yet" boxes. */
  showMissing?: boolean;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState<string | null | false>(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const prop = propertyId != null && String(propertyId).trim() ? String(propertyId) : "";
  const query = `address=${encodeURIComponent(address)}&property=${encodeURIComponent(prop)}`;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await fetch(`/api/documents?${query}`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; docs?: Doc[] };
      if (!r.ok || !j.ok) throw new Error();
      setDocs(j.docs ?? []);
    } catch {
      setFailed(true);
    }
  }, [query]);

  useEffect(() => {
    setDocs(null);
    setSaid(null);
    void load();
  }, [load]);

  async function upload(file: File, type: string, name: string): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    fd.append("name", name);
    fd.append("address", address);
    fd.append("property", prop);
    fd.append("from", from.kind);
    fd.append("fromId", String(from.id));
    try {
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; docs?: Doc[]; error?: string } | null;
      if (!r.ok || !j?.ok) return j?.error ?? "That did not upload. Try again.";
      setDocs(j.docs ?? []);
      setUploading(false);
      setSaid({ ok: true, text: `${type === OTHER ? name : docTypeLabel(type)} is on the file. Nobody has been sent it.` });
      return null;
    } catch {
      return "That did not upload. Check the connection and try again.";
    }
  }

  async function remove(id: string) {
    setConfirming(null);
    try {
      const r = await fetch(`/api/documents?id=${encodeURIComponent(id)}&${query}`, { method: "DELETE" });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; docs?: Doc[]; error?: string } | null;
      if (!r.ok || !j?.ok) {
        setSaid({ ok: false, text: j?.error ?? "That could not be taken off. Try again." });
        return;
      }
      setDocs(j.docs ?? []);
      setSaid({ ok: true, text: "Taken off the file." });
    } catch {
      setSaid({ ok: false, text: "That could not be taken off. Try again." });
    }
  }

  if (!address.trim() && !prop) {
    return <p className="text-[12.5px] text-muted">This file has no address yet, so documents have nowhere to go.</p>;
  }

  const held = new Set((docs ?? []).map((d) => d.type));
  const missing = DOC_TYPES.filter((t) => sides.includes(t.side) && !held.has(t.key));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] leading-snug text-muted">
          Kept on this home, so the office and the agent both see them. Uploading sends nothing to the landlord or tenant.
        </p>
        {uploading === false ? (
          <button
            type="button"
            onClick={() => { setSaid(null); setUploading(null); }}
            className="btn-press flex items-center gap-2 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page"
          >
            <DoodleIcon name="upload" size={13} />
            Upload
          </button>
        ) : null}
      </div>

      {uploading !== false ? (
        <UploadForm
          sides={sides}
          initialType={uploading}
          onUpload={upload}
          onCancel={() => setUploading(false)}
        />
      ) : null}

      {said ? (
        <p className={`mb-3 text-[11.5px] leading-snug ${said.ok ? "text-muted" : "text-accent-dark"}`} aria-live="polite">
          {said.ok ? <span aria-hidden className="mr-1 text-[#1e7a3c]">✓</span> : null}
          {said.text}
        </p>
      ) : null}

      {docs == null && !failed ? (
        <p className="flex items-center gap-2.5 py-3 text-[12.5px] text-muted">
          <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Fetching the documents...
        </p>
      ) : failed ? (
        <p className="py-2 text-[12.5px] text-accent-dark">
          The documents could not be read just now.{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Try again</button>
        </p>
      ) : (
        <>
          {docs!.length ? (
            <ul className="divide-y divide-line/50 rounded-[18px] border border-line/60 bg-white">
              {docs!.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <DoodleIcon name="doc" size={16} className="shrink-0 text-accent-dark" />
                  <span className="min-w-0 flex-1">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-semibold hover:underline">
                      {d.name}
                    </a>
                    <span className="block truncate text-[11px] text-muted">
                      {d.type === OTHER ? "Other · " : ""}
                      {d.fileName} · {d.byName}, {when(d.at)}
                      {d.from.kind !== from.kind || d.from.id !== String(from.id) ? ` · added on the ${d.from.label.toLowerCase()}` : ""}
                    </span>
                  </span>
                  {d.canRemove ? (
                    confirming === d.id ? (
                      <span className="flex shrink-0 items-center gap-2 text-[11.5px]">
                        <button type="button" onClick={() => void remove(d.id)} className="font-semibold text-accent-dark hover:underline">Take it off</button>
                        <button type="button" onClick={() => setConfirming(null)} className="text-muted hover:text-ink">Keep</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(d.id)}
                        aria-label={`Take ${d.name} off the file`}
                        title="Take it off the file"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-page hover:text-ink"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-[12.5px] text-muted">No documents on this home yet.</p>
          )}

          {showMissing && missing.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Not on file yet</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {missing.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setSaid(null); setUploading(t.key); }}
                    className="rounded-xl border border-dashed border-line px-3.5 py-2.5 text-left text-[12.5px] text-muted transition hover:border-ink/40 hover:text-ink"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Pick what it is, choose the file, press Upload. Shared with the lead drawer,
 * which keeps its own store: `onUpload` does the sending and answers with an
 * error sentence, or null when it landed.
 */
export function UploadForm({
  sides = SIDES,
  initialType = null,
  onUpload,
  onCancel,
}: {
  sides?: DocSide[];
  initialType?: string | null;
  onUpload: (file: File, type: string, name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<string | null>(initialType);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => setType(initialType), [initialType]);

  const ready = !!type && !!file && (type !== OTHER || name.trim().length > 0) && !busy;

  async function go() {
    if (!ready || !type || !file) return;
    setBusy(true);
    setError(null);
    const err = await onUpload(file, type, name.trim());
    setBusy(false);
    if (err) setError(err);
  }

  const chip = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setType(key)}
      aria-pressed={type === key}
      className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
        type === key ? "border-accent-dark bg-accent-soft/70 font-semibold text-ink" : "border-line text-ink/80 hover:border-ink/40"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mb-4 rounded-[18px] border border-line/70 bg-white p-4">
      <p className="text-[12.5px] font-semibold">What is it?</p>
      <div className="mt-2 space-y-2.5">
        {sides.map((s) => {
          const list = DOC_TYPES.filter((t) => t.side === s);
          return list.length ? (
            <div key={s}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{SIDE_LABEL[s]}</p>
              <div className="flex flex-wrap gap-1.5">{list.map((t) => chip(t.key, t.label))}</div>
            </div>
          ) : null;
        })}
        <div className="flex flex-wrap gap-1.5">{chip(OTHER, "Other")}</div>
      </div>

      {type === OTHER ? (
        <label className="mt-3 block">
          <span className="text-[12px] font-semibold">Name it</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="e.g. Inventory, Pet agreement"
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-ink"
          />
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={DOC_ACCEPT}
          className="hidden"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="btn-press max-w-full truncate rounded-full border border-line px-3.5 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
        >
          {file ? file.name : "Choose the file"}
        </button>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-2 py-1.5 text-[12px] text-muted hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={!ready}
            className="btn-press flex items-center gap-2 rounded-full bg-accent-dark px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50"
          >
            {busy ? (
              <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" />
            ) : (
              <DoodleIcon name="upload" size={13} />
            )}
            {busy ? "Uploading..." : "Upload"}
          </button>
        </span>
      </div>
      <p className="mt-2 text-[10.5px] text-muted">A PDF, a photo or a Word document, up to 10MB.</p>
      {error ? <p className="mt-2 text-[11.5px] text-accent-dark" aria-live="polite">{error}</p> : null}
    </div>
  );
}
