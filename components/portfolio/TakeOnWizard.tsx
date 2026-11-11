"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FloatSheet, { FloatCard, FloatCardHead, FloatChoice, FloatFoot, FloatLabel } from "@/components/new-look/FloatSheet";
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
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const longDay = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not given");

type Person = { name: string; email: string; phone: string; reference: boolean };
export type TakeOnHome = { ref: string; name: string; locality: string; landlord?: { name: string; email: string | null; phone: string | null } | null; tenants?: { name: string; email: string | null; phone: string | null }[]; rent?: number | null };

/* At module level so typing never remounts the input (a component made
   inside the wizard would be a new type on every keystroke). */
function Field({ label, opt, wide, children }: { label: string; opt?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block${wide ? " is-wide" : ""}`}>
      <span className="nl-fs-label">
        {label}
        {opt && <em> (optional)</em>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

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
  const router = useRouter();

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
    router.push(`/portfolio/take-on/${encodeURIComponent(r.takeOn.id)}`);
  }

  const Group = ({ title, at, rows }: { title: string; at: number; rows: Array<[string, string]> }) => (
    <FloatCard>
      <FloatCardHead title={title} aside={<button type="button" onClick={() => go(at)} className="nl-link">Change</button>} />
      <dl className="nl-to-dl">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </FloatCard>
  );
  const referenced = named.filter((p) => p.reference);
  const QUESTION = [
    home ? "Which home is coming to us?" : "Which home is coming to us?",
    "Who owns it, and what are we doing for them?",
    "Who lives there now?",
    "Reference the tenants, or keep them as they are?",
    "Does this all look right?",
  ];
  const BLURB = [
    home ? "This home is already on Portfolio. Saving marks it as a management transfer." : "It goes straight onto Portfolio, with no listing.",
    "The landlord, the service and the day we take over.",
    "The tenants living there and the tenancy they are on.",
    "Referencing goes through Propoly, so they get rent and legal protection and a new contract.",
    "Nothing is sent to anybody when you save.",
  ];
  const input = "nl-fs-input";

  return (
    <FloatSheet
      title="Management Transfer"
      step={step + 1}
      steps={STEPS.length}
      onBack={step > 0 && !saving ? () => go(step - 1) : undefined}
      onClose={onClose}
      dismissible={!saving}
      screenKey={step}
      question={QUESTION[step]}
      lede={BLURB[step]}
      foot={
        <FloatFoot
          left={
            missing.length ? <span className="nl-to-miss">Still needed: {missing.join(", ").toLowerCase()}</span> : error ? <span className="nl-to-miss">{error}</span> : <span className="nl-meta">{STEPS[step]}</span>
          }
        >
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} disabled={saving} className="nl-btn nl-btn--secondary">
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="nl-btn nl-btn--primary">
              Next: {STEPS[step + 1]}
            </button>
          ) : (
            <button type="button" onClick={() => void save()} disabled={saving} className="nl-btn nl-btn--primary">
              {saving ? "Saving…" : "Take It On"}
            </button>
          )}
        </FloatFoot>
      }
    >
      {step === 0 &&
        (home ? (
          <FloatCard>
            <p className="nl-to-home">{home.name}</p>
            <p className="nl-meta">{home.locality}</p>
          </FloatCard>
        ) : (
          <FloatCard>
            <div className="nl-fs-grid">
              <Field label="First line of the address" wide>
                <input autoFocus value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Flat 2, 14 Albert Road" className={input} />
              </Field>
              <Field label="Town">
                <input value={town} onChange={(e) => setTown(e.target.value)} className={input} />
              </Field>
              <Field label="Postcode">
                <input value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} className={input} />
              </Field>
              <Field label="Bedrooms" opt>
                <input inputMode="numeric" value={bedrooms} onChange={(e) => setBedrooms(e.target.value.replace(/\D/g, "").slice(0, 2))} className={input} />
              </Field>
              <Field label="Type of let">
                <select value={letType} onChange={(e) => setLetType(e.target.value as LetType)} className={input}>
                  {LET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
          </FloatCard>
        ))}

      {step === 1 && (
        <>
          <FloatCard>
            <FloatCardHead title="The Landlord" />
            <div className="nl-fs-grid">
              <Field label="Name" wide>
                <input autoFocus={!ll.name} value={ll.name} onChange={(e) => setLl({ ...ll, name: e.target.value })} className={input} />
              </Field>
              <Field label="Email" opt>
                <input type="email" value={ll.email} onChange={(e) => setLl({ ...ll, email: e.target.value })} className={input} />
              </Field>
              <Field label="Mobile" opt>
                <input type="tel" value={ll.phone} onChange={(e) => setLl({ ...ll, phone: e.target.value })} className={input} />
              </Field>
            </div>
          </FloatCard>
          <FloatLabel>What we do for them</FloatLabel>
          <div className="nl-fs-choices is-2">
            <FloatChoice title="Fully Managed" text="We look after everything" on={service === "managed"} onClick={() => setService("managed")} />
            <FloatChoice title="Rent Collection" text="We collect the rent only" on={service === "rent_collect"} onClick={() => setService("rent_collect")} />
          </div>
          <FloatCard>
            <div className="nl-fs-grid">
              <Field label="Our fee, % of the rent" opt>
                <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} className={input} />
              </Field>
              <Field label="We take over on">
                <input type="date" value={takeoverOn} onChange={(e) => setTakeoverOn(e.target.value)} className={input} />
              </Field>
              <Field label="Who managed it before" opt wide>
                <input value={previousAgent} onChange={(e) => setPreviousAgent(e.target.value)} placeholder="The previous agent, or the landlord themselves" className={input} />
              </Field>
            </div>
          </FloatCard>
        </>
      )}

      {step === 2 && (
        <>
          {people.map((p, i) => (
            <FloatCard key={i}>
              <FloatCardHead
                title={p.name.trim() || `Tenant ${i + 1}`}
                aside={people.length > 1 ? <button type="button" onClick={() => setPeople((ps) => ps.filter((_, n) => n !== i))} className="nl-link">Remove</button> : undefined}
              />
              <div className="nl-fs-grid">
                <Field label="Full name" wide>
                  <input value={p.name} onChange={(e) => setPerson(i, "name", e.target.value)} className={input} />
                </Field>
                <Field label="Email" opt>
                  <input type="email" value={p.email} onChange={(e) => setPerson(i, "email", e.target.value)} className={input} />
                </Field>
                <Field label="Mobile" opt>
                  <input type="tel" value={p.phone} onChange={(e) => setPerson(i, "phone", e.target.value)} className={input} />
                </Field>
              </div>
            </FloatCard>
          ))}
          <button type="button" onClick={() => setPeople((ps) => [...ps, { name: "", email: "", phone: "", reference: false }])} className="nl-to-add">
            + Another Tenant
          </button>
          <FloatCard>
            <FloatCardHead title="The Tenancy" />
            <div className="nl-fs-grid">
              <Field label="Started on" opt>
                <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className={input} />
              </Field>
              <Field label="Rent a month" opt>
                <input inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="£" className={input} />
              </Field>
              <Field label="Deposit" opt>
                <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="£" className={input} />
              </Field>
              <Field label="Where the deposit is">
                <select value={depositHeld} onChange={(e) => setDepositHeld(e.target.value)} className={input}>
                  {DEPOSIT_HELD.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </Field>
              <label className="nl-to-tick">
                <input type="checkbox" checked={periodic} onChange={(e) => setPeriodic(e.target.checked)} />
                Rolling month to month
              </label>
              {!periodic && (
                <Field label="Fixed term ends on" opt>
                  <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={input} />
                </Field>
              )}
            </div>
          </FloatCard>
        </>
      )}

      {step === 3 &&
        named.map((p) => {
          const i = people.indexOf(p);
          return (
            <FloatCard key={i}>
              <FloatCardHead title={p.name} />
              <div className="nl-fs-choices is-2">
                <FloatChoice title="Keep as They Are" text="No new references" on={!p.reference} onClick={() => setPerson(i, "reference", false)} />
                <FloatChoice title="Reference Them" text={p.email.trim() ? "Rent and legal protection, new contract" : "Needs an email address"} on={p.reference} onClick={() => setPerson(i, "reference", true)} />
              </div>
            </FloatCard>
          );
        })}

      {step === 4 && (
        <>
          <Group title="The Home" at={0} rows={home ? [["Address", home.name]] : [["Address", [line1, town, postcode].filter(Boolean).join(", ")], ["Bedrooms", bedrooms || "Not given"], ["Type of let", LET_TYPES.find((t) => t.value === letType)?.label ?? ""]]} />
          <Group title="The Landlord" at={1} rows={[["Name", ll.name], ["Email", ll.email || "Not given"], ["Mobile", ll.phone || "Not given"], ["Service", service === "managed" ? "Fully managed" : "Rent collection"], ["Fee", fee ? `${fee}%` : "Not given"], ["We take over on", longDay(takeoverOn)], ...(previousAgent ? [["Before us", previousAgent] as [string, string]] : [])]} />
          <Group title="The Tenants" at={2} rows={[...named.map((p) => [p.name, p.email || "No email"] as [string, string]), ["Tenancy started", longDay(startedOn)], ["Rent", rent ? `£${Number(rent).toLocaleString("en-GB")} a month` : "Not given"], ["Deposit", deposit ? `£${Number(deposit).toLocaleString("en-GB")}, ${DEPOSIT_HELD.find((d) => d.value === depositHeld)?.label.toLowerCase()}` : DEPOSIT_HELD.find((d) => d.value === depositHeld)?.label ?? ""], ["Term", periodic ? "Rolling month to month" : endsOn ? `Fixed until ${longDay(endsOn)}` : "Not given"]]} />
          <Group title="References" at={3} rows={[["Referenced", referenced.length ? referenced.map((p) => p.name).join(", ") : "Nobody"], ["Kept as they are", named.filter((p) => !p.reference).map((p) => p.name).join(", ") || "Nobody"]]} />
          <FloatCard>
            <Field label="Anything else" opt>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Keys, inventory, anything agreed with the landlord" className={input} />
            </Field>
          </FloatCard>
          <FloatCard>
            <FloatCardHead title="When You Save" />
            <ul className="nl-to-list">
              <li>The home goes onto Portfolio straight away, with the landlord and tenants on it.</li>
              <li>You get the onboarding list for the landlord, the tenants and the previous agent, to tick off as each goes.</li>
              <li>Propoly is not changed yet. Key the deal in Propoly as you do today; the take-on&apos;s page shows exactly what to put in.</li>
            </ul>
          </FloatCard>
        </>
      )}
    </FloatSheet>
  );
}
