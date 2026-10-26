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
import FloatSheet, { FloatCard, FloatCardHead, FloatChoice, FloatFoot } from "@/components/new-look/FloatSheet";
import { digits, maskedAccount, readBank, sortCodeWords } from "@/lib/bank";

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
export function LogInvoice({ contractor, onClose, onSaved, bare = false, look, canSaveBack = false }: {
  contractor: Contractor; onClose: () => void; onSaved: (orderId: string) => void; bare?: boolean;
  /** The new look's floating boxes: the same fields and save, as cards for a FloatSheet. */
  look?: "float";
  /** Whether this person may edit the contractor, so may save changed bank details back to them. The server checks again. */
  canSaveBack?: boolean;
}) {
  const [props, setProps] = useState<Property[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Property | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [doneOn, setDoneOn] = useState("");
  const [payee, setPayee] = useState<"contractor" | "agent">("contractor");
  /* Where to pay them (Stuart Roper, 26 Oct 2026: "there's nowhere to put the
     contractor's bank details"). Filled from their record - the account
     number as its last four, kept unless a new one is typed - and changes
     can be saved back to them. */
  const heldSort = digits(contractor.bankSortCode);
  const heldLast4 = contractor.bankAccountLast4 ?? "";
  const [bankName, setBankName] = useState(contractor.bankAccountName ?? "");
  const [bankSort, setBankSort] = useState(heldSort ? sortCodeWords(heldSort) : "");
  const [bankAcct, setBankAcct] = useState("");
  const [saveBack, setSaveBack] = useState(false);
  const bankChanged = bankName.trim() !== (contractor.bankAccountName ?? "").trim() || digits(bankSort) !== heldSort || bankAcct.trim() !== "";
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
    if (payee === "contractor") {
      const keepsNumber = !bankAcct.trim() && heldLast4 && digits(bankSort) === heldSort;
      if (!bankAcct.trim() && heldLast4 && digits(bankSort) !== heldSort && bankSort.trim()) return setErr("Type the account number too, since the sort code has changed.");
      const check = readBank({ accountName: bankName, sortCode: bankSort, accountNumber: keepsNumber ? "00000000" : bankAcct });
      if (!check.ok) return setErr(check.error);
    }
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
    if (payee === "contractor") {
      fd.append("bankName", bankName);
      fd.append("bankSort", bankSort);
      fd.append("bankAccount", bankAcct);
      if (saveBack && bankChanged) fd.append("saveBank", "1");
    }
    fd.append("file", file);
    setBusy(true);
    const r = await fetch("/api/contractors/invoice", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "Could not log the invoice.");
    onSaved(String(r.order?.id ?? ""));
  }

  /* The bank boxes, the same in both looks bar the classes. Only when the contractor is being paid. */
  const bankBoxes = (fl: string, lb: string, hint: string, wrap: string) => (
    <>
      <div className={wrap}>
        <div className="sm:col-span-2"><label className={lb}>Name on the account</label><input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="As the bank has it" autoComplete="off" className={`${fl} mt-1`} /></div>
        <div><label className={lb}>Sort code</label><input value={bankSort} onChange={(e) => setBankSort(e.target.value)} inputMode="numeric" placeholder="12-34-56" autoComplete="off" className={`${fl} mt-1`} /></div>
        <div><label className={lb}>Account number</label><input value={bankAcct} onChange={(e) => setBankAcct(e.target.value)} inputMode="numeric" placeholder={heldLast4 ? `${maskedAccount(heldLast4).replace(/^e/, "E")} - type to change` : "8 digits"} autoComplete="off" className={`${fl} mt-1`} /></div>
      </div>
      <p className={hint}>
        {heldLast4 || contractor.bankAccountName
          ? `From ${contractor.name}'s record. Change them here if this invoice says otherwise.`
          : `Nothing on ${contractor.name}'s record yet. They go to accounts with the invoice.`}
      </p>
      {bankChanged && (canSaveBack ? (
        <label className="mt-2 flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={saveBack} onChange={(e) => setSaveBack(e.target.checked)} className="h-4 w-4 accent-[var(--accent-dark)]" />
          Save these to {contractor.name}&apos;s record too
        </label>
      ) : (
        <p className={hint}>Used for this invoice only. Whoever keeps {contractor.name}&apos;s record can update it.</p>
      ))}
    </>
  );

  if (look === "float") {
    const fl = "nl-fs-input";
    return (
      <>
        <FloatCard>
          <FloatCardHead title="The Home" />
          {picked ? (
            <div className="nl-fs-row">
              <span className="min-w-0 truncate">{picked.name}<span className="text-muted">{picked.locality ? ` · ${picked.locality}` : ""}</span></span>
              <button type="button" onClick={() => { setPicked(null); setQ(""); }} className="nl-link shrink-0">Change</button>
            </div>
          ) : (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={props === null ? "Reading the book…" : "Start typing the address"} aria-label="The home" className={fl} />
          )}
          {hits.length > 0 && (
            <ul className="nl-fs-list mt-2">
              {hits.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPicked(p)} className="flex w-full flex-col rounded-lg px-2 py-2 text-left hover:bg-panel">
                    <span className="text-[13.5px]">{p.name}</span>
                    <span className="text-[11.5px] text-muted">{p.locality}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!picked && props && q.trim().length > 2 && hits.length === 0 && <p className="nl-fs-hint">Not on the book. It will go on under the address as typed.</p>}
        </FloatCard>
        <FloatCard>
          <FloatCardHead title="The Invoice" />
          <div className="nl-fs-grid">
            <div className="is-wide"><label className="nl-fs-label">What the work was</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replaced kitchen tap" className={`${fl} mt-1`} /></div>
            <div><label className="nl-fs-label">Invoice total</label><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="£" className={`${fl} mt-1`} /></div>
            <div><label className="nl-fs-label">Their invoice number</label><input value={ref} onChange={(e) => setRef(e.target.value)} className={`${fl} mt-1`} /></div>
            <div><label className="nl-fs-label">When the work was done</label><div className="mt-1"><FieldDate value={doneOn} onChange={setDoneOn} placeholder="Today if left" /></div></div>
            <div>
              <span className="nl-fs-label">The invoice itself</span>
              <label className={`${fl} mt-1 flex cursor-pointer items-center justify-between gap-2`}>
                <span className={`truncate ${file ? "" : "text-muted"}`}>{file ? file.name : "PDF or photo"}</span>
                <span className="shrink-0 text-[12px] underline">{file ? "Change" : "Choose"}</span>
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { void attach(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          {(reading || readSaid) && (
            <p className="nl-fs-reading mt-3">
              {reading && <span className="nl-bo-spin" aria-hidden />}
              {reading ? "Reading the invoice…" : readSaid}
            </p>
          )}
        </FloatCard>
        <FloatCard>
          <FloatCardHead title="Who Is Paid" />
          <div className="grid gap-2 text-[13.5px]">
            <label className="nl-fs-tick-row"><input type="radio" name={`payee-${contractor.id}`} checked={payee === "contractor"} onChange={() => setPayee("contractor")} /><b>Pay {contractor.name}</b></label>
            <label className="nl-fs-tick-row"><input type="radio" name={`payee-${contractor.id}`} checked={payee === "agent"} onChange={() => setPayee("agent")} /><b>I paid them myself - reimburse me</b></label>
          </div>
        </FloatCard>
        {payee === "contractor" && (
          <FloatCard>
            <FloatCardHead title="Their Bank Details" aside="For accounts to pay them" />
            {bankBoxes("nl-fs-input", "nl-fs-label", "nl-fs-hint", "grid gap-3 sm:grid-cols-2")}
          </FloatCard>
        )}
        <FloatFoot left={err ? <span className="nl-fs-err" role="alert">{err}</span> : <span>Goes on the home as a finished job. Accounts are told.</span>}>
          <button type="button" onClick={onClose} className="nl-btn nl-fs-ghost">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="nl-btn nl-btn--primary">{busy ? "Logging…" : "Log the invoice"}</button>
        </FloatFoot>
      </>
    );
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
        {payee === "contractor" && (
          <div className="rounded-xl border border-line/70 p-3.5 sm:col-span-2">
            <p className="m-0 text-[13px] font-medium">Their bank details</p>
            {bankBoxes(field, "block text-[11px] text-muted", "mt-1.5 text-[11.5px] text-muted", "mt-2 grid gap-3 sm:grid-cols-2")}
          </div>
        )}
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
              <LogInvoice key={picked.id} contractor={picked} bare canSaveBack={!!picked.ownerId && picked.ownerId === me} onClose={close} onSaved={onSaved} />
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Log an invoice from the top of Contractors, in the new look's floating
 * boxes (25 Oct 2026). The same two parts as RaiseInvoiceDrawer - who it is
 * from, picked out of the book this person can see, then the same LogInvoice
 * and its same save - as two screens. Mount it only while it is open.
 */
export function RaiseInvoiceSheet({ contractors, me, canCorporate = false, onClose, onSaved }: {
  contractors: Pickable[];
  me: string | null;
  /** May keep the company's contractors, so may save bank details back to one. */
  canCorporate?: boolean;
  onClose: () => void;
  onSaved: (orderId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Pickable | null>(null);
  const hits = useMemo(() => {
    const needle = q.trim();
    const list = [...contractors].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return (needle ? list.filter((c) => searchMatches(needle, c.name, c.trade, c.contact, c.phone, c.email, c.ownerName ?? "")) : list).slice(0, 40);
  }, [contractors, q]);
  const whose = (c: Pickable) => (!c.ownerId ? "Company" : c.ownerId === me ? "Yours" : `${c.ownerName || "An agent"}'s`);
  return (
    <FloatSheet
      title="Log an Invoice"
      step={picked ? 2 : 1}
      steps={2}
      onBack={picked ? () => setPicked(null) : undefined}
      onClose={onClose}
      screenKey={picked ? `inv-${picked.id}` : "who"}
      question={picked ? "The invoice" : "Who is it from?"}
      lede={picked ? "Nobody else is emailed." : "For work done without a job on the OS. It goes on the home as a finished job with the invoice attached, and accounts are told."}
      foot={picked ? undefined : (
        <FloatFoot left={<span>{contractors.length ? `${contractors.length} in the book you can see` : ""}</span>}>
          <button type="button" onClick={onClose} className="nl-btn nl-fs-ghost">Cancel</button>
        </FloatFoot>
      )}
    >
      {picked ? (
        <>
          <FloatCard>
            <div className="flex items-center gap-3">
              <ContractorMark name={picked.name} logoUrl={picked.logoUrl} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{picked.name}</span>
                <span className="block truncate text-[12.5px] text-muted">{[picked.trade, whose(picked)].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" onClick={() => setPicked(null)} className="nl-link shrink-0">Change</button>
            </div>
          </FloatCard>
          <LogInvoice key={picked.id} contractor={picked} look="float" canSaveBack={picked.ownerId ? picked.ownerId === me : canCorporate} onClose={onClose} onSaved={onSaved} />
        </>
      ) : contractors.length === 0 ? (
        <FloatCard><p className="m-0 text-[13.5px] text-muted">There are no contractors in your book yet. Add them first with Add one.</p></FloatCard>
      ) : (
        <>
          <FloatCard>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, trade, phone…" aria-label="Search contractors" className="nl-fs-input" />
          </FloatCard>
          {hits.length === 0 ? (
            <p className="nl-fs-say">Nobody in the book matches that.</p>
          ) : (
            <div className="nl-fs-choices">
              {hits.map((c) => (
                <FloatChoice
                  key={c.id}
                  icon={<ContractorMark name={c.name} logoUrl={c.logoUrl} size={34} />}
                  title={`${c.name}${c.active ? "" : " · not active"}`}
                  text={[c.trade, c.contact].filter(Boolean).join(" · ") || undefined}
                  aside={<span className="text-muted">{whose(c)}</span>}
                  onClick={() => setPicked(c)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </FloatSheet>
  );
}
