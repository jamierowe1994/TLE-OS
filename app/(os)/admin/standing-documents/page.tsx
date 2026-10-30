"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/new-look/Parts";
import { ErrorLine, Loading, Section, Spin, Tab, nd, when } from "@/components/new-look/admin/bits";
import { DOC_ACCEPT } from "@/lib/doc-types";
import type { StandingKindInfo } from "@/lib/standing-document-kinds";
import { useNewLook } from "@/lib/use-new-look";

/**
 * Admin > Compliance > Pre-let > Standing documents (29 Oct 2026).
 *
 * The documents kept once and on every let they apply to by themselves
 * (lib/standing-documents): the Easy Read Notes on every Scottish let. Upload
 * it here once; a new version replaces it on every let at the same moment.
 * Until it is uploaded, every Scottish let's Documents tab says it is missing.
 */

type Kind = StandingKindInfo & {
  homes: number | null;
  doc: { fileName: string; r2Key: string; sizeBytes: number; byName: string; at: string } | null;
};

const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const fileUrl = (key: string) => `/api/r2/file?key=${encodeURIComponent(key)}`;

export default function StandingDocuments() {
  const look = useNewLook("admin");
  const [kinds, setKinds] = useState<Kind[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/standing-documents", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; kinds?: Kind[]; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "The standing documents couldn't be read.");
      setKinds(j.kinds ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const choose = (kind: string) => {
    setSaid(null);
    setPicking(kind);
    picker.current?.click();
  };

  async function upload(file: File) {
    const kind = picking;
    if (!kind) return;
    setBusy(kind);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    try {
      const r = await fetch("/api/admin/standing-documents", { method: "POST", body: fd });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; kinds?: Kind[]; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "That did not upload. Try again.");
      setKinds(j.kinds ?? []);
      const k = j.kinds?.find((x) => x.kind === kind);
      setSaid({ ok: true, text: `${k?.label ?? "It"} is on every ${k?.where === "scotland" ? "Scottish " : ""}let now. Nobody has been sent it.` });
    } catch (e) {
      setSaid({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
      setPicking(null);
    }
  }

  const input = (
    <input
      ref={picker}
      type="file"
      accept={DOC_ACCEPT}
      className="hidden"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void upload(f);
      }}
    />
  );

  const reach = (k: Kind) => (k.homes ? `${k.whereLabel} - ${k.homes} Scottish homes on the book today, and any let added later.` : k.whereLabel);

  if (look === null) return <p className="text-[12.5px] text-muted">Loading…</p>;

  if (look) {
    return (
      <Tab>
        {input}
        <p className="nl-meta nl-adm-lede">
          A document that is the same for every let it applies to is uploaded here once, and is on each of those lets by itself: on the Documents tab, in the PLC pack, and offered when docs are emailed to the tenants. Uploading sends nothing to anybody.
        </p>
        {error && <ErrorLine onRetry={() => void load()}>{nd(error)}</ErrorLine>}
        {said && (said.ok ? <p className="nl-meta" role="status">{nd(said.text)}</p> : <ErrorLine>{nd(said.text)}</ErrorLine>)}
        {!kinds && !error ? (
          <Loading what="Reading the standing documents…" />
        ) : kinds ? (
          <Section title={<>Standing Documents <span className="nl-count">{kinds.length}</span></>}>
            <ul className="nl-adm-rows">
              {kinds.map((k) => (
                <li key={k.kind}>
                  <div className="nl-adm-row-main">
                    <span className="nl-strong">{k.label}</span>
                    <p className="nl-meta">{k.says}</p>
                    <p className="nl-meta">{reach(k)}</p>
                    {k.doc ? (
                      <p className="nl-meta">
                        <a href={fileUrl(k.doc.r2Key)} target="_blank" rel="noopener noreferrer" className="nl-link">{k.doc.fileName}</a>
                        {` · ${mb(k.doc.sizeBytes)} · ${k.doc.byName}, ${when(k.doc.at, { year: "numeric" })}`}
                      </p>
                    ) : (
                      <p className="nl-meta" style={{ color: "var(--accent-dark, #b5452f)", fontWeight: 600 }}>
                        Not uploaded yet, so every Scottish let shows it as missing.
                      </p>
                    )}
                    <div className="nl-adm-row-acts">
                      <button type="button" onClick={() => choose(k.kind)} disabled={busy != null} className={`nl-btn nl-btn--sm ${k.doc ? "nl-btn--quiet" : "nl-btn--primary"}`}>
                        {busy === k.kind ? (<><Spin /> Uploading…</>) : k.doc ? "Upload a New Version" : "Upload"}
                      </button>
                    </div>
                  </div>
                  <div className="nl-adm-row-side">
                    <Badge tone={k.doc ? "good" : "warning"}>{k.doc ? "On every let" : "Missing"}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </Tab>
    );
  }

  return (
    <>
      {input}
      <PageHeader title="Standing Documents" lineBreak="none" blurb="Uploaded once, and on every let it applies to by itself. Uploading sends nothing to anybody." />
      {error && (
        <p className="mt-6 text-[12.5px] text-accent-dark">
          {error} <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Try again</button>
        </p>
      )}
      {said && <p className={`mt-6 text-[12.5px] ${said.ok ? "text-muted" : "text-accent-dark"}`} aria-live="polite">{said.text}</p>}
      {!kinds && !error ? (
        <p className="mt-6 flex items-center gap-2.5 text-[12.5px] text-muted">
          <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Reading the standing documents...
        </p>
      ) : kinds ? (
        <ul className="fade-up mt-6 space-y-3">
          {kinds.map((k) => (
            <li key={k.kind} className="rounded-[18px] border border-line/50 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold">{k.label}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${k.doc ? "bg-[#e6f2ea] text-[#1e7a3c]" : "bg-accent-soft text-accent-dark"}`}>
                  {k.doc ? "On every let" : "Missing"}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{k.says}</p>
              <p className="mt-1 text-[12px] text-muted">{reach(k)}</p>
              {k.doc ? (
                <p className="mt-2 text-[12px]">
                  <a href={fileUrl(k.doc.r2Key)} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{k.doc.fileName}</a>
                  <span className="text-muted">{` · ${mb(k.doc.sizeBytes)} · ${k.doc.byName}, ${when(k.doc.at, { year: "numeric" })}`}</span>
                </p>
              ) : (
                <p className="mt-2 text-[12px] font-semibold text-accent-dark">Not uploaded yet, so every Scottish let shows it as missing.</p>
              )}
              <button
                type="button"
                onClick={() => choose(k.kind)}
                disabled={busy != null}
                className="btn-press mt-3 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50"
              >
                {busy === k.kind ? "Uploading..." : k.doc ? "Upload a New Version" : "Upload"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
