"use client";

import { useCallback, useEffect, useState } from "react";
import { TENANT_DOC_KINDS, type TenantDocument } from "@/lib/tenant-documents-kinds";

/**
 * Everything we might ask a tenant for, one row each, with its own Send
 * button and whether it is in (James, 18 Sep 2026: "Send us something ...
 * will ask for all of the things underneath"). It replaces a dropdown and one
 * file button, where the tenant had to know what we meant before they could
 * give it to us.
 */
const HINT: Record<string, string> = {
  id: "A passport or driving licence",
  right_to_rent: "Your share code, or a British or Irish passport",
  reference: "From an employer or a previous landlord",
  proof_of_income: "Three recent payslips, or a bank statement",
  proof_of_address: "A bill or bank statement from the last three months",
  other: "Anything else we have asked for",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function SendDocuments({ sample = false }: { sample?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
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

  async function send(kind: string, files: FileList | null) {
    if (!files?.length) return;
    if (sample) { setErr("This is the sample portal, so nothing is sent from here."); return; }
    setBusy(kind);
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
      setBusy(null);
    }
  }

  return (
    <>
      {err && <p className="mt-3 text-[13px] font-semibold text-accent-dark">{err}</p>}
      <ul className="mt-3 divide-y divide-line/60">
        {TENANT_DOC_KINDS.map((k) => {
          const sent = (docs ?? []).filter((d) => d.kind === k.id);
          const last = sent[0];
          return (
            <li key={k.id} className="flex items-center gap-3 py-3.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] ${sent.length ? "bg-[#f1f4ec] text-[#56634a]" : "bg-panel text-muted"}`}>
                {sent.length ? "✓" : "·"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-tight">{k.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                  {last ? (
                    <>
                      Sent {day(last.uploadedAt)}
                      {sent.length > 1 ? ` · ${sent.length} files` : ""} ·{" "}
                      <a href={`/api/tenant/documents/${last.id}`} target="_blank" rel="noreferrer" className="underline">Open</a>
                    </>
                  ) : (
                    HINT[k.id]
                  )}
                </span>
              </span>
              <label
                className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold ${
                  busy === k.id ? "bg-line text-muted" : sent.length ? "cursor-pointer border border-line/80" : "cursor-pointer bg-accent-dark text-white"
                }`}
              >
                {busy === k.id ? "Sending…" : sent.length ? "Add" : "Send"}
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  disabled={busy !== null}
                  onChange={(e) => void send(k.id, e.target.files)}
                  className="hidden"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
