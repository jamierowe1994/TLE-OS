"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE SECOND PASS (James, 25 Sep 2026).
 *
 * Michael, Kirstie and Joe each go through every home on Susan's sheets, once,
 * checking their own section: compliance, the tenancy, or the landlord, fees
 * and deposit. What the OS holds is laid out row by row; REX PM, Propoly and
 * PayProp open beside it in the same three tabs every time. Tick what is
 * right, fix or upload what is not, and Save & next. Built for speed on a
 * desktop: the arrow keys move between homes and Enter saves.
 *
 * When everyone is done the OS is the source of truth and this screen goes.
 */

type SectionKey = "compliance" | "tenancy" | "landlord";
const SECTIONS: { key: SectionKey; label: string; who: string; fields: string[]; certs?: boolean }[] = [
  { key: "compliance", label: "Compliance", who: "Michael", certs: true,
    fields: ["epc_rating", "pat_expiry", "alarms_expiry", "legionella_expiry", "repairing_standard", "licence_type", "licence_number", "licence_expiry", "doc_licence"] },
  { key: "tenancy", label: "Tenancy & tenants", who: "Kirstie",
    fields: ["tenants_count", "tenancy_type", "tenancy_start", "tenancy_end", "rent_matches_agreement", "rent_review_last", "visit_next",
      "rtr_expiry", "rtr_checked", "doc_rtr_evidence", "guarantors_count", "guarantor_names", "guarantor_contacts", "doc_guarantor",
      "doc_tenancy_agreement", "doc_prt_notes", "doc_tenant_referencing", "doc_inventory", "rra_sheet_served", "doc_rra_sheet"] },
  { key: "landlord", label: "Landlord, fees & deposit", who: "Joe",
    fields: ["service_package", "fee_management", "fee_setup", "letting_agreement_start", "doc_terms_of_business", "nrl_status", "doc_nrl1",
      "landlord_aml", "landlord_photo_id", "doc_landlord_id_ownership", "landlord_registration", "doc_landlord_registration", "rent_smart_wales",
      "deposit_ref", "deposit_amount", "deposit_protected_on", "doc_deposit_cert"] },
];

type QueueHome = { id: string; address: string; landlord: string | null; since: string | null; missing: number; doneAt: string | null; doneBy: string | null };
type Fact = {
  key: string; label: string; kind: string; needed: boolean; held: boolean; value: string | null; source: string | null;
  capturedBy: string | null; checkedAgainst: string | null; files: { key: string; name: string }[]; note: string | null;
  verifiedAt: string | null; verifiedBy: string | null;
};
type Cert = { key: string; label: string; days: number | null; file: boolean; expiresOn: string | null; fileUrl: string | null; notRequired: boolean; checkedBy: string | null };
type Detail = {
  home: { id: string; address: string; landlord: string | null; agent: string | null; tenants: string | null; paypropNo: string | null; rexPropertyId: string | null; hmo: boolean };
  facts: Fact[]; certs: Cert[] | null; notes: string | null; sectionNotes: Record<string, string | null>;
  links: { rexPm: string | null; propoly: string | null; payprop: string | null };
  sections: Record<string, { at: string; by: string | null } | null>;
};

const CERT_TYPE: Record<string, string> = { gas: "gas_safety", eicr: "eicr", epc: "epc" };
const fmtDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : d);
const fileHref = (u: string) => (/^(https?:)?\//.test(u) ? u : `/api/r2/file?key=${encodeURIComponent(u)}`);
const typing = () => { const t = document.activeElement?.tagName; return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; };

export default function SecondPass() {
  const [section, setSection] = useState<SectionKey | null>(null);
  const [queue, setQueue] = useState<QueueHome[] | null>(null);
  const [progress, setProgress] = useState<{ total: number; done: number; today: number } | null>(null);
  const [idx, setIdx] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [jump, setJump] = useState("");
  const sec = SECTIONS.find((s) => s.key === section) ?? null;

  /* Start each person in their own section: compliance for Michael, the tenancy for Kirstie, the rest for Joe. */
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("clean-sweep-section"); } catch { /* private window */ }
    if (saved && SECTIONS.some((s) => s.key === saved)) { setSection(saved as SectionKey); return; }
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const role = String(j?.user?.role ?? j?.role ?? "");
      setSection(role === "compliance" ? "compliance" : role === "pretenancy" ? "tenancy" : "landlord");
    }).catch(() => setSection("landlord"));
  }, []);

  const loadQueue = useCallback(async (s: SectionKey) => {
    setQueue(null); setDetail(null); setMsg(null);
    const r = await fetch(`/api/clean-sweep?section=${s}`, { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) { setMsg(j.error || "The list would not load."); setQueue([]); return; }
    setQueue(j.queue); setProgress(j.progress);
    const first = (j.queue as QueueHome[]).findIndex((h) => !h.doneAt);
    setIdx(first < 0 ? 0 : first);
  }, []);
  useEffect(() => {
    if (!section) return;
    try { localStorage.setItem("clean-sweep-section", section); } catch { /* fine */ }
    void loadQueue(section);
  }, [section, loadQueue]);

  const current = queue?.[idx] ?? null;
  const applyDetail = useCallback((d: Detail) => {
    setDetail(d);
    setNotes((section && d.sectionNotes?.[section]) ?? "");
    const t = new Set<string>();
    for (const f of d.facts) if (f.verifiedAt) t.add(f.key);
    for (const c of d.certs ?? []) if (c.checkedBy) t.add(`cert_${c.key}`);
    setTicks(t);
  }, [section]);
  useEffect(() => {
    if (!current) return;
    let live = true;
    setDetail(null); setMsg(null);
    fetch(`/api/clean-sweep/${encodeURIComponent(current.id)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!live) return;
      if (j.ok) applyDetail(j); else setMsg(j.error || "That home would not open.");
    }).catch(() => live && setMsg("That home would not open."));
    return () => { live = false; };
  }, [current, applyDetail]);

  const rows = useMemo(() => {
    if (!detail || !sec) return [];
    const byKey = new Map(detail.facts.map((f) => [f.key, f]));
    return sec.fields.map((k) => byKey.get(k)).filter((f): f is Fact => Boolean(f && (f.needed || f.value || f.files.length)));
  }, [detail, sec]);
  const certs = useMemo(() => (sec?.certs ? (detail?.certs ?? []).filter((c) => CERT_TYPE[c.key]) : []), [detail, sec]);
  const missing = rows.filter((f) => f.needed && !f.held).length;

  const go = useCallback((to: number) => {
    if (!queue?.length) return;
    setIdx(Math.max(0, Math.min(queue.length - 1, to)));
  }, [queue]);
  const nextOpen = useCallback((from: number) => {
    if (!queue) return from;
    for (let i = from + 1; i < queue.length; i++) if (!queue[i].doneAt) return i;
    return Math.min(from + 1, queue.length - 1);
  }, [queue]);

  const post = useCallback(async (body: object) => {
    if (!current) return null;
    const r = await fetch(`/api/clean-sweep/${encodeURIComponent(current.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ ok: false, error: "The OS could not be reached." }));
    if (!j.ok) { setMsg(j.error || "That did not save."); return null; }
    return j as Detail;
  }, [current]);

  const saveNext = useCallback(async () => {
    if (!current || !section || busy) return;
    setBusy(true); setMsg(null);
    const d = await post({ verify: [...ticks], section, done: true, notes });
    setBusy(false);
    if (!d) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    setQueue((q) => (q ?? []).map((h, i) => (i === idx ? { ...h, doneAt: today, doneBy: "you" } : h)));
    setProgress((p) => (p && !current.doneAt ? { ...p, done: p.done + 1, today: p.today + 1 } : p));
    setIdx(nextOpen(idx));
  }, [current, section, busy, post, ticks, notes, idx, nextOpen]);

  const tickAll = useCallback(() => {
    setTicks((t) => {
      const n = new Set(t);
      for (const f of rows) if (f.value || f.files.length || f.note) n.add(f.key);
      for (const c of certs) if (c.expiresOn || c.notRequired) n.add(`cert_${c.key}`);
      return n;
    });
  }, [rows, certs]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
      else if (e.key === "Enter") { e.preventDefault(); void saveNext(); }
      else if (e.key === "a" || e.key === "A") { e.preventDefault(); tickAll(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [go, idx, saveNext, tickAll]);

  if (!section || !queue) return <WorkspaceLoading />;
  const matches = jump.trim() ? queue.map((h, i) => ({ h, i })).filter(({ h }) => `${h.address} ${h.landlord ?? ""}`.toLowerCase().includes(jump.trim().toLowerCase())).slice(0, 8) : [];

  return (
    <div className="mx-auto max-w-[1180px] pb-40">
      {/* Section tabs and progress */}
      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${s.key === section ? "border-ink bg-ink text-white" : "border-line text-muted hover:border-ink"}`}>
            {s.label} <span className="font-normal opacity-70">· {s.who}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[12.5px] text-muted">
          {progress && <span><b className="text-ink">{progress.done}</b> of {progress.total} checked · {progress.today} today</span>}
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line/60"><div className="h-full bg-[#56634a]" style={{ width: `${progress?.total ? (100 * progress.done) / progress.total : 0}%` }} /></div>
        </div>
      </div>

      {/* The home and the three systems beside it */}
      <div className="mt-4 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted">Home {idx + 1} of {queue.length}{current?.doneAt ? ` · checked ${fmtDate(current.doneAt)}` : ""}</p>
            <h1 className="mt-0.5 text-[21px] font-extrabold tracking-[-0.02em]">{current?.address ?? "Nothing on the list"}</h1>
            {detail && (
              <p className="mt-1 text-[12.5px] text-muted">
                Landlord <b className="text-ink">{detail.home.landlord ?? "not known"}</b> · Agent <b className="text-ink">{detail.home.agent ?? "none"}</b> · Tenants <b className="text-ink">{detail.home.tenants ?? "not known"}</b>{detail.home.hmo ? " · HMO" : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {detail?.links.rexPm && <a href={detail.links.rexPm} target="tle-sweep-rexpm" rel="noopener" className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink">REX PM ↗</a>}
            {detail?.links.propoly && <a href={detail.links.propoly} target="tle-sweep-propoly" rel="noopener" className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink">Propoly ↗</a>}
            {detail?.links.payprop && <a href={detail.links.payprop} target="tle-sweep-payprop" rel="noopener" className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink">PayProp ↗</a>}
          </div>
        </div>
        <div className="relative mt-3 flex items-center gap-2">
          <button onClick={() => go(idx - 1)} className="rounded-full border border-line px-3 py-1 text-[13px] hover:border-ink" aria-label="Previous home">←</button>
          <button onClick={() => go(idx + 1)} className="rounded-full border border-line px-3 py-1 text-[13px] hover:border-ink" aria-label="Next home">→</button>
          <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="Jump to a home: address or landlord" className="ml-2 w-80 rounded-full border border-line px-3 py-1 text-[12.5px]" />
          {matches.length > 0 && (
            <ul className="absolute left-24 top-9 z-20 w-96 rounded-xl border border-line bg-white py-1 shadow-lg">
              {matches.map(({ h, i }) => (
                <li key={h.id}><button onClick={() => { setIdx(i); setJump(""); }} className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-[#f5f0ea]">{h.address}{h.doneAt ? " · checked" : ""}</button></li>
              ))}
            </ul>
          )}
          <span className="ml-auto text-[11.5px] text-muted">← → move · Enter saves and moves on · A ticks everything held</span>
        </div>
      </div>

      {msg && <p className="mt-3 rounded-xl bg-[#f6e1dd] px-4 py-2 text-[13px] text-[#9d4340]">{msg}</p>}
      {!detail ? <div className="mt-6"><WorkspaceLoading /></div> : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid grid-cols-[34px_220px_1fr_210px] gap-3 border-b border-line bg-[#f5f0ea] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
            <span>OK</span><span>Column</span><span>What the OS holds</span><span className="text-right">Fix</span>
          </div>
          {certs.map((c) => (
            <CertRow key={c.key} c={c} ticked={ticks.has(`cert_${c.key}`)} onTick={(v) => setTicks((t) => { const n = new Set(t); if (v) n.add(`cert_${c.key}`); else n.delete(`cert_${c.key}`); return n; })}
              home={detail.home} onSaved={async () => { const d = await post({ verify: [] }); if (d) applyDetail(d); }} setMsg={setMsg} />
          ))}
          {rows.map((f) => (
            <FactRow key={f.key} f={f} homeId={detail.home.id} ticked={ticks.has(f.key)}
              onTick={(v) => setTicks((t) => { const n = new Set(t); if (v) n.add(f.key); else n.delete(f.key); return n; })}
              onSaved={(d) => { applyDetail(d); }} post={post} setMsg={setMsg} />
          ))}
          {!rows.length && !certs.length && <p className="px-4 py-6 text-[13px] text-muted">Nothing in this section applies to this home. Save & next.</p>}
        </div>
      )}

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
        {/* Kept clear of the Report a problem button and Steve in the bottom-right corner. */}
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 py-3 pl-4 pr-[240px]">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything that did not match, or needs somebody else" className="min-w-0 flex-1 rounded-full border border-line px-4 py-2 text-[13px]" />
          <span className="text-[12px] text-muted">{missing ? `${missing} still missing` : "All held"}</span>
          <button onClick={tickAll} className="rounded-full border border-line px-3.5 py-2 text-[13px] font-semibold hover:border-ink">Tick all held</button>
          <button onClick={() => go(idx + 1)} className="rounded-full border border-line px-3.5 py-2 text-[13px] hover:border-ink">Skip</button>
          <button onClick={() => void saveNext()} disabled={busy || !current} className="rounded-full bg-[#a8553f] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? "Saving" : "Save & next →"}</button>
        </div>
      </div>
    </div>
  );
}

function FactRow({ f, homeId, ticked, onTick, onSaved, post, setMsg }: {
  f: Fact; homeId: string; ticked: boolean; onTick: (v: boolean) => void; onSaved: (d: Detail) => void;
  post: (b: object) => Promise<Detail | null>; setMsg: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputType = f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text";
  const differs = /differs/i.test(f.checkedAgainst ?? "");

  async function save(na = false) {
    setBusy(true);
    const d = await post(na ? { field: f.key, na: true } : { field: f.key, value: val });
    setBusy(false);
    if (d) { setEditing(false); onSaved(d); }
  }
  async function upload(file: File) {
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file); fd.append("field", f.key);
    try {
      const r = await fetch(`/api/clean-sweep/${encodeURIComponent(homeId)}/file`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) setMsg(j.error || "That did not upload."); else onSaved(j);
    } catch { setMsg("That did not upload - the OS could not be reached."); } finally { setBusy(false); }
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files?.[0]; if (file) void upload(file); }}
      className={`grid grid-cols-[34px_220px_1fr_210px] items-start gap-3 border-b border-line/70 px-4 py-2.5 ${drag ? "bg-[#eef3e8]" : ""}`}>
      <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} disabled={!(f.value || f.files.length || f.note)} className="mt-1 h-4 w-4 accent-[#56634a]" aria-label={`${f.label} is right`} />
      <div>
        <p className="text-[13px] font-semibold">{f.label}</p>
        {f.needed && !f.held && <span className="mt-0.5 inline-block rounded-full bg-[#f6e1dd] px-2 py-px text-[10.5px] font-semibold text-[#9d4340]">Missing</span>}
      </div>
      <div className="min-w-0 text-[13px]">
        {editing ? (
          <div className="flex items-center gap-2">
            <input autoFocus type={inputType} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } if (e.key === "Escape") setEditing(false); }} className="w-64 rounded-lg border border-line px-2 py-1 text-[13px]" />
            <button onClick={() => void save()} disabled={busy} className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white">Save</button>
            <button onClick={() => void save(true)} disabled={busy} className="rounded-full border border-line px-3 py-1 text-[12px]">N/A</button>
            <button onClick={() => setEditing(false)} className="text-[12px] text-muted">Cancel</button>
          </div>
        ) : (
          <>
            <p className="break-words">{f.value ? (f.kind === "date" ? fmtDate(f.value) : f.value) : f.note ?? <span className="text-muted">Not held</span>}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {f.source ? (f.source === "manual" ? `Added by ${f.capturedBy ?? "the office"}` : f.source) : ""}
              {f.checkedAgainst ? <span className={differs ? " font-semibold text-[#8a6420]" : ""}> · {f.checkedAgainst}</span> : null}
              {f.verifiedBy ? <span className="text-[#56634a]"> · checked by {f.verifiedBy}</span> : null}
            </p>
            {f.files.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {f.files.slice(0, 10).map((x) => (
                  <a key={x.key} href={`/api/r2/file?key=${encodeURIComponent(x.key)}`} target="tle-sweep-file" rel="noopener" className="flex max-w-[240px] items-center gap-1 rounded-full border border-line/80 px-2 py-0.5 text-[11px] hover:border-ink">
                    <DoodleIcon name="doc" size={11} /><span className="truncate">{x.name}</span>
                  </a>
                ))}
                {f.files.length > 10 && <span className="text-[11px] text-muted">+{f.files.length - 10} more</span>}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-1.5">
        {f.kind !== "file" && !editing && <button onClick={() => { setVal(f.kind === "date" ? (f.value && /^\d{4}-\d{2}-\d{2}/.test(f.value) ? f.value.slice(0, 10) : "") : f.value ?? ""); setEditing(true); }} className="rounded-full border border-line px-3 py-1 text-[12px] hover:border-ink">{f.value ? "Edit" : "Add"}</button>}
        {!editing && <button onClick={() => void save(true)} disabled={busy} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-ink" title="This column does not apply to this home">N/A</button>}
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-full border border-line px-3 py-1 text-[12px] hover:border-ink">{busy ? "…" : "Upload"}</button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function CertRow({ c, ticked, onTick, home, onSaved, setMsg }: {
  c: Cert; ticked: boolean; onTick: (v: boolean) => void; home: Detail["home"]; onSaved: () => Promise<void>; setMsg: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const expired = c.days != null && c.days < 0;

  /* A newer certificate goes through the compliance desk's own route, so it counts everywhere. */
  async function file(f: File) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) { setMsg("Put the certificate's expiry date in first."); return; }
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append("file", f); fd.append("propertyId", home.rexPropertyId || home.id); fd.append("propertyName", home.address);
    fd.append("type", CERT_TYPE[c.key]); fd.append("expiry", expiry); fd.append("source", "Clean sweep check");
    try {
      const r = await fetch("/api/compliance/certificates", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) setMsg(j.error || "That certificate did not file."); else { setOpen(false); await onSaved(); }
    } catch { setMsg("That certificate did not file - the OS could not be reached."); } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-[34px_220px_1fr_210px] items-start gap-3 border-b border-line/70 bg-[#fbf8f4] px-4 py-2.5">
      <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} className="mt-1 h-4 w-4 accent-[#56634a]" aria-label={`${c.label} is right`} />
      <p className="text-[13px] font-semibold">{c.label} certificate</p>
      <div className="text-[13px]">
        {c.notRequired ? <span className="text-muted">Not required</span> : c.expiresOn ? (
          <span className={expired ? "font-semibold text-[#9d4340]" : ""}>{expired ? "Expired " : "Expires "}{fmtDate(c.expiresOn)}</span>
        ) : <span className="rounded-full bg-[#f6e1dd] px-2 py-px text-[10.5px] font-semibold text-[#9d4340]">Missing</span>}
        {c.fileUrl && <a href={fileHref(c.fileUrl)} target="tle-sweep-file" rel="noopener" className="ml-2 text-[12px] underline">Open</a>}
        {c.checkedBy && <span className="ml-2 text-[11px] text-[#56634a]">checked by {c.checkedBy}</span>}
        {open && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[12px] text-muted">Expires</label>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-[13px]" />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-white">{busy ? "Filing" : "Choose the file"}</button>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void file(f); e.target.value = ""; }} />
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen((o) => !o)} className="rounded-full border border-line px-3 py-1 text-[12px] hover:border-ink">{open ? "Cancel" : "Newer one"}</button>
      </div>
    </div>
  );
}
