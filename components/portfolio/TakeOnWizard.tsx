"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { LET_TYPES, type LetType } from "@/lib/let-type";

/**
 * MANAGEMENT TRANSFER (Dan Richards a9f80822, Kirstie on the 16 Oct call;
 * 19 Oct 2026, lib/take-ons). A home that is already let comes to us: it
 * skips leads, listings and applications and goes straight onto Portfolio
 * with its landlord and the tenants living there. Five screens, then the
 * take-on's own page for the onboarding letters.
 *
 * Opened from Portfolio (a home new to the OS) or from a home's page (`home`
 * given: the record is updated rather than made).
 */

const STEPS = ["The Home", "The Landlord", "The Tenants", "References", "Check"] as const;
const DEPOSIT_HELD = [
  { value: "previous_agent", label: "With the previous agent" },
  { value: "scheme", label: "In a scheme, to transfer" },
  { value: "landlord", label: "With the landlord" },
  { value: "none", label: "No deposit taken" },
];
const field = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-black/30";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const longDay = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not given");

type Person = { name: string; email: string; phone: string; reference: boolean };
export type TakeOnHome = { ref: string; name: string; locality: string; landlord?: { name: string; email: string | null; phone: string | null } | null; tenants?: { name: string; email: string | null; phone: string | null }[]; rent?: number | null };

export default function TakeOnWizard({ home, onClose }: { home?: TakeOnHome | null; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [line1, setLine1] = useState("");
  const [town, setTown] = useState("");
  const [postcode, setPostcode] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [letType, setLetType] = useState<LetType>("residential");
  const [ll, setLl] = useState({ name: home?.landlord?.name ?? "", email: home?.landlord?.email ?? "", phone: home?.landlord?.phone ?? "" });
  const [service, setService] = useState<"managed" | "rent_collect">("managed");
  const [fee, setFee] = useState("");
  const [takeoverOn, setTakeoverOn] = useState(today());
  const [previousAgent, setPreviousAgent] = useState("");
  const [people, setPeople] = useState<Person[]>(() =>
    home?.tenants?.length ? home.tenants.map((t) => ({ name: t.name, email: t.email ?? "", phone: t.phone ?? "", reference: false })) : [{ name: "", email: "", phone: "", reference: false }]
  );
  const [startedOn, setStartedOn] = useState("");
  const [rent, setRent] = useState(home?.rent ? String(home.rent) : "");
  const [deposit, setDeposit] = useState("");
  const [depositHeld, setDepositHeld] = useState("previous_agent");
  const [periodic, setPeriodic] = useState(false);
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const named = people.filter((p) => p.name.trim());
  /* What each screen can't go on without. Everything else can be added later. */
  const need: Record<number, Record<string, string>> = {
    0: home ? {} : {
      ...(line1.trim() ? {} : { line1: "The first line of the address" }),
      ...(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode.trim()) ? {} : { postcode: "A full postcode" }),
    },
    1: {
      ...(ll.name.trim() ? {} : { llName: "The landlord's name" }),
      ...(ll.email.trim() && !EMAIL.test(ll.email.trim()) ? { llEmail: "That email doesn't look right" } : {}),
      ...(takeoverOn ? {} : { takeoverOn: "When we take it over" }),
    },
    2: {
      ...(named.length ? {} : { people: "At least one tenant" }),
      ...(named.some((p) => p.email.trim() && !EMAIL.test(p.email.trim())) ? { peopleEmail: "One of the emails doesn't look right" } : {}),
    },
    3: named.some((p) => p.reference && !EMAIL.test(p.email.trim())) ? { refEmail: "Anyone being referenced needs an email address" } : {},
  };
  const missing = tried[step] ? Object.values(need[step] ?? {}) : [];
  const go = (to: number) => { setDir(to > step ? 1 : -1); setStep(to); setError(null); };
  const next = () => {
    setTried((t) => ({ ...t, [step]: true }));
    if (Object.keys(need[step] ?? {}).length) return;
    go(step + 1);
  };
  const setPerson = (i: number, k: keyof Person, v: string | boolean) => setPeople((ps) => ps.map((p, n) => (n === i ? { ...p, [k]: v } : p)));

  async function save() {
    setSaving(true);
    setError(null);
    const r = await fetch("/api/take-ons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        home: home?.ref ?? null,
        homeName: home?.name,
        line1: home ? "" : line1,
        town,
        postcode,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        letType,
        landlord: ll,
        service,
        feePct: fee ? Number(fee) : null,
        takeoverOn,
        previousAgent,
        tenancy: { startedOn: startedOn || null, rentPcm: rent ? Number(rent) : null, depositPounds: deposit ? Number(deposit) : null, depositHeld, periodic, endsOn: periodic ? null : endsOn || null },
        tenants: named.map((p) => ({ name: p.name, email: p.email, phone: p.phone, reference: p.reference })),
        note,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      setSaving(false);
      return setError(r?.error ?? "That could not be saved. Try again.");
    }
    window.location.assign(`/portfolio/take-on/${encodeURIComponent(r.takeOn.id)}`);
  }

  const Label = ({ children, opt }: { children: React.ReactNode; opt?: boolean }) => (
    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
      {children}
      {opt && <span className="ml-1 font-normal normal-case tracking-normal">(optional)</span>}
    </span>
  );
  const Group = ({ title, at, rows }: { title: string; at: number; rows: Array<[string, string]> }) => (
    <section className="rounded-2xl border border-line/70 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold">{title}</p>
        <button type="button" onClick={() => go(at)} className="text-[11.5px] font-semibold text-accent-dark hover:underline">Change</button>
      </div>
      <dl className="mt-2 grid gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 text-[12.5px]">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  const referenced = named.filter((p) => p.reference);
  const BLURB = [
    home ? "This home is already on Portfolio. Saving marks it as a management transfer." : "The home that's coming to us. It goes straight onto Portfolio, with no listing.",
    "Who owns it, and what we're doing for them.",
    "Who lives there now, and the tenancy they are on.",
    "Each tenant can stay as they are, or be referenced through Propoly so they get rent and legal protection and a new contract.",
    "Check it over. Nothing is sent to anybody when you save.",
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#2b201d]/45 p-3 sm:p-6" onClick={saving ? undefined : onClose}>
      <div
        className="drawer-in flex max-h-[94vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Management transfer"
      >
        <div className="border-b border-line/60 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="pack/house" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Portfolio · {step + 1} of {STEPS.length}</p>
              <h2 className="text-[22px] font-normal leading-tight tracking-normal">Management Transfer</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <ol className="mt-4 grid grid-cols-5 gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="min-w-0">
                <span className={`block h-1 rounded-full ${i <= step ? "bg-accent-dark" : "bg-line"}`} />
                <span className={`mt-1.5 block truncate text-[11px] ${i === step ? "font-semibold text-ink" : "text-muted"}`}>
                  {i + 1}.<span className={i === step ? "" : "hidden sm:inline"}> {s}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
          <div key={step} className="space-y-4" style={{ animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` }}>
            <p className="text-[12.5px] leading-relaxed text-muted">{BLURB[step]}</p>

            {step === 0 && (home ? (
              <p className="rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px] font-semibold">
                {home.name}
                <span className="block text-[12px] font-normal text-muted">{home.locality}</span>
              </p>
            ) : (
              <>
                <label className="block">
                  <Label>First line of the address</Label>
                  <input autoFocus value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Flat 2, 14 Albert Road" className={`mt-1.5 ${field}`} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <Label>Town</Label>
                    <input value={town} onChange={(e) => setTown(e.target.value)} className={`mt-1.5 ${field}`} />
                  </label>
                  <label className="block">
                    <Label>Postcode</Label>
                    <input value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} className={`mt-1.5 ${field}`} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <Label opt>Bedrooms</Label>
                    <input inputMode="numeric" value={bedrooms} onChange={(e) => setBedrooms(e.target.value.replace(/\D/g, "").slice(0, 2))} className={`mt-1.5 ${field}`} />
                  </label>
                  <label className="block">
                    <Label>Type of let</Label>
                    <select value={letType} onChange={(e) => setLetType(e.target.value as LetType)} className={`mt-1.5 ${field}`}>
                      {LET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                </div>
              </>
            ))}

            {step === 1 && (
              <>
                <label className="block">
                  <Label>Landlord&apos;s name</Label>
                  <input autoFocus={!ll.name} value={ll.name} onChange={(e) => setLl({ ...ll, name: e.target.value })} className={`mt-1.5 ${field}`} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <Label opt>Email</Label>
                    <input type="email" value={ll.email} onChange={(e) => setLl({ ...ll, email: e.target.value })} className={`mt-1.5 ${field}`} />
                  </label>
                  <label className="block">
                    <Label opt>Mobile</Label>
                    <input type="tel" value={ll.phone} onChange={(e) => setLl({ ...ll, phone: e.target.value })} className={`mt-1.5 ${field}`} />
                  </label>
                </div>
                <div>
                  <Label>What we do for them</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {([["managed", "Fully managed", "We look after everything"], ["rent_collect", "Rent collection", "We collect the rent only"]] as const).map(([v, t, sub]) => (
                      <button key={v} type="button" onClick={() => setService(v)} className={`rounded-xl border px-3 py-2.5 text-left ${service === v ? "border-accent-dark bg-accent-soft/50" : "border-line bg-white"}`}>
                        <span className="block text-[13px] font-semibold">{t}</span>
                        <span className="block text-[11.5px] text-muted">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <Label opt>Our fee, % of the rent</Label>
                    <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} className={`mt-1.5 ${field}`} />
                  </label>
                  <label className="block">
                    <Label>We take over on</Label>
                    <input type="date" value={takeoverOn} onChange={(e) => setTakeoverOn(e.target.value)} className={`mt-1.5 ${field}`} />
                  </label>
                </div>
                <label className="block">
                  <Label opt>Who managed it before</Label>
                  <input value={previousAgent} onChange={(e) => setPreviousAgent(e.target.value)} placeholder="The previous agent, or the landlord themselves" className={`mt-1.5 ${field}`} />
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <Label>The tenants living there</Label>
                  {people.map((p, i) => (
                    <div key={i} className="mt-2 rounded-xl border border-line/70 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <input value={p.name} onChange={(e) => setPerson(i, "name", e.target.value)} placeholder="Full name" className={field} />
                        {people.length > 1 && (
                          <button type="button" onClick={() => setPeople((ps) => ps.filter((_, n) => n !== i))} aria-label={`Remove ${p.name || "this tenant"}`} className="shrink-0 rounded-lg px-2 py-2 text-muted hover:text-ink">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                          </button>
                        )}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input type="email" value={p.email} onChange={(e) => setPerson(i, "email", e.target.value)} placeholder="Email" className={field} />
                        <input type="tel" value={p.phone} onChange={(e) => setPerson(i, "phone", e.target.value)} placeholder="Mobile" className={field} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setPeople((ps) => [...ps, { name: "", email: "", phone: "", reference: false }])} className="mt-2 text-[12px] font-semibold text-accent-dark hover:underline">
                    + Another tenant
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <Label opt>Tenancy started on</Label>
                    <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className={`mt-1.5 ${field}`} />
                  </label>
                  <label className="block">
                    <Label opt>Rent a month</Label>
                    <input inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="£" className={`mt-1.5 ${field}`} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <Label opt>Deposit</Label>
                    <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="£" className={`mt-1.5 ${field}`} />
                  </label>
                  <label className="block">
                    <Label>Where the deposit is</Label>
                    <select value={depositHeld} onChange={(e) => setDepositHeld(e.target.value)} className={`mt-1.5 ${field}`}>
                      {DEPOSIT_HELD.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 items-end gap-3">
                  <label className="flex items-center gap-2 pb-2.5 text-[13px]">
                    <input type="checkbox" checked={periodic} onChange={(e) => setPeriodic(e.target.checked)} />
                    Rolling month to month
                  </label>
                  {!periodic && (
                    <label className="block">
                      <Label opt>Fixed term ends on</Label>
                      <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={`mt-1.5 ${field}`} />
                    </label>
                  )}
                </div>
              </>
            )}

            {step === 3 && (
              <div className="space-y-2">
                {named.map((p) => {
                  const i = people.indexOf(p);
                  return (
                    <div key={i} className="rounded-xl border border-line/70 bg-white p-3">
                      <p className="text-[13px] font-semibold">{p.name}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setPerson(i, "reference", false)} className={`rounded-lg border px-3 py-2 text-left text-[12.5px] ${!p.reference ? "border-accent-dark bg-accent-soft/50 font-semibold" : "border-line"}`}>
                          Keep as they are
                          <span className="block text-[11px] font-normal text-muted">No new references</span>
                        </button>
                        <button type="button" onClick={() => setPerson(i, "reference", true)} className={`rounded-lg border px-3 py-2 text-left text-[12.5px] ${p.reference ? "border-accent-dark bg-accent-soft/50 font-semibold" : "border-line"}`}>
                          Reference them
                          <span className="block text-[11px] font-normal text-muted">{p.email.trim() ? "Rent and legal protection, new contract" : "Needs an email address"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 4 && (
              <>
                <Group title="The home" at={0} rows={home ? [["Address", home.name]] : [["Address", [line1, town, postcode].filter(Boolean).join(", ")], ["Bedrooms", bedrooms || "Not given"], ["Type of let", LET_TYPES.find((t) => t.value === letType)?.label ?? ""]]} />
                <Group title="The landlord" at={1} rows={[["Name", ll.name], ["Email", ll.email || "Not given"], ["Mobile", ll.phone || "Not given"], ["Service", service === "managed" ? "Fully managed" : "Rent collection"], ["Fee", fee ? `${fee}%` : "Not given"], ["We take over on", longDay(takeoverOn)], ...(previousAgent ? [["Before us", previousAgent] as [string, string]] : [])]} />
                <Group title="The tenants" at={2} rows={[...named.map((p) => [p.name, p.email || "No email"] as [string, string]), ["Tenancy started", longDay(startedOn)], ["Rent", rent ? `£${Number(rent).toLocaleString("en-GB")} a month` : "Not given"], ["Deposit", deposit ? `£${Number(deposit).toLocaleString("en-GB")}, ${DEPOSIT_HELD.find((d) => d.value === depositHeld)?.label.toLowerCase()}` : DEPOSIT_HELD.find((d) => d.value === depositHeld)?.label ?? ""], ["Term", periodic ? "Rolling month to month" : endsOn ? `Fixed until ${longDay(endsOn)}` : "Not given"]]} />
                <Group title="References" at={3} rows={[["Referenced", referenced.length ? referenced.map((p) => p.name).join(", ") : "Nobody"], ["Kept as they are", named.filter((p) => !p.reference).map((p) => p.name).join(", ") || "Nobody"]]} />
                <label className="block">
                  <Label opt>Anything else</Label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Keys, inventory, anything agreed with the landlord" className={`mt-1.5 ${field}`} />
                </label>
                <div className="rounded-2xl bg-card p-4 text-[12.5px] leading-relaxed">
                  <p className="font-semibold">When you save</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
                    <li>The home goes onto Portfolio straight away, with the landlord and tenants on it.</li>
                    <li>You get the onboarding list for the landlord, the tenants and the previous agent, to tick off as each goes.</li>
                    <li>Propoly is not changed yet. Key the deal in Propoly as you do today; the take-on&apos;s page shows exactly what to put in.</li>
                  </ul>
                </div>
              </>
            )}

            {missing.length > 0 && <p className="text-[11.5px] text-[#9d4340]">Still needed: {missing.join(", ").toLowerCase()}.</p>}
            {error && <p className="rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-dark">{error}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 bg-white px-5 py-4 sm:px-6">
          {step < 4 ? (
            <button type="button" onClick={next} className="btn-press rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white">
              Next: {STEPS[step + 1]} →
            </button>
          ) : (
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-press flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
              <DoodleIcon name="pack/house" size={14} />
              {saving ? "Saving…" : "Take it on"}
            </button>
          )}
          <button type="button" onClick={() => (step === 0 ? onClose() : go(step - 1))} disabled={saving} className="rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
            {step === 0 ? "Cancel" : "← Back"}
          </button>
        </div>
      </div>
    </div>
  );
}
