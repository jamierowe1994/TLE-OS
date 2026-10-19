"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import type { Party } from "@/lib/portfolio-types";

/**
 * CHANGE THE TENANTS (19 Oct 2026; lib/tenant-swaps).
 *
 * Lianna's tenant swap (12 Oct) plus Kirstie's two tickets, as one button on
 * the home: pick what is happening, then the few questions that go with it.
 *   - Someone leaves, someone moves in   (swap, 3b7dbd10's cousin)
 *   - Add someone to the tenancy         (add, 3b7dbd10)
 *   - Re-reference the tenants           (rereference, 3fd16026)
 * Each becomes its own let on Applications, where Push to Propoly starts a
 * new deal with everyone on it and references only the people ticked here.
 * Nothing is sent from this screen.
 */

type Kind = "swap" | "add" | "rereference";
const KINDS: { id: Kind; icon: string; title: string; sub: string }[] = [
  { id: "add", icon: "user", title: "Add someone to the tenancy", sub: "A partner or a new sharer moves in. Only they are referenced, and everyone gets a new contract." },
  { id: "swap", icon: "logout", title: "Someone leaves, someone moves in", sub: "A sharer goes and their replacement takes their place. No viewing or offer." },
  { id: "rereference", icon: "shield", title: "Re-reference the tenants", sub: "The same tenants, referenced again so they get rent and legal protection and a new contract." },
];
const SAVE: Record<Kind, string> = { swap: "Make the swap", add: "Add them", rereference: "Start re-referencing" };

export default function TenantChange({ listingId, tenants, rent, onClose }: { listingId: string; tenants: Party[]; rent: number | null; onClose: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [again, setAgain] = useState<Set<string>>(() => new Set());
  const [joining, setJoining] = useState([{ name: "", email: "", phone: "" }]);
  const [moveIn, setMoveIn] = useState("");
  const [rentPcm, setRentPcm] = useState(rent ? String(rent) : "");
  const [portionOn, setPortionOn] = useState(false);
  const [portion, setPortion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "mt-1 w-full rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px] outline-none focus:border-ink";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted";
  const setJoiner = (i: number, k: "name" | "email" | "phone", v: string) => setJoining((js) => js.map((j, n) => (n === i ? { ...j, [k]: v } : j)));
  const toggle = (set: (f: (s: Set<string>) => Set<string>) => void, id: string, on: boolean) =>
    set((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const pick = (k: Kind) => {
    setKind(k);
    setErr(null);
    /* Re-referencing is usually everybody: start with them all ticked. */
    setAgain(k === "rereference" ? new Set(tenants.filter((t) => t.email).map((t) => t.contactId)) : new Set());
  };

  if (!kind) {
    return (
      <div>
        <p className="text-[12.5px] leading-relaxed text-muted">What is changing on this tenancy?</p>
        <div className="mt-4 grid gap-2">
          {KINDS.filter((k) => k.id !== "swap" || tenants.length > 1).map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => pick(k.id)}
              className="flex items-start gap-3 rounded-xl border border-line/70 bg-white p-4 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={k.icon} size={14} /></span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">{k.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{k.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">Each one goes onto Applications as its own let. From there Push to Propoly starts a new deal with everyone on it, and only the people you tick are referenced.</p>
      </div>
    );
  }

  const staying = tenants.filter((t) => !leaving.has(t.contactId));
  const people = joining.filter((j) => j.name.trim());

  async function save() {
    if (kind === "swap" && !leaving.size) return setErr("Tick who is leaving.");
    if (kind !== "rereference" && !people.length) return setErr("Add who is moving in.");
    const noEmail = people.find((j) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.email.trim()));
    if (noEmail) return setErr(`${noEmail.name.trim()} needs an email address - their referencing is sent to it.`);
    if (kind === "rereference" && !again.size) return setErr("Tick who is being referenced.");
    if (!moveIn) return setErr(kind === "rereference" ? "When does the new contract start?" : "When are they moving in?");
    if (portionOn && !(Number(portion) > 0)) return setErr("Type their portion of the rent, or untick Rent portion.");
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/tenant-swaps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId, kind,
        leaving: [...leaving],
        joining: kind === "rereference" ? [] : people,
        rereference: [...again].filter((id) => !leaving.has(id)),
        moveIn,
        rentPcm: Number(rentPcm) || undefined,
        rentPortion: portionOn ? Number(portion) || undefined : undefined,
        note,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      return setErr(r?.error ?? "That could not be saved.");
    }
    window.location.assign(`/applications?open=${encodeURIComponent(r.application)}`);
  }

  const chosen = KINDS.find((k) => k.id === kind)!;
  return (
    <div>
      <button type="button" onClick={() => setKind(null)} className="text-[12px] font-semibold text-muted hover:text-ink">← Something else</button>
      <p className="mt-2 text-[14px] font-semibold">{chosen.title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{chosen.sub}</p>
      <div className="mt-4 grid gap-4">
        {kind === "swap" && (
          <div>
            <span className={label}>Who is leaving</span>
            <div className="mt-1.5 grid gap-1.5">
              {tenants.map((t) => (
                <label key={t.contactId} className="flex items-center gap-2.5 rounded-lg border border-line/70 bg-white px-3 py-2 text-[13px]">
                  <input type="checkbox" checked={leaving.has(t.contactId)} onChange={(e) => toggle(setLeaving, t.contactId, e.target.checked)} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {kind !== "rereference" && (
          <div>
            <span className={label}>Who is moving in</span>
            {joining.map((j, i) => (
              <div key={i} className="mt-1.5 grid gap-2 sm:grid-cols-3">
                <input value={j.name} onChange={(e) => setJoiner(i, "name", e.target.value)} placeholder="Full name" className={field} />
                <input type="email" value={j.email} onChange={(e) => setJoiner(i, "email", e.target.value)} placeholder="Email" className={field} />
                <input type="tel" value={j.phone} onChange={(e) => setJoiner(i, "phone", e.target.value)} placeholder="Mobile" className={field} />
              </div>
            ))}
            <button type="button" onClick={() => setJoining((js) => [...js, { name: "", email: "", phone: "" }])} className="mt-2 text-[12px] font-semibold text-accent-dark underline-offset-2 hover:underline">
              + Another person moving in
            </button>
          </div>
        )}
        {/* Who is referenced from the people staying. On an add or a swap
            nobody is by default: they were referenced when they moved in. */}
        <div>
          <span className={label}>{kind === "rereference" ? "Who is being referenced" : "Reference anyone staying too?"}</span>
          {kind !== "rereference" && <p className="mt-1 text-[11.5px] text-muted">Leave these unticked to keep them as they are, with no new references.</p>}
          <div className="mt-1.5 grid gap-1.5">
            {staying.map((t) => (
              <label key={t.contactId} className={`flex items-center gap-2.5 rounded-lg border border-line/70 bg-white px-3 py-2 text-[13px] ${t.email ? "" : "opacity-60"}`}>
                <input type="checkbox" disabled={!t.email} checked={again.has(t.contactId)} onChange={(e) => toggle(setAgain, t.contactId, e.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-[11px] text-muted">{t.email ? (again.has(t.contactId) ? "Referenced" : "No references") : "No email on the home"}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={label}>{kind === "rereference" ? "New contract from" : "Moving in on"}</span>
            <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={field} />
          </label>
          <label>
            <span className={label}>Rent for the home, a month</span>
            <input inputMode="decimal" value={rentPcm} onChange={(e) => setRentPcm(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="£" className={field} />
          </label>
        </div>
        {kind !== "rereference" && (
          <div>
            <label className="flex items-center gap-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={portionOn}
                onChange={(e) => {
                  setPortionOn(e.target.checked);
                  const heads = staying.length + Math.max(1, people.length);
                  if (e.target.checked && !portion && Number(rentPcm) > 0 && heads > 0) setPortion(String(Math.round((Number(rentPcm) / heads) * 100) / 100));
                }}
              />
              <span className="font-semibold">Rent portion</span>
              <span className="text-[12px] text-muted">What the person moving in pays</span>
            </label>
            {portionOn && (
              <label className="mt-2 block sm:max-w-[50%]">
                <span className={label}>Their portion, a month</span>
                <input inputMode="decimal" value={portion} onChange={(e) => setPortion(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="£" className={field} />
              </label>
            )}
          </div>
        )}
        <label>
          <span className={label}>Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything agreed with the landlord or the tenants." className={field} />
        </label>
      </div>
      {err && <p className="mt-4 text-[12.5px] text-accent-dark">{err}</p>}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] text-muted hover:text-ink">Cancel</button>
        <PressButton onClick={() => void save()} className={`rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page ${busy ? "opacity-50" : ""}`}>
          {busy ? "Saving…" : SAVE[kind]}
        </PressButton>
      </div>
    </div>
  );
}
