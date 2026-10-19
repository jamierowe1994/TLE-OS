"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contractor, WorksOrder } from "@/lib/works-orders";
import { Fact, STATUS_LABEL, day, pounds, type Property } from "@/components/maintenance/works-ui";
import { hhmm } from "@/lib/london-clock";
import { searchMatches } from "@/lib/search-match";
import FieldDate from "@/components/FieldDate";

type Stats = { jobs: number; open: number; quotedPence: number; invoicedPence: number; paidPence: number; outstandingPence: number; lastJobAt: string | null };

/**
 * One contractor, pulled out: who they are, what they have done for us, what
 * is owed - and, since 19 Oct 2026, a way to log an invoice they emailed in
 * for work that never had a job on the OS (Rhiannon: contractors "don't do
 * technology", so the invoice arrives by email and somebody has to put it on).
 *
 * Moved here from the Maintenance page when Contractors got its own place
 * under Portfolio.
 */
export default function ContractorProfile({ id, ownerName, onClose, onEdit, onChanged, canEdit }: {
  id: string;
  /** Whose book they are in, by name, when it is somebody else's (the office's view). */
  ownerName?: string | null;
  onClose: () => void;
  onEdit: (c: Contractor) => void;
  onChanged?: () => void;
  canEdit: (c: Contractor) => boolean;
}) {
  const [d, setD] = useState<{ contractor: Contractor; stats: Stats; jobs: WorksOrder[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [logging, setLogging] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    fetch(`/api/contractors?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setD(j); else setErr(j.error ?? "Could not read them."); })
      .catch(() => setErr("Could not read them."));
    return () => cancelAnimationFrame(t);
  }, [id, nonce]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = d?.contractor;
  const whose = c ? (c.ownerId ? (ownerName ? `${ownerName}'s contractor` : "Your contractor") : "Company contractor") : "Contractor";
  const upcoming = (d?.jobs ?? []).filter((o) => o.status === "scheduled" && o.scheduledAt).sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1));
  return (
    <div className="fixed inset-0 z-[130]">
      <button aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${shown ? "translate-x-0" : "translate-x-full"}`} style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        <div className="shrink-0 border-b border-line/70 px-6 pt-5">
          <div className="flex items-start justify-between gap-3 pb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{whose}{c && !c.active ? " · not active" : ""}</p>
              <h2 className="mt-1 text-[20px] leading-tight">{c?.name ?? (err ? "Not found" : "Reading…")}</h2>
              <p className="mt-1 text-[12px] text-muted">{c ? [c.trade, c.contact, c.registration].filter(Boolean).join(" · ") : err ?? ""}</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {c && <button type="button" onClick={() => setLogging((v) => !v)} className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page">Log an invoice</button>}
              {c && canEdit(c) && <button type="button" onClick={() => onEdit(c)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">Edit</button>}
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
            </div>
          </div>
        </div>
        {!d && !err && (
          <div className="flex flex-1 items-center justify-center text-[12.5px] text-muted">
            <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading their record…
          </div>
        )}
        {c && d && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {logging && (
              <LogInvoice
                contractor={c}
                onClose={() => setLogging(false)}
                onSaved={() => { setLogging(false); setNonce((n) => n + 1); onChanged?.(); }}
              />
            )}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <section className="rounded-[22px] border border-line/50 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">How to reach them</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
                    <Fact k="Phone" v={c.phone || "-"} />
                    <Fact k="Email" v={c.email || "-"} />
                    <Fact k="Website" v={c.website || "-"} />
                    <Fact k="Address" v={c.address || "-"} />
                    <Fact k="Registration" v={c.registration || "-"} />
                    <Fact k="Added by" v={c.createdBy || "-"} />
                  </dl>
                  {c.notes && <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed">{c.notes}</p>}
                </section>
                {upcoming.length > 0 && (
                  <section className="rounded-[22px] border border-line/50 bg-white p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Booked in</p>
                    <ul className="mt-2 divide-y divide-line/50">
                      {upcoming.map((o) => (
                        <li key={o.id}>
                          <a href={`/maintenance?open=${encodeURIComponent(o.id)}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-accent-soft/20">
                            <span className="min-w-0">
                              <span className="block truncate text-[13px]">{o.propertyName}</span>
                              <span className="block truncate text-[10.5px] text-muted">#{o.ref} · {o.title}</span>
                            </span>
                            <span className="figures shrink-0 text-[12.5px]">{day(o.scheduledAt)} · {hhmm(o.scheduledAt!)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="rounded-[22px] border border-line/50 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Their jobs</p>
                  {d.jobs.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-muted">None yet. Put them on a job and it shows here.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line/50">
                      {d.jobs.map((o) => (
                        <li key={o.id}>
                          <a href={`/maintenance?open=${encodeURIComponent(o.id)}`} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-accent-soft/20">
                            <span className="min-w-0">
                              <span className="block truncate text-[13px]">#{o.ref} · {o.title}</span>
                              <span className="block truncate text-[10.5px] text-muted">{o.propertyName} · {STATUS_LABEL[o.status]}</span>
                            </span>
                            <span className="figures shrink-0 text-[12.5px]">{o.invoicePence != null ? pounds(o.invoicePence) : o.quotePence != null ? `${pounds(o.quotePence)} quoted` : "-"}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <section className="h-fit rounded-[22px] border border-line/50 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Money through them</p>
                <dl className="mt-2 space-y-2 text-[12.5px]">
                  <div className="flex justify-between"><dt className="text-muted">Jobs</dt><dd className="figures">{d.stats.jobs}{d.stats.open ? ` · ${d.stats.open} open` : ""}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Quoted</dt><dd className="figures">{pounds(d.stats.quotedPence)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Invoiced</dt><dd className="figures">{pounds(d.stats.invoicedPence)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="figures">{pounds(d.stats.paidPence)}</dd></div>
                  <div className="flex justify-between border-t border-line/60 pt-2 font-semibold"><dt>Owed to them</dt><dd className="figures">{pounds(d.stats.outstandingPence)}</dd></div>
                </dl>
                <p className="mt-3 text-[11px] text-muted">Read off the jobs they were on: the quote logged, the invoice added, and what is marked paid.</p>
              </section>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/**
 * Their invoice, for work done without a job on the OS. It goes on as a
 * finished job with the invoice attached, and accounts are told - the same
 * as an invoice the contractor uploads themselves.
 */
export function LogInvoice({ contractor, onClose, onSaved }: { contractor: Contractor; onClose: () => void; onSaved: (orderId: string) => void }) {
  const [props, setProps] = useState<Property[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Property | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [doneOn, setDoneOn] = useState("");
  const [payee, setPayee] = useState<"contractor" | "agent">("contractor");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* The office reads the whole compliance book; an agent is refused it and
     searches their own Portfolio instead, the same as Raise a repair. */
  useEffect(() => {
    const fromPortfolio = () =>
      fetch("/api/portfolio", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setProps(Array.isArray(j.properties)
          ? (j.properties as { propertyId: string | null; name: string; locality: string; landlord: { name: string } | null }[])
              .filter((p, i, all) => p.propertyId && all.findIndex((x) => x.propertyId === p.propertyId && x.name === p.name) === i)
              .map((p) => ({ id: p.propertyId as string, name: p.name, locality: p.locality, landlord: p.landlord?.name ?? "" }))
          : []))
        .catch(() => setProps([]));
    fetch("/api/compliance/book", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok && Array.isArray(j.properties)
        ? setProps(j.properties.map((p: Property) => ({ id: p.id, name: p.name, locality: p.locality, landlord: p.landlord })))
        : fromPortfolio()))
      .catch(() => fromPortfolio());
  }, []);
  const hits = useMemo(() => {
    const needle = q.trim();
    if (!props || needle.length < 2 || picked) return [];
    return props.filter((p) => searchMatches(needle, p.name, p.locality)).slice(0, 6);
  }, [props, q, picked]);
  const field = "w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";

  async function save() {
    setErr(null);
    const propertyName = picked?.name ?? q.trim();
    if (!propertyName) return setErr("Which home was the work at?");
    if (!title.trim()) return setErr("Say what the work was.");
    if (!amount.trim()) return setErr("The invoice needs its total.");
    if (!file) return setErr("Attach the invoice itself - the PDF or a photo of it.");
    const fd = new FormData();
    fd.append("contractorId", contractor.id);
    fd.append("propertyId", picked?.id ?? "");
    fd.append("propertyName", propertyName);
    fd.append("locality", picked?.locality ?? "");
    fd.append("landlord", typeof picked?.landlord === "string" ? picked.landlord : "");
    fd.append("title", title.trim());
    fd.append("amount", amount);
    fd.append("ref", ref.trim());
    fd.append("payee", payee);
    if (doneOn) fd.append("completedAt", doneOn);
    fd.append("file", file);
    setBusy(true);
    const r = await fetch("/api/contractors/invoice", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not log the invoice.");
    onSaved(String(r.order?.id ?? ""));
  }

  return (
    <section className="mb-4 rounded-[22px] border border-ink/30 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px]">Log an Invoice from {contractor.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">For work done without a job on the OS. It goes on the home as a finished job with the invoice attached, and accounts are told. Nobody else is emailed.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-[11.5px] text-muted underline">Cancel</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px]">
              <span className="min-w-0 truncate">{picked.name}<span className="text-muted">{picked.locality ? ` · ${picked.locality}` : ""}</span></span>
              <button type="button" onClick={() => { setPicked(null); setQ(""); }} className="shrink-0 text-[11.5px] text-muted underline">Change</button>
            </div>
          ) : (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={props === null ? "Reading the book…" : "The home - start typing the address"} className={field} />
          )}
          {hits.length > 0 && (
            <ul className="mt-2 divide-y divide-line/50 rounded-xl border border-line/80 bg-card">
              {hits.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPicked(p)} className="flex w-full flex-col px-3 py-2 text-left hover:bg-panel">
                    <span className="text-[13px]">{p.name}</span>
                    <span className="text-[10.5px] text-muted">{p.locality}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!picked && props && q.trim().length > 2 && hits.length === 0 && <p className="mt-1.5 text-[11px] text-muted">Not on the book. It will go on under the address as typed.</p>}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What the work was, e.g. Replaced kitchen tap" className={`${field} sm:col-span-2`} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="£ invoice total" className={field} />
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Their invoice number" className={field} />
        <FieldDate value={doneOn} onChange={setDoneOn} placeholder="When the work was done (today if left)" />
        <label className={`${field} flex cursor-pointer items-center justify-between gap-2`}>
          <span className={`truncate ${file ? "" : "text-muted"}`}>{file ? file.name : "Attach the invoice (PDF or photo)"}</span>
          <span className="shrink-0 text-[11.5px] underline">{file ? "Change" : "Choose"}</span>
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
        <div className="flex flex-wrap gap-4 text-[12.5px] sm:col-span-2">
          <label className="flex items-center gap-2"><input type="radio" name="payee" checked={payee === "contractor"} onChange={() => setPayee("contractor")} />Pay {contractor.name}</label>
          <label className="flex items-center gap-2"><input type="radio" name="payee" checked={payee === "agent"} onChange={() => setPayee("agent")} />I paid them myself - reimburse me</label>
        </div>
      </div>
      {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" disabled={busy} onClick={() => void save()} className={`rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
          {busy ? "Logging…" : "Log the invoice"}
        </button>
      </div>
    </section>
  );
}
