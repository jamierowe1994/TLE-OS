"use client";

import { useMemo, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";

/**
 * The application form — Howard's JotForm, brought in-house.
 *
 * His questions are kept, because they are the right questions and because
 * 457 applications have already been answered in their words. What changes is
 * where the answers land, and who gets asked.
 *
 * Two things his form cannot do, both measured off the live REX book:
 *
 *  1. IT ONLY EVER ASKS THE LEAD APPLICANT. Right to Rent, the landlord
 *     reference, the guarantor and the credit question are asked once and
 *     written as one line of prose about one person. 265 joint applicants this
 *     year have no Right to Rent answer anywhere. Right to Rent is a check on
 *     every adult who will live there — so here, every applicant gets asked,
 *     and an unanswered one blocks the form.
 *
 *  2. IT HAS A PRICE INDICATOR, NOT AN OFFER. There is no rule stopping
 *     someone offering above the advertised rent. Same rule as the feedback
 *     page: at or below the asking figure, stated as a fact about the
 *     property rather than a telling-off.
 *
 * Everything is one page. A pre-tenancy application is long, and a wizard that
 * hides the length makes people abandon it halfway — better to show the whole
 * job and let them see it shrinking.
 */

const RED = "#e31f36";

/** Live, this arrives with the link's token. The sample stands in so the page
 *  can be seen and judged before the join is wired. */
const LISTING = {
  id: 828057,
  property: "Flat 2, Mercer Street",
  locality: "Manchester M4",
  askingPcm: 995,
  agent: "Rhiannon Carter",
};

const EMPLOYMENT = ["Employed", "Self-Employed", "Student", "Benefits", "In Receipt of Pension"] as const;
type Employment = (typeof EMPLOYMENT)[number];

/** Only the first two have a job attached to them. */
const HAS_JOB = (e: Employment) => e === "Employed" || e === "Self-Employed";

type Person = {
  name: string;
  email: string;
  phone: string;
  dob: string;
  employment: Employment;
  job: string;
  company: string;
  position: "Permanent" | "Temporary";
  zeroHours: boolean;
  inProbation: boolean;
  income: string;
  rightToRent: boolean | null;
  landlordRef: boolean | null;
  guarantor: boolean | null;
  adverseCredit: boolean | null;
  adverseCreditNote: string;
};

const blank = (): Person => ({
  name: "", email: "", phone: "", dob: "",
  employment: "Employed", job: "", company: "", position: "Permanent",
  zeroHours: false, inProbation: false, income: "",
  rightToRent: null, landlordRef: null, guarantor: null, adverseCredit: null,
  adverseCreditNote: "",
});

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const money = (s: string) => Number(s.replace(/[£,\s]/g, ""));

/* ── small pieces, so the long form stays readable ────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold">{label}</span>
      {hint ? <span className="mt-0.5 block text-[12px] text-black/50">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-black/12 bg-white p-2.5 text-[13.5px] outline-none focus:border-black/35";

/** Yes/no, with no default. An unanswered question must look unanswered —
 *  pre-selecting "No" would put words in someone's mouth on a legal check. */
function YesNo({
  label, hint, value, onChange, required,
}: {
  label: string; hint?: string; value: boolean | null;
  onChange: (v: boolean) => void; required?: boolean;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold">
        {label}
        {required && value === null ? <span style={{ color: RED }}> *</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] leading-snug text-black/50">{hint}</p> : null}
      <div className="mt-2 flex gap-2">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className="rounded-lg border px-4 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={
              value === v
                ? { background: RED, borderColor: RED, color: "#fff" }
                : { borderColor: "rgba(0,0,0,.12)" }
            }
          >
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── the form ─────────────────────────────────────────────────────────────── */

export default function Apply() {
  const [people, setPeople] = useState<Person[]>([blank()]);
  const [offer, setOffer] = useState(String(LISTING.askingPcm));
  const [startDate, setStartDate] = useState("");
  const [months, setMonths] = useState(12);
  const [occupants, setOccupants] = useState(1);
  const [dependents, setDependents] = useState(0);
  const [pets, setPets] = useState<boolean | null>(null);
  const [conditions, setConditions] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const set = (i: number, patch: Partial<Person>) =>
    setPeople((ps) => ps.map((p, j) => (i === j ? { ...p, ...patch } : p)));

  const offerNum = money(offer);
  const offerError =
    !offer.trim()
      ? "Tell us what you'd like to offer."
      : !Number.isFinite(offerNum) || offerNum <= 0
        ? "That doesn't look like an amount."
        : offerNum > LISTING.askingPcm
          ? `The advertised rent is ${gbp(LISTING.askingPcm)} a month, so an offer can't be above that.`
          : null;

  /** What is still missing, in the applicant's words rather than the schema's. */
  const missing = useMemo(() => {
    const out: string[] = [];
    people.forEach((p, i) => {
      const who = p.name.trim() || `Applicant ${i + 1}`;
      if (!p.name.trim()) out.push(`Applicant ${i + 1} needs a name`);
      if (!p.email.trim()) out.push(`${who} needs an email address`);
      if (!p.dob) out.push(`${who} needs a date of birth`);
      if (!money(p.income)) out.push(`${who} needs an income figure`);
      if (p.rightToRent === null) out.push(`${who} hasn't answered the right to rent question`);
      else if (p.rightToRent === false) out.push(`${who} has said they have no right to rent in the UK`);
      if (p.landlordRef === null) out.push(`${who} hasn't answered the landlord reference question`);
      if (p.guarantor === null) out.push(`${who} hasn't answered the guarantor question`);
      if (p.adverseCredit === null) out.push(`${who} hasn't answered the credit question`);
    });
    if (offerError) out.push(offerError);
    if (!startDate) out.push("We need a move-in date");
    if (pets === null) out.push("Let us know whether there'll be pets");
    return out;
  }, [people, offerError, startDate, pets]);

  const totalIncome = people.reduce((t, p) => t + (money(p.income) || 0), 0);
  /** REX's own sum: annual rent as a share of household income. */
  const affordability = totalIncome > 0 ? ((offerNum * 12) / totalIncome) * 100 : null;

  async function submit() {
    setProblems([]);
    setSending(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: LISTING.id,
          askingRent: LISTING.askingPcm,
          offerAmount: offerNum,
          startDate,
          agreementMonths: months,
          occupants,
          dependents,
          hasPets: pets === true,
          conditions,
          applicants: people.map((p, i) => ({
            name: p.name.trim(),
            email: p.email.trim(),
            phone: p.phone.trim(),
            dob: p.dob,
            isPrimary: i === 0,
            employment: p.employment,
            job: p.job, company: p.company, position: p.position,
            zeroHours: p.zeroHours, inProbation: p.inProbation,
            income: money(p.income),
            rightToRent: p.rightToRent === true,
            landlordRef: p.landlordRef === true,
            guarantor: p.guarantor === true,
            adverseCredit: p.adverseCredit === true,
            adverseCreditNote: p.adverseCreditNote,
          })),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; errors?: string[] };
      if (res.ok && data.ok) setSent(true);
      else setProblems(data.errors ?? [data.error ?? "That didn't go through."]);
    } catch (e) {
      setProblems([(e as Error).message]);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-black/10 bg-white p-8 text-center">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-[22px] text-white"
            style={{ background: RED }}
          >
            ✓
          </div>
          <h1 className="mt-4 text-[20px] font-bold">Application received</h1>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-black/60">
            Your application for {LISTING.property} at {gbp(offerNum)} a month is with{" "}
            {LISTING.agent}. She&apos;ll put it to the landlord and come back to you —
            usually within a working day. Nothing is owed yet, and nothing is agreed
            until the landlord says yes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10">
      {/* What you're applying for — never a blank form asking which property. */}
      <div className="flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-4">
        <PropertyPhoto src={null} className="h-16 w-20 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
            You&apos;re applying for
          </p>
          <p className="mt-0.5 truncate text-[15px] font-bold">{LISTING.property}</p>
          <p className="text-[12.5px] text-black/50">
            {LISTING.locality} · {gbp(LISTING.askingPcm)} pcm
          </p>
        </div>
      </div>

      <h1 className="mt-8 text-[22px] font-bold leading-tight">Your application</h1>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-black/60">
        Ten minutes, and it goes straight to {LISTING.agent}. We ask everyone who&apos;ll
        be living there, not just the lead name — the right to rent check is required by
        law for every adult in the household.
      </p>

      {/* ── who's moving in ── */}
      {people.map((p, i) => (
        <section key={i} className="mt-6 rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[16px] font-bold">
              {i === 0 ? "Lead applicant" : `Applicant ${i + 1}`}
            </h2>
            {i > 0 && (
              <button
                type="button"
                onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}
                className="text-[12px] text-black/45 underline hover:text-black"
              >
                Remove
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input className={inputCls} value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
            </Field>
            <Field label="Date of birth">
              <input type="date" className={inputCls} value={p.dob} onChange={(e) => set(i, { dob: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" className={inputCls} value={p.email} onChange={(e) => set(i, { email: e.target.value })} />
            </Field>
            <Field label="Mobile">
              <input className={inputCls} value={p.phone} onChange={(e) => set(i, { phone: e.target.value })} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="What best describes you?">
              <select
                className={inputCls}
                value={p.employment}
                onChange={(e) => set(i, { employment: e.target.value as Employment })}
              >
                {EMPLOYMENT.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </Field>
            <Field
              label={p.employment === "Benefits" ? "Annual benefit income" : "Annual income, before tax"}
              hint="Everything you receive in a year, in pounds."
            >
              <input
                inputMode="numeric"
                className={inputCls}
                value={p.income}
                onChange={(e) => set(i, { income: e.target.value })}
              />
            </Field>
          </div>

          {HAS_JOB(p.employment) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Job title">
                <input className={inputCls} value={p.job} onChange={(e) => set(i, { job: e.target.value })} />
              </Field>
              <Field label={p.employment === "Self-Employed" ? "Business name" : "Employer"}>
                <input className={inputCls} value={p.company} onChange={(e) => set(i, { company: e.target.value })} />
              </Field>
              {p.employment === "Employed" && (
                <>
                  <Field label="Permanent or temporary?">
                    <select
                      className={inputCls}
                      value={p.position}
                      onChange={(e) => set(i, { position: e.target.value as Person["position"] })}
                    >
                      <option>Permanent</option>
                      <option>Temporary</option>
                    </select>
                  </Field>
                  <div className="flex flex-col justify-end gap-2.5 pb-1">
                    {([
                      ["zeroHours", "This is a zero-hours contract"],
                      ["inProbation", "I'm still in my probation period"],
                    ] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2.5 text-[13px]">
                        <input
                          type="checkbox"
                          checked={p[k]}
                          onChange={(e) => set(i, { [k]: e.target.checked } as Partial<Person>)}
                          className="h-4 w-4 accent-[#e31f36]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* The four checks — asked of THIS person, whoever they are. */}
          <div className="mt-5 grid gap-5 border-t border-black/8 pt-5 sm:grid-cols-2">
            <YesNo
              required
              label="Do you have the right to rent in the UK?"
              hint="We're required by law to check this for every adult moving in. We'll ask to see your documents before the tenancy starts."
              value={p.rightToRent}
              onChange={(v) => set(i, { rightToRent: v })}
            />
            <YesNo
              required
              label="Can you give a landlord reference for the last 2 years?"
              hint="If you've owned or lived with family, say no — it isn't a mark against you."
              value={p.landlordRef}
              onChange={(v) => set(i, { landlordRef: v })}
            />
            <YesNo
              required
              label="Can you provide a guarantor if one is needed?"
              hint="Someone in the UK who'd cover the rent if you couldn't."
              value={p.guarantor}
              onChange={(v) => set(i, { guarantor: v })}
            />
            <YesNo
              required
              label="Any adverse credit — CCJs, defaults, bankruptcy?"
              hint="Telling us now is far better than referencing finding it. It rarely stops an application."
              value={p.adverseCredit}
              onChange={(v) => set(i, { adverseCredit: v })}
            />
          </div>

          {p.adverseCredit === true && (
            <div className="mt-4">
              <Field label="Tell us about it" hint="A couple of sentences. This goes to the landlord with your application.">
                <textarea
                  rows={3}
                  className={inputCls}
                  value={p.adverseCreditNote}
                  onChange={(e) => set(i, { adverseCreditNote: e.target.value })}
                />
              </Field>
            </div>
          )}
        </section>
      ))}

      <button
        type="button"
        onClick={() => setPeople((ps) => [...ps, blank()])}
        className="mt-3 rounded-xl border border-black/15 px-4 py-2.5 text-[13px] font-semibold transition-colors hover:border-black/35"
      >
        + Add another applicant
      </button>

      {/* ── the tenancy ── */}
      <section className="mt-6 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-[16px] font-bold">The tenancy</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Your offer, per month" hint={`Advertised at ${gbp(LISTING.askingPcm)}. Offers at or below that.`}>
            <input
              inputMode="numeric"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              className="w-40 rounded-xl border bg-white p-2.5 text-[15px] font-semibold outline-none"
              style={{ borderColor: offerError ? RED : "rgba(0,0,0,.12)" }}
            />
            {offerError ? (
              <span className="mt-1.5 block text-[12.5px]" style={{ color: RED }}>{offerError}</span>
            ) : null}
          </Field>
          <Field label="When would you move in?">
            <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="How long for?">
            <select className={inputCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[6, 12, 18, 24].map((m) => (
                <option key={m} value={m}>{m} months</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Adults moving in">
              <input
                type="number" min={1} className={inputCls} value={occupants}
                onChange={(e) => setOccupants(Number(e.target.value))}
              />
            </Field>
            <Field label="Children">
              <input
                type="number" min={0} className={inputCls} value={dependents}
                onChange={(e) => setDependents(Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 border-t border-black/8 pt-5">
          <YesNo
            required
            label="Will there be any pets?"
            hint="Ask — don't assume. Most landlords will consider one."
            value={pets}
            onChange={setPets}
          />
        </div>

        {/* REX computes this itself; showing it means nobody is surprised by it. */}
        {affordability != null && Number.isFinite(affordability) && (
          <p className="mt-5 rounded-xl bg-black/[.03] p-3.5 text-[12.5px] leading-relaxed text-black/60">
            Household income of {gbp(totalIncome)} against {gbp(offerNum)} a month puts the
            rent at <strong>{affordability.toFixed(0)}%</strong> of what you earn.
            {affordability > 40
              ? " Most landlords look for under 40%, so a guarantor may be asked for."
              : " That's comfortably inside what most landlords look for."}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-black/10 bg-white p-5">
        <Field
          label="Anything else we should know?"
          hint="Notice periods, a date that has to move, why this one suits you. Landlords do read it."
        >
          <textarea rows={4} className={inputCls} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </Field>
      </section>

      {/* What's stopping it going, listed plainly rather than as a red form. */}
      {missing.length > 0 && (
        <div className="mt-6 rounded-2xl border border-black/10 bg-black/[.02] p-4">
          <p className="text-[12.5px] font-semibold">
            {missing.length} thing{missing.length === 1 ? "" : "s"} left before you can send it
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-black/60">
            {missing.slice(0, 6).map((m) => (
              <li key={m}>· {m}</li>
            ))}
            {missing.length > 6 && <li className="text-black/40">…and {missing.length - 6} more</li>}
          </ul>
        </div>
      )}

      {problems.length > 0 && (
        <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: RED }}>
          <p className="text-[12.5px] font-semibold" style={{ color: RED }}>
            We couldn&apos;t file that
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-black/70">
            {problems.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        disabled={missing.length > 0 || sending}
        onClick={submit}
        className="mt-6 w-full rounded-xl px-5 py-3.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-35"
        style={{ background: RED }}
      >
        {sending ? "Sending…" : "Send my application"}
      </button>
      <p className="mt-2 text-center text-[11.5px] leading-relaxed text-black/45">
        Nothing is owed yet. A holding deposit is only asked for once the landlord accepts.
      </p>
    </div>
  );
}
