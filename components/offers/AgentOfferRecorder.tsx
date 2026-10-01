"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { APPLICANT_TYPES, type PassportData } from "@/lib/passport-shape";
import { OFFER_FIELDS, offerSubset, show, type OfferFieldKey, type OfferPassport } from "@/lib/offer-passport";

/**
 * The agent puts an offer forward FOR the tenant (1 Oct 2026, James after a
 * call with Rhiannon).
 *
 * Two worries it answers: a tenant who has filled in their passport must not
 * be asked it all again to make an offer, and an agent must be able to do the
 * whole thing for them, on the phone or sitting down together, without the
 * tenant touching their login.
 *
 * So it is four short steps, and everything the passport already knows
 * arrives filled in, marked as from the passport, with a Change on each. A
 * tenant with no passport gets the same screen empty, and what the agent
 * types in is saved to their passport, so the next offer or application never
 * asks again. The last step shows the offer exactly as the landlord will see
 * it, which is the check that matters.
 *
 * `sample` is the harness (app/(os)/harness/offer): nothing is saved or sent.
 * The live save is the next job, once the screen is right.
 */

export type OfferTenant = {
  id: string;
  name: string;
  email: string;
  /** Their passport if they have one; null when they have never been sent one. */
  passport: PassportData | null;
  passportDoneOn: string | null;
};

export type OfferHome = { id: string; address: string; locality: string; askingPcm: number; beds: number; photo: string | null };

const TERMS = ["6 months", "12 months", "18 months", "24 months"];
const HOW = ["On the phone", "In person", "By email", "By text"];
const STEPS = ["The offer", "Who is moving in", "About them", "Check and send"] as const;

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const money = (s: string) => Number(String(s).replace(/[£,\s]/g, "")) || 0;
const first = (name: string) => name.trim().split(/\s+/)[0] || "them";

const card = "rounded-[18px] border border-line/70 bg-card";
const lbl = "text-[12.5px] font-semibold text-ink";
const inp = "mt-1.5 block h-11 w-full min-w-0 rounded-[12px] border border-line/80 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark";
const area = "mt-1.5 block w-full rounded-[12px] border border-line/80 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-accent-dark";

/** The questions that are not about the household, in the order a person asks them. */
const ABOUT: OfferFieldKey[] = ["applicantType", "annualIncome", "hasBritishPassport", "shareCode", "landlordRef", "guarantor", "adverseCredit", "adverseCreditNote", "smoker"];
const BOOLS = new Set<OfferFieldKey>(["hasBritishPassport", "landlordRef", "guarantor", "adverseCredit", "smoker", "pets"]);

/** Only asked when the answer before makes them matter. */
function relevant(k: OfferFieldKey, p: OfferPassport): boolean {
  if (k === "shareCode") return p.hasBritishPassport === false;
  if (k === "adverseCreditNote") return p.adverseCredit === true;
  if (k === "petsNote") return p.pets === true;
  return true;
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-1.5 flex gap-2">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`h-10 flex-1 rounded-[12px] border text-[13.5px] font-semibold transition-colors ${value === v ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-white"}`}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-line/70 bg-white px-4 py-3">
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[18px] disabled:opacity-30">−</button>
        <span className="w-5 text-center text-[16px] font-bold">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(value + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[18px]">+</button>
      </span>
    </div>
  );
}

function FromPassport({ on }: { on: boolean }) {
  return on ? (
    <span className="rounded-full bg-[#f1f4ec] px-2 py-0.5 text-[10.5px] font-semibold text-[#56634a]">From passport</span>
  ) : (
    <span className="rounded-full bg-[#fdefec] px-2 py-0.5 text-[10.5px] font-semibold text-[#9d4340]">Ask them</span>
  );
}

export default function AgentOfferRecorder({
  tenant,
  home,
  agentName,
  sample,
}: {
  tenant: OfferTenant;
  home: OfferHome;
  agentName: string;
  sample: boolean;
}) {
  const fromPassport = useMemo(() => offerSubset(tenant.passport), [tenant.passport]);
  const known = (k: OfferFieldKey) => {
    const v = fromPassport[k];
    return v !== null && v !== "";
  };
  const name = first(tenant.name);

  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(String(home.askingPcm));
  const [moveIn, setMoveIn] = useState("");
  const [term, setTerm] = useState("12 months");
  const [how, setHow] = useState(HOW[0]);
  const [conditions, setConditions] = useState("");
  const [pp, setPp] = useState<OfferPassport>(fromPassport);
  const [editing, setEditing] = useState<OfferFieldKey | null>(null);
  const [consent, setConsent] = useState(false);
  const [copyToTenant, setCopyToTenant] = useState(true);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const set = <K extends OfferFieldKey>(k: K, v: OfferPassport[K]) => setPp((cur) => ({ ...cur, [k]: v }));
  const adults = Math.max(1, parseInt(pp.numAdults, 10) || 1);
  const children = Math.max(0, parseInt(pp.numChildren, 10) || 0);
  const offerNum = money(amount);
  const income = money(pp.annualIncome);
  const today = new Date().toISOString().slice(0, 10);

  /* Rent as a share of income, the figure a landlord reads first. */
  const affordability = income && offerNum ? Math.round(((offerNum * 12) / income) * 100) : null;
  const changed = OFFER_FIELDS.filter((f) => known(f.key) && pp[f.key] !== fromPassport[f.key]);
  const added = OFFER_FIELDS.filter((f) => !known(f.key) && pp[f.key] !== null && pp[f.key] !== "");

  function check(s: number): string {
    if (s === 0) {
      if (!offerNum) return "Put in the rent they are offering.";
      if (offerNum > home.askingPcm) return `The advertised rent is ${gbp(home.askingPcm)} a month, so an offer can't be above that.`;
      if (!moveIn) return "Choose the day they'd like to move in.";
    }
    if (s === 1 && pp.pets === null) return "Ask whether they have any pets.";
    if (s === 2) {
      const missing = ABOUT.filter((k) => relevant(k, pp) && k !== "adverseCreditNote" && k !== "shareCode" && (pp[k] === null || pp[k] === ""));
      if (missing.length) return `Still to ask: ${missing.map((k) => OFFER_FIELDS.find((f) => f.key === k)!.label.toLowerCase()).join(", ")}.`;
    }
    if (s === 3 && !consent) return `Tick to say ${name} has agreed the details are right.`;
    return "";
  }
  const next = () => {
    const e = check(step);
    setErr(e);
    if (e) return;
    setEditing(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else if (sample) setDone(true);
  };

  /** One passport answer: shown, with Change, or asked when the passport doesn't have it.
   *  Called as a function, not mounted as a component: a component defined in
   *  here would be a new type every render and lose the cursor on each key. */
  const answer = (k: OfferFieldKey) => {
    const f = OFFER_FIELDS.find((x) => x.key === k)!;
    const open = editing === k || !known(k);
    return (
      <div key={k} className="border-b border-line/60 py-3 last:border-0">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className={lbl}>{f.label}</span>
            <FromPassport on={known(k)} />
          </span>
          {known(k) && !open && (
            <button type="button" onClick={() => setEditing(k)} className="text-[12.5px] font-semibold text-accent-dark underline underline-offset-2">
              Change
            </button>
          )}
        </div>
        {!open ? (
          <p className="mt-1 text-[14px] text-ink/80">{show(k, pp[k])}</p>
        ) : BOOLS.has(k) ? (
          <YesNo value={pp[k] as boolean | null} onChange={(v) => set(k, v as never)} />
        ) : k === "applicantType" ? (
          <select value={pp.applicantType} onChange={(e) => set("applicantType", e.target.value)} className={inp}>
            <option value="">Choose…</option>
            {APPLICANT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        ) : (
          <input
            value={String(pp[k] ?? "")}
            onChange={(e) => set(k, e.target.value as never)}
            inputMode={k === "annualIncome" ? "numeric" : undefined}
            placeholder={k === "annualIncome" ? "Before tax, a year" : k === "shareCode" ? "9 characters, from gov.uk" : ""}
            className={inp}
          />
        )}
        {known(k) && pp[k] !== fromPassport[k] && (
          <p className="mt-1 text-[11.5px] text-muted">Was {show(k, fromPassport[k])} on the passport. Saved to it when you send.</p>
        )}
      </div>
    );
  };

  if (done) {
    return (
      <section className={`${card} p-8 text-center`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-dark text-white">
          <DoodleIcon name="check" size={22} />
        </span>
        <h2 className="mt-4 text-[22px] font-bold">Offer Put Forward</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink/70">
          {gbp(offerNum)} a month on {home.address}, for {name}. It is with the landlord now
          {copyToTenant ? `, and ${name} has a copy by email to check` : ""}.
          {added.length || changed.length ? ` ${added.length + changed.length} answer${added.length + changed.length === 1 ? "" : "s"} saved to ${name}'s passport, so nobody asks again.` : ""}
        </p>
        {sample && <p className="mt-3 text-[12px] text-muted">This is the harness, so nothing was saved or sent.</p>}
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setStep(0);
            setConsent(false);
          }}
          className="mt-5 rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold"
        >
          Start again
        </button>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className={`${card} p-5 sm:p-6`}>
        {/* ── the steps ── */}
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => {
                  setErr("");
                  setStep(i);
                }}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  i === step ? "border-accent-dark bg-accent-dark text-white" : i < step ? "border-line/80 bg-white text-ink" : "border-line/60 text-muted"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i === step ? "bg-white/25" : "bg-page"}`}>{i < step ? "✓" : i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          {step === 0 && (
            <>
              <h2 className="text-[20px] font-bold">The Offer</h2>
              <p className="mt-1 text-[13px] text-muted">What {name} would like to offer on {home.address}. Advertised at {gbp(home.askingPcm)} a month.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={lbl}>Rent per month</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={inp} />
                </label>
                <label className="block">
                  <span className={lbl}>Move in on</span>
                  <input type="date" min={today} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={inp} />
                </label>
                <label className="block">
                  <span className={lbl}>For</span>
                  <select value={term} onChange={(e) => setTerm(e.target.value)} className={inp}>
                    {TERMS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className={lbl}>How it came in</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {HOW.map((h) => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={how === h}
                        onClick={() => setHow(h)}
                        className={`rounded-full border px-3 py-2 text-[12.5px] ${how === h ? "border-accent-dark bg-accent-dark font-semibold text-white" : "border-line/80 bg-white"}`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="mt-4 block">
                <span className={lbl}>Anything they are asking for</span>
                <span className="ml-2 text-[11.5px] text-muted">optional</span>
                <textarea rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="For example: a later move-in, the spare bed taken out, a pet allowed" className={area} />
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-[20px] font-bold">Who Is Moving In</h2>
              <p className="mt-1 text-[13px] text-muted">{tenant.passport ? `From ${name}'s passport. Check it is still right.` : `${name} has no passport yet, so ask them.`}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Stepper label="Adults" value={adults} min={1} onChange={(n) => set("numAdults", String(n))} />
                <Stepper label="Children" value={children} min={0} onChange={(n) => set("numChildren", String(n))} />
              </div>
              <div className="mt-4">
                <span className="flex items-center gap-2">
                  <span className={lbl}>Any pets?</span>
                  <FromPassport on={known("pets")} />
                </span>
                <YesNo value={pp.pets} onChange={(v) => set("pets", v)} />
                {pp.pets && (
                  <input value={pp.petsNote} onChange={(e) => set("petsNote", e.target.value)} placeholder="What, and how many?" className={inp} />
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-[20px] font-bold">About {name}</h2>
              <p className="mt-1 text-[13px] text-muted">
                {tenant.passport
                  ? `Everything here is from ${name}'s passport${tenant.passportDoneOn ? `, filled in ${tenant.passportDoneOn}` : ""}. Only change what has changed.`
                  : `Ask ${name} these. What you put in is saved to their passport, so they are never asked again.`}
              </p>
              <div className="mt-3">
                {ABOUT.filter((k) => relevant(k, pp)).map((k) => answer(k))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-[20px] font-bold">Check and Send</h2>
              <p className="mt-1 text-[13px] text-muted">This is the offer exactly as the landlord will see it. Read it to {name} if you are on the phone.</p>

              <div className="mt-5 rounded-[16px] border border-line/70 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">What the landlord sees</p>
                <p className="mt-2 text-[26px] font-bold leading-none">
                  {gbp(offerNum)} <span className="text-[14px] font-semibold text-muted">a month</span>
                </p>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                  {[
                    ["Moving in", moveIn ? new Date(`${moveIn}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not set"],
                    ["For", term],
                    ["Who", `${adults} ${adults === 1 ? "adult" : "adults"}${children ? `, ${children} ${children === 1 ? "child" : "children"}` : ""}, ${pp.pets ? pp.petsNote || "pets" : "no pets"}`],
                    ["Working", pp.applicantType || "Not said"],
                    ["Rent against income", affordability ? `${affordability}% of ${gbp(income)} a year` : "Not said"],
                    ["Guarantor", show("guarantor", pp.guarantor)],
                    ["Landlord reference", show("landlordRef", pp.landlordRef)],
                    ["Adverse credit", show("adverseCredit", pp.adverseCredit)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11.5px] text-muted">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {conditions.trim() && (
                  <p className="mt-4 rounded-[12px] bg-page px-3.5 py-2.5 text-[13px]">
                    <span className="font-semibold">They ask: </span>
                    {conditions}
                  </p>
                )}
                <p className="mt-4 text-[11.5px] text-muted">
                  The landlord never sees {name}&apos;s date of birth, contact details, addresses, share code or employer.
                </p>
              </div>

              {(changed.length > 0 || added.length > 0) && (
                <p className="mt-3 text-[12.5px] text-muted">
                  Saved to {name}&apos;s passport when you send: {[...changed, ...added].map((f) => f.label.toLowerCase()).join(", ")}.
                </p>
              )}

              <label className="mt-5 flex items-start gap-3 rounded-[14px] border border-line/70 bg-white px-4 py-3">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#56423e]" />
                <span className="text-[13.5px] leading-snug">
                  {name} has agreed these details are right, and is happy for them to go to the landlord with this offer.
                  <span className="mt-0.5 block text-[12px] text-muted">Taken {how.toLowerCase()} by {agentName}.</span>
                </span>
              </label>
              <label className="mt-2 flex items-start gap-3 px-4 py-2">
                <input type="checkbox" checked={copyToTenant} onChange={(e) => setCopyToTenant(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#56423e]" />
                <span className="text-[13px] leading-snug text-ink/80">Email {name} a copy, so they can tell you if anything is wrong</span>
              </label>
            </>
          )}
        </div>

        {err && <p className="mt-4 text-[13px] font-semibold text-[#9d4340]">{err}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={next} className="rounded-full bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white">
            {step < STEPS.length - 1 ? "Next" : "Put the offer forward"}
          </button>
          {step > 0 && (
            <button
              type="button"
              onClick={() => {
                setErr("");
                setStep(step - 1);
              }}
              className="rounded-full border border-line/80 px-5 py-3 text-[13px] font-semibold"
            >
              Back
            </button>
          )}
        </div>
      </section>

      {/* ── who and what, always in view ── */}
      <aside className="space-y-4">
        <section className={`${card} overflow-hidden`}>
          {home.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={home.photo} alt="" className="h-36 w-full object-cover" />
          )}
          <div className="p-4">
            <p className="text-[15px] font-bold">{home.address}</p>
            <p className="text-[12.5px] text-muted">
              {home.locality} · {home.beds} bed · {gbp(home.askingPcm)} a month
            </p>
          </div>
        </section>
        <section className={`${card} p-4`}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="user" size={17} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-bold">{tenant.name}</span>
              <span className="block truncate text-[12px] text-muted">{tenant.email}</span>
            </span>
          </div>
          <p className={`mt-3 rounded-[12px] px-3 py-2 text-[12.5px] ${tenant.passport ? "bg-[#f1f4ec] text-[#56634a]" : "bg-[#fdefec] text-[#9d4340]"}`}>
            {tenant.passport ? `Passport complete${tenant.passportDoneOn ? `, ${tenant.passportDoneOn}` : ""}. Nothing to re-ask.` : "No passport yet. You fill it in as you go."}
          </p>
        </section>
      </aside>
    </div>
  );
}
