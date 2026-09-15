"use client";

import { useCallback, useEffect, useState } from "react";
import { TENANT_DOC_KINDS, tenantDocLabel, type TenantDocument } from "@/lib/tenant-documents-kinds";

/**
 * The tenant sending something in, and what they have sent.
 *
 * The page it sits on has always been one-way - things the tenant receives -
 * so this is the only control on it that goes the other direction, and it says
 * so plainly rather than sitting as a bare file input among a list of links.
 */
export default function SendDocuments({ sample = false }: { sample?: boolean }) {
  const [kind, setKind] = useState<string>(TENANT_DOC_KINDS[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [docs, setDocs] = useState<TenantDocument[] | null>(null);

  const load = useCallback(() => {
    if (sample) { setDocs([]); return; }
    fetch("/api/tenant/documents", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDocs(j.ok ? j.documents : []))
      .catch(() => setDocs([]));
  }, [sample]);
  useEffect(load, [load]);

  async function send(files: FileList | null) {
    if (!files?.length) return;
    if (sample) { setErr("This is the sample portal, so nothing is sent from here."); return; }
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set("kind", kind);
        body.set("file", file);
        const j = await fetch("/api/tenant/documents", { method: "POST", body }).then((r) => r.json());
        if (!j.ok) throw new Error(j.error ?? "That did not send.");
      }
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-xl border border-line/60 bg-white px-3.5 py-2.5 text-[14px]"
        >
          {TENANT_DOC_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
        <label className={`rounded-full px-5 py-2.5 text-[13px] font-semibold ${busy ? "bg-line text-muted" : "cursor-pointer bg-accent-dark text-white"}`}>
          {busy ? "Sending…" : "Choose a file"}
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            disabled={busy}
            onChange={(e) => void send(e.target.files)}
            className="hidden"
          />
        </label>
        <p className="text-[12.5px] text-muted">A PDF or a photograph, up to 25MB.</p>
      </div>
      {err && <p className="mt-2 text-[13px] font-semibold text-accent-dark">{err}</p>}

      <div className="mt-5 border-t border-line/60 pt-4">
        <h3 className="text-[15px] font-bold">What you have sent</h3>
        {docs == null ? (
          <p className="mt-2 text-[13.5px] text-muted">Looking…</p>
        ) : docs.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/50">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{d.name}</span>
                  <span className="block text-[12.5px] text-muted">
                    {tenantDocLabel(d.kind)} · sent{" "}
                    {new Date(d.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <a href={`/api/tenant/documents/${d.id}`} target="_blank" rel="noreferrer" className="shrink-0 text-[12.5px] font-semibold underline">
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
