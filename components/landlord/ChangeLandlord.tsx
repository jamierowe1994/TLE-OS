"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import ContactBlock from "@/components/ContactBlock";
import { PressButton } from "@/components/Bits";
import { KIND_LABEL, LANDLORD_KINDS, papersFor, type ChangedLandlord, type Director, type LandlordKind } from "@/lib/landlord-kinds";

/**
 * CHANGE LANDLORD (Dan Richards, 17 Oct 2026, ticket 083d7752).
 *
 * "I have 2 properties that are actually in company names so I need to change
 * the landlord record from a private person to a company ... It should appear
 * on the property record in the landlord section and require a further
 * confirmation setting before it implements the changes."
 *
 * On the listing's Landlord box and the home's page on Portfolio. Screens of
 * related questions sliding across (James's rule for any longer form): what
 * kind of landlord it is now, who they are, how we reach them, then a check
 * screen that says who it was and who it will be, with a tick to confirm.
 * Nothing changes until Change the landlord is pressed on that screen.
 *
 * Once changed, ChangedLandlordCard shows the company, estate or new owner
 * with what kind they are, the directors, who it was before, Undo, and the
 * papers the PLC check will need for that kind of landlord (LandlordPapers).
 * Kept in the OS (lib/landlord-change): the listings system is not changed.
 */

type Current = { name: string; email: string | null; phone: string | null } | null;
type Where = { listingId?: string | null; propertyId?: string | null; address: string };

const field = "w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13px] outline-none focus:border-ink/40";
const lbl = "block text-[11.5px] text-muted";

export function ChangeLandlordButton({ where, current, label, className, onChanged }: { where: Where; current: Current; label?: string; className?: string; onChanged: (c: ChangedLandlord) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "mt-3 inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink"}
      >
        {!className && <DoodleIcon name="user" size={12} className="text-accent-dark" />}
        {label ?? (current ? "Change landlord" : "Add the landlord")}
      </button>
      {open && <ChangeLandlordSheet where={where} current={current} onClose={() => setOpen(false)} onChanged={(c) => { setOpen(false); onChanged(c); }} />}
    </>
  );
}

type Step = "kind" | "who" | "reach" | "check";
const STEPS: { id: Step; title: string; blurb: string }[] = [
  { id: "kind", title: "Who owns the home now?", blurb: "Pick the kind of landlord. It decides the details we need and the papers for the PLC check." },
  { id: "who", title: "Who they are", blurb: "As it reads on the title or at Companies House." },
  { id: "reach", title: "How we reach them", blurb: "The email and number the OS uses for this landlord from now on." },
  { id: "check", title: "Check and confirm", blurb: "Nothing has changed yet. Read it through, then confirm." },
];

function ChangeLandlordSheet({ where, current, onClose, onChanged }: { where: Where; current: Current; onClose: () => void; onChanged: (c: ChangedLandlord) => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [kind, setKind] = useState<LandlordKind | null>(null);
  const [name, setName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [lateOwner, setLateOwner] = useState("");
  const [contactName, setContactName] = useState("");
  const [directors, setDirectors] = useState<Director[]>([{ name: "", email: null, phone: null }, { name: "", email: null, phone: null }]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const body = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const here = STEPS[step];
  const named = directors.filter((d) => d.name.trim());
  const shownName = kind === "executor" ? (name.trim() || (lateOwner.trim() ? `Estate of ${lateOwner.trim()}` : "")) : name.trim();

  /** What is missing on a screen, in a sentence, or null when it can move on. */
  function missing(id: Step): string | null {
    if (id === "kind") return kind ? null : "Pick one to carry on.";
    if (id === "who") {
      if (kind === "company") {
        if (name.trim().length < 2) return "Put the company's name in.";
        if (!named.length) return "Put at least one director in.";
      }
      if (kind === "executor") {
        if (!lateOwner.trim()) return "Put the name of the owner who has died.";
        if (contactName.trim().length < 2) return "Put the executor's name in.";
      }
      if (kind === "private" && name.trim().length < 2) return "Put the new owner's name in.";
      return null;
    }
    if (id === "reach") return email.trim() || phone.trim() ? null : "An email or a phone number, so the OS can reach them.";
    return sure ? null : "Tick to confirm first.";
  }

  function go(by: 1 | -1) {
    setErr(null);
    if (by === 1) {
      const m = missing(here.id);
      if (m) { setErr(m); return; }
    }
    setDir(by);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + by)));
    body.current?.scrollTo({ top: 0 });
  }
  function jump(id: Step) {
    setErr(null);
    setDir(-1);
    setStep(STEPS.findIndex((s) => s.id === id));
  }

  /* The first director's details are the company's to begin with. */
  function pickKind(k: LandlordKind) {
    setKind(k);
    setErr(null);
    setDir(1);
    setStep(1);
  }
  useEffect(() => {
    if (here.id !== "reach" || email || phone) return;
    const from = kind === "company" ? named[0] : null;
    if (from?.email) setEmail(from.email);
    if (from?.phone) setPhone(from.phone);
  }, [here.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    const m = missing("check");
    if (m) { setErr(m); return; }
    if (busy || !kind) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/landlord/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId: where.listingId ?? null,
        propertyId: where.propertyId ?? null,
        kind,
        name: kind === "executor" ? shownName : name,
        companyNumber,
        contactName: kind === "company" ? (named[0]?.name ?? "") : contactName,
        email,
        phone,
        directors: kind === "company" ? named : [],
        lateOwner,
        confirm: true,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(r?.error ?? "The landlord couldn't be changed just now. Try again in a minute."); return; }
    onChanged(r.change as ChangedLandlord);
  }

  const setDirector = (i: number, patch: Partial<Director>) =>
    setDirectors((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change landlord"
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-page shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name="user" size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] leading-tight">{current ? "Change landlord" : "Add the landlord"}</h3>
            <p className="mt-0.5 truncate text-[12px] text-muted">{where.address}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30 disabled:opacity-40">
            Close
          </button>
        </div>

        <div className="flex gap-1.5 px-5 pt-4">
          {STEPS.map((x, i) => (
            <span key={x.id} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent-dark" : "bg-line/70"}`} />
          ))}
        </div>

        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          <div
            key={here.id}
            className="mt-4"
            style={{ animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT" || here.id === "check") return;
              e.preventDefault();
              go(1);
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{step + 1} of {STEPS.length}</p>
            <p className="mt-0.5 text-[16px] font-semibold leading-tight">{here.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{here.blurb}</p>

            {here.id === "kind" && (
              <div className="mt-4 grid gap-2.5">
                {current && (
                  <p className="rounded-xl bg-box px-3.5 py-2.5 text-[12px] text-muted">
                    The landlord now: <b className="font-semibold text-ink">{current.name}</b>
                  </p>
                )}
                {LANDLORD_KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => pickKind(k.kind)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${kind === k.kind ? "border-ink bg-white" : "border-line/80 bg-white hover:border-ink/40"}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                      <DoodleIcon name={k.icon} size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold">{k.label}</span>
                      <span className="block text-[12px] text-muted">{k.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {here.id === "who" && kind === "company" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                <label className={lbl}>Company name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" placeholder="e.g. Girohomes Ltd" className={`${field} mt-1`} /></label>
                <label className={lbl}>Company number<input value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} maxLength={10} autoComplete="off" placeholder="01234567" className={`${field} mt-1`} /></label>
                <div className="sm:col-span-2">
                  <p className="mt-1 text-[12.5px] font-semibold">Directors</p>
                  <p className="text-[11.5px] text-muted">Each director&apos;s ID and AML check go to the PLC check. The first is who we deal with.</p>
                  <div className="mt-2 space-y-2.5">
                    {directors.map((d, i) => (
                      <div key={i} className="rounded-xl border border-line/60 bg-white p-3">
                        <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          Director {i + 1}
                          {i >= 2 && (
                            <button type="button" onClick={() => setDirectors((ds) => ds.filter((_, j) => j !== i))} className="text-[11px] font-normal normal-case tracking-normal underline">Remove</button>
                          )}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input aria-label={`Director ${i + 1} name`} value={d.name} onChange={(e) => setDirector(i, { name: e.target.value })} placeholder="Full name" autoComplete="off" className={field} />
                          <input aria-label={`Director ${i + 1} email`} type="email" value={d.email ?? ""} onChange={(e) => setDirector(i, { email: e.target.value || null })} placeholder="Email" autoComplete="off" className={field} />
                          <input aria-label={`Director ${i + 1} phone`} type="tel" value={d.phone ?? ""} onChange={(e) => setDirector(i, { phone: e.target.value || null })} placeholder="Phone" autoComplete="off" className={field} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {directors.length < 6 && (
                    <button type="button" onClick={() => setDirectors((ds) => [...ds, { name: "", email: null, phone: null }])} className="mt-2 text-[12px] font-semibold text-accent-dark underline-offset-2 hover:underline">
                      + Add another director
                    </button>
                  )}
                </div>
              </div>
            )}

            {here.id === "who" && kind === "executor" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className={lbl}>The owner who has died<input value={lateOwner} onChange={(e) => setLateOwner(e.target.value)} maxLength={120} autoComplete="off" placeholder={current?.name ?? "Full name"} className={`${field} mt-1`} /></label>
                <label className={lbl}>The executor<input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} autoComplete="off" placeholder="Who acts for the estate" className={`${field} mt-1`} /></label>
                <label className={`${lbl} sm:col-span-2`}>
                  Name on the record
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" placeholder={lateOwner.trim() ? `Estate of ${lateOwner.trim()}` : "Estate of …"} className={`${field} mt-1`} />
                  <span className="mt-1 block text-[11px]">Leave it blank for &quot;Estate of&quot; and their name.</span>
                </label>
              </div>
            )}

            {here.id === "who" && kind === "private" && (
              <div className="mt-4 grid gap-3">
                <label className={lbl}>The new owner&apos;s full name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" className={`${field} mt-1`} /></label>
                <p className="text-[11.5px] text-muted">A second owner goes on as Add additional landlord once this is saved.</p>
              </div>
            )}

            {here.id === "reach" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className={lbl}>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={`${field} mt-1`} /></label>
                <label className={lbl}>Phone<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className={`${field} mt-1`} /></label>
                <p className="text-[11.5px] text-muted sm:col-span-2">
                  {kind === "company" ? "Filled from the first director. Change it if the company has its own inbox." : kind === "executor" ? "The executor's, or their solicitor's." : "The new owner's own."}
                </p>
              </div>
            )}

            {here.id === "check" && kind && (
              <div className="mt-4 space-y-3 text-[13px]">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-2xl border border-line/70 bg-box/60 px-4 py-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The landlord now</p>
                    <p className="mt-1 font-semibold">{current?.name ?? "Nobody on record"}</p>
                    {current?.email && <p className="truncate text-[12px] text-muted">{current.email}</p>}
                  </div>
                  <div className="rounded-2xl border border-ink/70 bg-white px-4 py-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-dark">From now on · {KIND_LABEL[kind]}</p>
                    <p className="mt-1 font-semibold">{shownName}</p>
                    {companyNumber.trim() && <p className="text-[12px] text-muted">Company number {companyNumber.trim().toUpperCase()}</p>}
                    {kind === "executor" && contactName.trim() && <p className="text-[12px] text-muted">Executor: {contactName.trim()}</p>}
                    {kind === "company" && named.length > 0 && <p className="text-[12px] text-muted">Directors: {named.map((d) => d.name.trim()).join(", ")}</p>}
                    {email.trim() && <p className="truncate text-[12px] text-muted">{email.trim()}</p>}
                    {phone.trim() && <p className="text-[12px] text-muted">{phone.trim()}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
                  <button type="button" onClick={() => jump("kind")} className="underline">Change the kind</button>
                  <button type="button" onClick={() => jump("who")} className="underline">Change who they are</button>
                  <button type="button" onClick={() => jump("reach")} className="underline">Change how we reach them</button>
                </div>
                <ul className="space-y-1.5 rounded-2xl bg-accent-soft/40 px-4 py-3 text-[12px] leading-relaxed">
                  <li>Emails to the landlord about this home go to {shownName || "them"} from now on.</li>
                  <li>{current?.name ?? "The old landlord"} stays on the history, and Undo puts them back.</li>
                  <li>Next, add the papers for the PLC check: {papersFor(kind, { name: shownName, contactName, directors: named }).filter((p, i, all) => all.findIndex((x) => x.type === p.type) === i).map((p) => p.label.replace(/^.*?: /, "")).join(", ")}.</li>
                </ul>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/80 bg-white px-3.5 py-3 text-[12.5px]">
                  <input type="checkbox" checked={sure} onChange={(e) => { setSure(e.target.checked); setErr(null); }} className="mt-0.5 h-4 w-4 accent-[var(--brown)]" />
                  <span>I&apos;ve checked {shownName || "this"} is the legal owner of this home now.</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {err && <p className="px-5 pt-2 text-[12px] text-accent-dark">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3.5">
          <button type="button" onClick={() => (step === 0 ? onClose() : go(-1))} disabled={busy} className="rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] text-muted hover:text-ink disabled:opacity-40">
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {here.id === "check" ? (
            <PressButton onClick={() => void confirm()} disabled={busy || !sure} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
              {busy ? "Changing…" : current ? "Change the landlord" : "Add the landlord"}
            </PressButton>
          ) : here.id !== "kind" ? (
            <PressButton onClick={() => go(1)} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page">Continue</PressButton>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** The landlord as changed in the OS: what kind, who, who it was, Undo, and their papers. */
export function ChangedLandlordCard({ change, where, from, onUndone, onChanged, homeAddress }: {
  change: ChangedLandlord;
  where: Where;
  from: { kind: "listing"; id: string };
  homeAddress?: string | null;
  onUndone: () => void;
  onChanged: (c: ChangedLandlord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function undo() {
    if (!window.confirm(`Undo the change to ${change.name}? ${change.previous?.name ?? "The landlord before"} shows again.`)) return;
    setBusy(true);
    const r = await fetch(`/api/landlord/change?id=${encodeURIComponent(change.id)}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(r?.error ?? "That couldn't be undone just now."); return; }
    onUndone();
  }
  const day = new Date(change.changedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="text-[13px]">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-dark">{KIND_LABEL[change.kind]}</span>
        {change.companyNumber && <span className="text-muted">Company number {change.companyNumber}</span>}
      </p>
      <ContactBlock
        className="max-w-[440px]"
        role="landlord"
        person={{ name: change.name, email: change.email, phone: change.phone }}
        personRef={null}
        home={homeAddress ? { propertyAddress: homeAddress } : undefined}
      />
      {(change.directors.length > 0 || change.contactName) && (
        <div className="mt-2.5 text-[12px] text-muted">
          {change.kind === "company" ? (
            <ul className="space-y-0.5">
              {change.directors.map((d, i) => (
                <li key={i}><span className="font-semibold text-ink">Director:</span> {d.name}{d.email ? ` · ${d.email}` : ""}{d.phone ? ` · ${d.phone}` : ""}</li>
              ))}
            </ul>
          ) : (
            <p><span className="font-semibold text-ink">Executor:</span> {change.contactName}{change.lateOwner ? ` · for ${change.lateOwner}` : ""}</p>
          )}
        </div>
      )}
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
        Changed by {change.changedBy || "the office"} on {day}{change.previous?.name ? `, from ${change.previous.name}` : ""}. Kept on the OS record.
      </p>
      <div className="mt-1.5 flex flex-wrap gap-4 text-[11.5px] text-muted">
        <ChangeLandlordButton where={where} current={{ name: change.name, email: change.email, phone: change.phone }} label="Change again" className="underline hover:text-ink" onChanged={onChanged} />
        <button type="button" onClick={() => void undo()} disabled={busy} className="underline hover:text-ink disabled:opacity-40">{busy ? "Undoing…" : "Undo"}</button>
      </div>
      {err && <p className="mt-1.5 text-[11.5px] text-accent-dark">{err}</p>}
      <LandlordPapers change={change} where={where} from={from} />
    </div>
  );
}

type Doc = { id: string; type: string; name: string; fileName: string; url: string; at: string };

/**
 * The papers the PLC check needs for this kind of landlord, as slots with an
 * Upload on each. Filed as the home's documents (/api/documents), named for
 * whose they are ("Landlord ID - Director 2 - Jane Smith"), which is where
 * the PLC check already looks for a landlord's ID and AML.
 */
function LandlordPapers({ change, where, from }: { change: ChangedLandlord; where: Where; from: { kind: "listing"; id: string } }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const [slotFor, setSlotFor] = useState<string | null>(null);
  const slots = papersFor(change.kind, { name: change.name, contactName: change.contactName, directors: change.directors });
  const query = new URLSearchParams({ address: where.address, property: String(where.propertyId ?? "") }).toString();

  const load = useCallback(() => {
    fetch(`/api/documents?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.ok) { setDocs(j.docs ?? []); setFailed(false); } else setFailed(true); })
      .catch(() => setFailed(true));
  }, [query]);
  useEffect(() => { load(); }, [load]);

  /* A slot is filled by a document of its type for its person, added since the change. */
  const filledBy = (s: (typeof slots)[number]) =>
    (docs ?? []).filter((d) => d.type === s.type && (!s.who || d.name.includes(s.who)) && d.at >= change.changedAt.slice(0, 10));

  async function upload(files: FileList | null) {
    const s = slots.find((x) => x.key === slotFor);
    if (!s || !files?.length) return;
    setBusy(s.key);
    setErr(null);
    for (const file of [...files].slice(0, s.many ?? 1)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", s.type);
      fd.append("name", "");
      fd.append("who", s.who ?? "");
      fd.append("address", where.address);
      fd.append("property", String(where.propertyId ?? ""));
      fd.append("from", from.kind);
      fd.append("fromId", from.id);
      const j = await fetch("/api/documents", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { setErr(j?.error ?? "That did not upload. Try again."); break; }
      setDocs(j.docs ?? []);
    }
    setBusy(null);
    setSlotFor(null);
    if (picker.current) picker.current.value = "";
  }

  const done = slots.filter((s) => filledBy(s).length > 0).length;
  return (
    <div className="mt-4 border-t border-line/40 pt-3">
      <p className="flex items-baseline justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
        Papers for the PLC check
        {docs && <span className="normal-case tracking-normal">{done} of {slots.length}</span>}
      </p>
      {docs === null && !failed && (
        <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" />Reading what is on file</p>
      )}
      {failed && <p className="mt-2 text-[11.5px] text-muted">What is on file couldn&apos;t be read just now.</p>}
      {docs && (
        <ul className="mt-2 divide-y divide-line/40 rounded-xl border border-line/60">
          {slots.map((s) => {
            const have = filledBy(s);
            return (
              <li key={s.key} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${have.length ? "border-[var(--brown)] bg-[var(--brown)] text-white" : "border-line"}`}>
                  {have.length > 0 && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold leading-snug">{s.label}</span>
                  {have.length > 0 ? (
                    <span className="block truncate text-[11px] text-muted">
                      {have.map((d) => <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="mr-2 underline">{d.fileName}</a>)}
                    </span>
                  ) : s.many ? (
                    <span className="block text-[11px] text-muted">Up to {s.many} files, e.g. People and the overview</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => { setSlotFor(s.key); picker.current?.click(); }}
                  className="shrink-0 rounded-full border border-line/80 bg-white px-3 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink disabled:opacity-40"
                >
                  {busy === s.key ? "Uploading…" : have.length ? "Add another" : "Upload"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={picker}
        type="file"
        multiple={Boolean(slots.find((x) => x.key === slotFor)?.many)}
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.doc,.docx"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      {err && <p className="mt-1.5 text-[11.5px] text-accent-dark">{err}</p>}
      <p className="mt-1.5 text-[11px] text-muted">On the home&apos;s documents, where the PLC check picks them up. Nobody is sent them.</p>
    </div>
  );
}

/** The listing's Landlord box when the landlord was changed here: reads the change, shows the card. */
export function ListingChangedLandlord({ listingId, propertyId, address, onChanged }: { listingId: string; propertyId: string | null; address: string; onChanged: () => void }) {
  const [change, setChange] = useState<ChangedLandlord | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    fetch(`/api/landlord/change?${new URLSearchParams({ listing: listingId, property: propertyId ?? "" })}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!gone) setChange(j?.ok ? j.change ?? null : null); })
      .catch(() => { if (!gone) setChange(null); });
    return () => { gone = true; };
  }, [listingId, propertyId]);
  if (change === undefined) {
    return <p className="flex items-center gap-2 text-[12px] text-muted"><span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />Looking them up…</p>;
  }
  if (!change) return <p className="text-[12px] text-muted">The landlord couldn&apos;t be read just now.</p>;
  return (
    <ChangedLandlordCard
      change={change}
      where={{ listingId, propertyId, address }}
      from={{ kind: "listing", id: listingId }}
      homeAddress={address}
      onUndone={onChanged}
      onChanged={onChanged}
    />
  );
}
