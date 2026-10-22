"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contractor } from "@/lib/works-orders";
import { type Property } from "@/components/maintenance/works-ui";
import { searchMatches } from "@/lib/search-match";
import { useSlideOver } from "@/lib/use-slide-over";
import FieldDate from "@/components/FieldDate";
import DoodleIcon from "@/components/DoodleIcon";
import ContractorMark from "@/components/contractors/ContractorMark";
import { readInvoiceFile, readLine } from "@/components/maintenance/read-invoice";

/**
 * Their invoice, for work done without a job on the OS. It goes on as a
 * finished job with the invoice attached, and accounts are told - the same
 * as an invoice the contractor uploads themselves.
 *
 * Moved out of ContractorProfile (James, 21 Oct 2026) so the same form opens
 * from the top of Contractors, with a contractor to pick first, as well as
 * from inside a contractor's record. `bare` drops its own frame and heading
 * when the caller draws them.
 */
export function LogInvoice({ contractor, onClose, onSaved, bare = false }: { contractor: Contractor; onClose: () => void; onSaved: (orderId: string) => void; bare?: boolean }) {
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
  /* The figure read off the invoice as it is attached (20 Oct 2026: "can I
     not see how much it is?"), for the agent to check. */
  const [reading, setReading] = useState(false);
  const [readSaid, setReadSaid] = useState<string | null>(null);
  async function attach(f: File | null) {
    setFile(f);
    setReadSaid(null);
    if (!f) return;
    setReading(true);
    const r = await readInvoiceFile(f);
    setReading(false);
    const line = readLine(r);
    if (!line) return setReadSaid("Couldn't read the total off it. Type it in.");
    if (r?.total != null) setAmount((a) => a.trim() || r.total!.toFixed(2));
    if (r?.ref) setRef((x) => x.trim() || r.ref!);
    setReadSaid(`Read from the invoice: ${line}. Check it before you log it.`);
  }
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

  const body = (
    <>
      <div className={`grid gap-3 sm:grid-cols-2 ${bare ? "" : "mt-4"}`}>
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
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { void attach(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
        {(reading || readSaid) && (
          <p className="flex items-center gap-2 text-[12px] text-muted sm:col-span-2">
            {reading && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
            {reading ? "Reading the invoice…" : readSaid}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] sm:col-span-2">
          <label className="flex items-center gap-2"><input type="radio" name={`payee-${contractor.id}`} checked={payee === "contractor"} onChange={() => setPayee("contractor")} />Pay {contractor.name}</label>
          <label className="flex items-center gap-2"><input type="radio" name={`payee-${contractor.id}`} checked={payee === "agent"} onChange={() => setPayee("agent")} />I paid them myself - reimburse me</label>
        </div>
      </div>
      {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        {bare && <button type="button" onClick={onClose} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink">Cancel</button>}
        <button type="button" disabled={busy} onClick={() => void save()} className={`rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
          {busy ? "Logging…" : "Log the invoice"}
        </button>
      </div>
    </>
  );

  if (bare) return body;
  return (
    <section className="mb-4 rounded-[22px] border border-ink/30 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px]">Log an Invoice from {contractor.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">For work done without a job on the OS. It goes on the home as a finished job with the invoice attached, and accounts are told. Nobody else is emailed.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-[11.5px] text-muted underline">Cancel</button>
      </div>
      {body}
    </section>
  );
}

type Pickable = Contractor & { ownerName?: string | null };

/**
 * Log an invoice from the top of Contractors (James, 21 Oct 2026: "we should
 * also have a Raise invoice button across the top to speed this up, rather
 * than clicking into the contractor and then Log an invoice"). Who it is
 * from first - searched, out of the book this person can see - then the
 * same form.
 */
export function RaiseInvoiceDrawer({ open, contractors, me, onClose, onSaved }: {
  open: boolean;
  contractors: Pickable[];
  me: string | null;
  onClose: () => void;
  onSaved: (orderId: string) => void;
}) {
  const { shown, close } = useSlideOver(open, onClose);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Pickable | null>(null);
  useEffect(() => { if (!open) { setQ(""); setPicked(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  const hits = useMemo(() => {
    const needle = q.trim();
    const list = [...contractors].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return (needle ? list.filter((c) => searchMatches(needle, c.name, c.trade, c.contact, c.phone, c.email, c.ownerName ?? "")) : list).slice(0, 40);
  }, [contractors, q]);
  if (!open) return null;
  const whose = (c: Pickable) => (!c.ownerId ? "Company" : c.ownerId === me ? "Yours" : `${c.ownerName || "An agent"}'s`);
  return (
    <div className="so-root fixed inset-0 z-[130]" data-shown={shown}>
      <button aria-label="Close" onClick={close} data-shown={shown} className="so-scrim absolute inset-0 cursor-default bg-ink/35" />
      <aside data-shown={shown} className="so-panel absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] lg:w-[720px]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-5 pb-5 pt-6 sm:px-7">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Contractors</p>
            <h2 className="mt-1 text-[22px] leading-tight">Log an Invoice</h2>
            <p className="mt-1 text-[12px] text-muted">For work done without a job on the OS. It goes on the home as a finished job with the invoice attached, and accounts are told. Nobody else is emailed.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 bg-white text-muted hover:text-ink">
            <DoodleIcon name="cross" size={13} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <section className="rounded-2xl border border-line/70 bg-white p-4 sm:p-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">1 · Who it is from</p>
            {picked ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-line/80 bg-box px-3 py-2.5">
                <ContractorMark name={picked.name} logoUrl={picked.logoUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{picked.name}</span>
                  <span className="block truncate text-[11px] text-muted">{[picked.trade, whose(picked)].filter(Boolean).join(" · ")}</span>
                </span>
                <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-[11.5px] text-muted underline">Change</button>
              </div>
            ) : contractors.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-muted">There are no contractors in your book yet. Add them first with Add a contractor.</p>
            ) : (
              <>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, trade, phone…" className="mt-3 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink" />
                <ul className="mt-2 max-h-[340px] divide-y divide-line/50 overflow-y-auto rounded-xl border border-line/70">
                  {hits.length === 0 ? (
                    <li className="px-3 py-3 text-[12.5px] text-muted">Nobody in the book matches that.</li>
                  ) : hits.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setPicked(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-panel">
                        <ContractorMark name={c.name} logoUrl={c.logoUrl} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13px] ${c.active ? "" : "text-muted"}`}>{c.name}{c.active ? "" : " · not active"}</span>
                          <span className="block truncate text-[10.5px] text-muted">{[c.trade, c.contact].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 text-[10.5px] text-muted">{whose(c)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {picked && (
            <section className="mt-4 rounded-2xl border border-line/70 bg-white p-4 sm:p-5">
              <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted">2 · The invoice</p>
              <LogInvoice key={picked.id} contractor={picked} bare onClose={close} onSaved={onSaved} />
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
