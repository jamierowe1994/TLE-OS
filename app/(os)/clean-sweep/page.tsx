"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE CLEAN SWEEP (24 Sep 2026).
 *
 * The checker's screen: every let home, oldest portfolio first. The OS has
 * already been filled from REX PM, Propoly and Susan's sheet, so the job on
 * each home is to open REX PM beside it, sense-check what is held, add what
 * is missing - a date, a word or a file - and mark it checked. Kirstie sees
 * the same list to oversee the day.
 */

type Home = {
  id: string; address: string; ref: string; paypropNo: string | null; onSheet: boolean;
  landlord: string | null; agent: string | null; tenants: string | null; since: string | null;
  hmo: boolean; needed: number; missing: number; checkedAt: string | null; checkedBy: string | null;
};
type Fact = {
  key: string; label: string; group: string; kind: string; needed: boolean; held: boolean;
  value: string | null; source: string | null; sourceRef: string | null; checkedAgainst: string | null;
  capturedAt: string | null; capturedBy: string | null; files: { key: string; name: string }[]; note: string | null;
};
type Detail = {
  home: Home & { postcode: string | null; rexPropertyId: string | null };
  facts: Fact[];
  certs: { key: string; label: string; days: number | null; file: boolean }[] | null;
  links: { rexPm: string | null; propoly: string | null };
  notes: string | null;
};

const GROUPS = ["Property", "Landlord & service", "Tenancy", "Guarantors", "Deposit", "Compliance", "Documents"];
const fmtDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : d);

function sourceLabel(f: Fact): string {
  if (!f.source) return "";
  if (f.source === "manual") return `Added by ${f.capturedBy ?? "the office"}`;
  return f.source;
}

export default function CleanSweep() {
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [progress, setProgress] = useState<{ total: number; checked: number; today: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todo" | "done" | "all">("todo");
  const [sheetOnly, setSheetOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const r = await fetch("/api/clean-sweep", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "The list would not load.");
      setHomes(j.homes);
      setProgress(j.progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The list would not load.");
    }
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  const shown = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (homes ?? []).filter((h) =>
      (!sheetOnly || h.onSheet) &&
      (filter === "all" || (filter === "done" ? Boolean(h.checkedAt) : !h.checkedAt)) &&
      (!n || `${h.address} ${h.landlord ?? ""} ${h.agent ?? ""} ${h.tenants ?? ""} ${h.paypropNo ?? ""}`.toLowerCase().includes(n))
    );
  }, [homes, filter, sheetOnly, search]);

  /* Open the first one on the list when nothing is chosen, so the screen is never empty. */
  useEffect(() => {
    if (!openId && shown.length && typeof window !== "undefined" && window.innerWidth >= 1024) setOpenId(shown[0].id);
  }, [shown, openId]);

  const onChanged = useCallback((d: Detail) => {
    setHomes((cur) => (cur ?? []).map((h) => (h.id === d.home.id ? { ...h, missing: d.home.missing, needed: d.home.needed, checkedAt: d.home.checkedAt, checkedBy: d.home.checkedBy } : h)));
    void loadList();
  }, [loadList]);

  if (!homes && !error) return <WorkspaceLoading />;

  return (
    <>
      <PageHeader
        title="Clean Sweep"
        blurb="Every let home, oldest first. Open REX PM beside it, check what the OS holds, add what is missing, then mark it checked."
        search
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search address, landlord, agent, tenant or PayProp number"
      />
      {error && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}

      {progress && (
        <div className="fade-up mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[22px] border border-line/70 bg-card px-5 py-4">
          <div className="min-w-[220px] flex-1">
            <p className="text-[12px] text-muted">Susan's list</p>
            <p className="mt-0.5 text-[15px] font-semibold">
              {progress.checked} of {progress.total} checked
              <span className="ml-2 text-[12.5px] font-normal text-muted">{progress.today} today</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line/50">
              <div className="h-full rounded-full bg-[#56634a]" style={{ width: `${progress.total ? (100 * progress.checked) / progress.total : 0}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["todo", "done", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${filter === f ? "border-accent-dark bg-accent-dark text-page" : "border-line/80 text-muted hover:text-ink"}`}
              >
                {f === "todo" ? "To check" : f === "done" ? "Checked" : "All"}
              </button>
            ))}
            <label className="ml-1 flex cursor-pointer items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={sheetOnly} onChange={(e) => setSheetOnly(e.target.checked)} className="accent-[#56634a]" />
              Susan's list only
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <ul className={`fade-up space-y-2 ${openId ? "hidden lg:block" : ""} lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:self-start lg:overflow-y-auto lg:pr-1`}>
          {shown.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => setOpenId(h.id)}
                className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${openId === h.id ? "border-ink bg-card" : "border-line/70 bg-card hover:border-ink/40"}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">{h.address}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                      {h.since ? `Since ${fmtDate(h.since)}` : "Start not known"}{h.agent ? ` · ${h.agent}` : ""}{h.hmo ? " · HMO" : ""}
                    </span>
                  </span>
                  {h.checkedAt ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#e3ead9] px-2 py-0.5 text-[11px] font-semibold text-[#56634a]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#56634a]" /> Checked
                    </span>
                  ) : h.missing ? (
                    <span className="shrink-0 rounded-full bg-[#f6e1dd] px-2 py-0.5 text-[11px] font-semibold text-[#9d4340]">{h.missing} missing</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-[#e3ead9] px-2 py-0.5 text-[11px] font-semibold text-[#56634a]">All held</span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="rounded-2xl border border-line/70 bg-card p-4 text-[12.5px] text-muted">Nothing here.</li>}
        </ul>

        <div className={openId ? "" : "hidden lg:block"}>
          {openId ? <HomePanel key={openId} id={openId} onBack={() => setOpenId(null)} onChanged={onChanged} /> : (
            <p className="rounded-[22px] border border-line/70 bg-card p-6 text-[13px] text-muted">Pick a home on the left.</p>
          )}
        </div>
      </div>
    </>
  );
}

function HomePanel({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: (d: Detail) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/clean-sweep/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (!j.ok) setError(j.error || "That home would not load."); else { setD(j); setNotes(j.notes ?? ""); } })
      .catch(() => live && setError("That home would not load."));
    return () => { live = false; };
  }, [id]);

  const apply = useCallback((j: Detail) => { setD(j); onChanged(j); }, [onChanged]);

  async function signOff(on: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/clean-sweep/${encodeURIComponent(id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signOff: on, notes }) });
      const j = await r.json();
      if (j.ok) apply(j); else setError(j.error || "That did not save.");
    } finally { setBusy(false); }
  }

  if (error) return <p className="rounded-[22px] border border-line/70 bg-card p-5 text-[12.5px] text-[#9d4340]">{error}</p>;
  if (!d) return <p className="rounded-[22px] border border-line/70 bg-card p-5 text-[12.5px] text-muted">Loading the home…</p>;
  const h = d.home;
  const missingNow = d.facts.filter((f) => f.needed && !f.held).length;

  return (
    <div className="fade-up space-y-4">
      <div className="rounded-[22px] border border-line/70 bg-card p-5">
        <button type="button" onClick={onBack} className="mb-2 text-[12px] font-semibold text-muted lg:hidden">← All homes</button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] leading-tight">{h.address}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {h.ref}{h.paypropNo ? ` · PayProp ${h.paypropNo}` : ""}{h.since ? ` · since ${fmtDate(h.since)}` : ""}{h.hmo ? " · HMO" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.links.rexPm && (
              <a href={d.links.rexPm} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page">
                <DoodleIcon name="link" size={12} /> Open in REX PM
              </a>
            )}
            {d.links.propoly && (
              <a href={d.links.propoly} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink">
                <DoodleIcon name="link" size={12} /> Open in Propoly
              </a>
            )}
          </div>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
          <div><dt className="text-[11px] text-muted">Landlord</dt><dd>{h.landlord || "Not known"}</dd></div>
          <div><dt className="text-[11px] text-muted">Agent</dt><dd>{h.agent || "Not known"}</dd></div>
          <div><dt className="text-[11px] text-muted">Tenants</dt><dd>{h.tenants || "Not known"}</dd></div>
        </dl>
        {d.certs && d.certs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {d.certs.map((c) => {
              const bad = c.days != null && c.days < 0;
              const soon = c.days != null && c.days >= 0 && c.days <= 30;
              return (
                <span key={c.key} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${bad ? "bg-[#f6e1dd] text-[#9d4340]" : soon ? "bg-[#f6ecd6] text-[#8a6420]" : "bg-[#e3ead9] text-[#56634a]"}`}>
                  {c.label}: {c.days == null ? "no date" : bad ? `expired ${-c.days}d ago` : `${c.days}d left`}{c.file ? "" : " · no file"}
                </span>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">{missingNow ? `${missingNow} of the ${d.facts.filter((f) => f.needed).length} columns this home needs are still missing.` : "Every column this home needs is held."}</p>
      </div>

      {GROUPS.map((g) => {
        const rows = d.facts.filter((f) => f.group === g && (f.needed || f.value || f.files.length));
        if (!rows.length) return null;
        return (
          <section key={g} className="rounded-[22px] border border-line/70 bg-card p-5">
            <h3 className="text-[15px]">{g}</h3>
            <ul className="mt-3 divide-y divide-line/50">
              {rows.map((f) => <FactRow key={f.key} homeId={id} f={f} onSaved={apply} />)}
            </ul>
          </section>
        );
      })}

      <section className="rounded-[22px] border border-line/70 bg-card p-5">
        <h3 className="text-[15px]">Sign-off</h3>
        <label htmlFor="sweep-notes" className="mt-3 block text-[11.5px] text-muted">Discrepancy notes - anything that did not match, or needs somebody else</label>
        <textarea
          id="sweep-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-ink"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {h.checkedAt ? (
            <p className="text-[12.5px] text-[#56634a]">Checked by {h.checkedBy ?? "the office"} on {fmtDate(h.checkedAt)}.</p>
          ) : (
            <p className="text-[12.5px] text-muted">{missingNow ? `${missingNow} still missing - add them, or say why in the notes.` : "Everything is held."}</p>
          )}
          <div className="flex gap-2">
            {h.checkedAt ? (
              <button type="button" disabled={busy} onClick={() => signOff(false)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink disabled:opacity-60">Undo checked</button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => signOff(true)} className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-60">
              {h.checkedAt ? "Save notes" : "Mark checked"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FactRow({ homeId, f, onSaved }: { homeId: string; f: Fact; onSaved: (d: Detail) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(f.kind === "date" ? (f.value && /^\d{4}-\d{2}-\d{2}/.test(f.value) ? f.value.slice(0, 10) : "") : f.value ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const differs = /differs/i.test(f.checkedAgainst ?? "");

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clean-sweep/${encodeURIComponent(homeId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ field: f.key, value: val }) });
      const j = await r.json();
      if (j.ok) { setEditing(false); onSaved(j); } else setErr(j.error || "That did not save.");
    } catch { setErr("That did not save - the OS could not be reached."); } finally { setBusy(false); }
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setErr(null);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData(); fd.append("file", file); fd.append("field", f.key);
        const r = await fetch(`/api/clean-sweep/${encodeURIComponent(homeId)}/file`, { method: "POST", body: fd });
        const j = await r.json();
        if (j.ok) onSaved(j); else { setErr(j.error || `${file.name} did not upload.`); break; }
      }
    } catch { setErr("That did not upload - the OS could not be reached."); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const inputType = f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold">{f.label}</p>
          {f.value ? (
            <p className="mt-0.5 break-words text-[13px]">{f.kind === "date" ? fmtDate(f.value) : f.value}</p>
          ) : f.note ? (
            <p className="mt-0.5 text-[12.5px] text-muted">{f.note}</p>
          ) : f.needed && !f.held ? (
            <span className="mt-1 inline-block rounded-full bg-[#f6e1dd] px-2 py-0.5 text-[11px] font-semibold text-[#9d4340]">Missing</span>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-muted">Not held</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {f.source && <span>{sourceLabel(f)}{f.sourceRef && f.source !== "manual" ? ` · ${f.sourceRef}` : ""}</span>}
            {f.checkedAgainst && <span className={differs ? "font-semibold text-[#8a6420]" : ""}>{f.checkedAgainst}</span>}
          </div>
          {f.files.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {f.files.slice(0, 12).map((x) => (
                <li key={x.key}>
                  <a href={`/api/r2/file?key=${encodeURIComponent(x.key)}`} target="_blank" rel="noopener noreferrer" className="flex max-w-[220px] items-center gap-1 rounded-full border border-line/80 px-2 py-0.5 text-[11px] hover:border-ink">
                    <DoodleIcon name="doc" size={11} /><span className="truncate">{x.name}</span>
                  </a>
                </li>
              ))}
              {f.files.length > 12 && <li className="text-[11px] text-muted">+{f.files.length - 12} more</li>}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {f.kind !== "file" && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold hover:border-ink">{f.value ? "Edit" : "Add"}</button>
          )}
          <input ref={fileRef} type="file" multiple className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => void upload(e.target.files)} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold hover:border-ink disabled:opacity-60">
            {busy ? "Saving…" : "Upload"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            type={inputType}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
            className="min-w-[200px] flex-1 rounded-xl border border-line/80 bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-ink"
          />
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page disabled:opacity-60">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-muted">Cancel</button>
        </div>
      )}
      {err && <p className="mt-1 text-[11.5px] text-[#9d4340]">{err}</p>}
    </li>
  );
}
