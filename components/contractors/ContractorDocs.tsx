"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import FieldDate from "@/components/FieldDate";
import { DOC_KINDS, neededFor, type ContractorDoc, type DocKind } from "@/lib/contractor-docs-shared";

/**
 * A contractor's own paperwork on their record (the agents' call, 20 Oct
 * 2026): public liability, the signed TLE terms, and Gas Safe or electrical
 * registration for those trades. What's needed shows as a gap until it's on
 * file; an expiry in the past shows red. /api/contractors/docs.
 */

const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export default function ContractorDocs({ contractorId, trade }: { contractorId: string; trade: string }) {
  const [docs, setDocs] = useState<ContractorDoc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<DocKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/contractors/docs?contractor=${encodeURIComponent(contractorId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j?.ok) setDocs(j.docs); else setErr(j?.error ?? "Couldn't read their documents."); })
      .catch(() => live && setErr("Couldn't read their documents."));
    return () => { live = false; };
  }, [contractorId]);

  function open(kind: DocKind) {
    setAdding(kind);
    setFile(null);
    setExpires("");
    setNumber("");
    setErr(null);
  }

  async function save() {
    if (!adding || !file) return;
    const meta = DOC_KINDS.find((k) => k.id === adding)!;
    if (meta.expires && !expires) return setErr("When does it run out?");
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scope", "document");
      fd.append("ref", `contractor-${contractorId}`);
      const up = await fetch("/api/r2/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
      if (!up?.ok) throw new Error(up?.error ?? "The file didn't upload, so nothing was saved.");
      const j = await fetch("/api/contractors/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId, kind: adding, key: up.key, name: up.name ?? file.name, expires: expires || null, number }),
      }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "That didn't save.");
      setDocs(j.docs);
      setAdding(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const j = await fetch(`/api/contractors/docs?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setDocs(j.docs);
    else setErr(j?.error ?? "That didn't come off.");
  }

  const needed = neededFor(trade);
  const now = today();
  const latest = (k: DocKind) => (docs ?? []).find((d) => d.kind === k) ?? null;
  /* Anything else on file; a replaced insurance certificate stays kept but out of the way. */
  const extras = (docs ?? []).filter((d) => !needed.includes(d.kind));
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2 text-[12.5px] outline-none focus:border-ink";

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Their documents</p>
        <button type="button" onClick={() => open("other")} className="text-[11.5px] font-semibold text-accent-dark underline-offset-2 hover:underline">Add another</button>
      </div>
      {docs === null && !err && (
        <p className="mt-2 flex items-center gap-2 text-[12px] text-muted"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Reading their documents</p>
      )}
      {docs !== null && (
        <ul className="mt-2 divide-y divide-line/50">
          {needed.map((k) => {
            const meta = DOC_KINDS.find((x) => x.id === k)!;
            const d = latest(k);
            const lapsed = Boolean(d?.expires && d.expires < now);
            return (
              <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
                <DoodleIcon name={d && !lapsed ? "checklist" : "doc"} size={14} className={d && !lapsed ? "text-[#56634a]" : "text-accent-dark"} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{meta.label}</span>
                  <span className={`block text-[11.5px] ${!d || lapsed ? "text-accent-dark" : "text-muted"}`}>
                    {!d ? "Not on file" : lapsed ? `Ran out ${day(d.expires!)}` : d.expires ? `Runs to ${day(d.expires)}` : `On file since ${new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                    {d?.number ? ` · ${d.number}` : ""}
                  </span>
                </span>
                {d && <a href={`/api/r2/file?key=${encodeURIComponent(d.key)}`} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold underline-offset-2 hover:underline">Open</a>}
                <button type="button" onClick={() => open(k)} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] hover:border-ink/40">{d ? "Replace" : "Add"}</button>
              </li>
            );
          })}
          {extras.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
              <DoodleIcon name="doc" size={14} className="text-muted" />
              <span className="min-w-0 flex-1 truncate">{d.name || DOC_KINDS.find((x) => x.id === d.kind)?.label}<span className="text-muted">{d.expires ? ` · runs to ${day(d.expires)}` : ""}</span></span>
              <a href={`/api/r2/file?key=${encodeURIComponent(d.key)}`} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold underline-offset-2 hover:underline">Open</a>
              <button type="button" onClick={() => void remove(d.id)} className="text-[11.5px] text-muted hover:text-accent-dark">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-3 space-y-2 rounded-xl border border-line/70 bg-box/60 p-3">
          <p className="text-[12.5px] font-semibold">{DOC_KINDS.find((k) => k.id === adding)?.label}</p>
          <label className={`${field} flex cursor-pointer items-center justify-between gap-2 bg-white`}>
            <span className={`truncate ${file ? "" : "text-muted"}`}>{file ? file.name : "Attach it (PDF or photo)"}</span>
            <span className="shrink-0 text-[11.5px] underline">{file ? "Change" : "Choose"}</span>
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          {DOC_KINDS.find((k) => k.id === adding)?.expires && <FieldDate value={expires} onChange={setExpires} placeholder="When it runs out" />}
          {DOC_KINDS.find((k) => k.id === adding)?.number && (
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={DOC_KINDS.find((k) => k.id === adding)!.number!} className={`${field} bg-white`} />
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !file} onClick={() => void save()} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40">{busy ? "Saving" : "Save"}</button>
            <button type="button" disabled={busy} onClick={() => setAdding(null)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-[12px] text-accent-dark">{err}</p>}
    </section>
  );
}
