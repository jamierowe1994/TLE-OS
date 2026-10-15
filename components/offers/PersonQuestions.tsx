"use client";

import { APPLICANT_TYPES, TRADING_FOR, WORK_HOURS } from "@/lib/passport-shape";
import { employedType, tradingType, type PersonAnswers } from "@/lib/offer-people-shape";

/**
 * One adult's part of an offer (James, 14 Oct 2026; lib/offer-people-shape):
 * who they are, then what the lead tenant is asked at offer stage. The same
 * block on the tenant's offer sheet, the agent's recorder and the person's
 * own page, so the three never ask differently.
 *
 * `self` words it to the person filling in their own part ("Do you smoke?");
 * otherwise it asks about them by first name.
 */
export default function PersonQuestions({
  value,
  onChange,
  self = false,
  field,
  label,
  noRightToRent = false,
}: {
  value: PersonAnswers;
  onChange: (next: PersonAnswers) => void;
  self?: boolean;
  /** The screen's own input and label looks. */
  field: string;
  label: string;
  /** A Scottish home: Right to rent is England only, so it is not asked (James, 15 Oct 2026). */
  noRightToRent?: boolean;
}) {
  const set = <K extends keyof PersonAnswers>(k: K, v: PersonAnswers[K]) => onChange({ ...value, [k]: v });
  /* You, a named person, or "they" until a name is typed - so it never reads "Does they work?". */
  const first = value.name.trim().split(/\s+/)[0] || "";
  const plural = self || !first;
  const sub = self ? "you" : first || "they";
  const Do = `${plural ? "Do" : "Does"} ${sub}`;
  const Have = `${plural ? "have" : "has"} ${sub}`;
  const are = self ? "Are you" : first ? `Is ${first}` : "Are they";
  const their = self ? "your" : first ? `${first}'s` : "their";
  const Their = their.charAt(0).toUpperCase() + their.slice(1);
  const pill = (on: boolean) => `rounded-full border px-3.5 py-2 text-[13px] ${on ? "border-accent-dark bg-accent-dark font-semibold text-white" : "border-line/80 bg-white"}`;
  const YesNo = ({ q, v, on }: { q: string; v: boolean | null; on: (v: boolean) => void }) => (
    <div className="mt-4">
      <span className={label}>{q}</span>
      <div className="mt-2 flex gap-2">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" onClick={() => on(b)} aria-pressed={v === b} className={`flex-1 ${pill(v === b)}`}>
            {b ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <label className="block">
        <span className={label}>Full name</span>
        <input value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="First and last name" autoComplete="off" className={field} />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Email</span>
          <input value={value.email} onChange={(e) => set("email", e.target.value)} inputMode="email" autoComplete="off" placeholder="For referencing and the tenancy" className={field} />
        </label>
        <label className="block">
          <span className={label}>Mobile</span>
          <input value={value.mobile} onChange={(e) => set("mobile", e.target.value)} inputMode="tel" autoComplete="off" placeholder="07…" className={field} />
        </label>
      </div>
      <label className="mt-4 block">
        <span className={label}>Date of birth</span>
        <input type="date" value={value.dob} onChange={(e) => set("dob", e.target.value)} max={new Date().toISOString().slice(0, 10)} className={field} />
      </label>

      <label className="mt-4 block">
        <span className={label}>{Do} work?</span>
        <select value={value.applicantType} onChange={(e) => set("applicantType", e.target.value)} className={field}>
          <option value="">Choose one</option>
          {APPLICANT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      {employedType(value.applicantType) && (
        <>
          <div className="mt-4">
            <span className={label}>Full or part-time</span>
            <div className="mt-2 flex gap-2">
              {WORK_HOURS.map((h) => (
                <button key={h} type="button" onClick={() => set("workHours", h)} aria-pressed={value.workHours === h} className={`flex-1 ${pill(value.workHours === h)}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Job title</span>
              <input value={value.job} onChange={(e) => set("job", e.target.value)} autoComplete="off" className={field} />
            </label>
            <label className="block">
              <span className={label}>Employer</span>
              <input value={value.employer} onChange={(e) => set("employer", e.target.value)} autoComplete="off" className={field} />
            </label>
          </div>
          <YesNo q={`${are} on a zero-hours contract?`} v={value.zeroHours} on={(v) => set("zeroHours", v)} />
          <YesNo q={`${are} still on probation?`} v={value.onProbation} on={(v) => set("onProbation", v)} />
        </>
      )}
      {tradingType(value.applicantType) && (
        <div className="mt-4">
          <span className={label}>How long {Have} been trading?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TRADING_FOR.map((h) => (
              <button key={h} type="button" onClick={() => set("tradingFor", h)} aria-pressed={value.tradingFor === h} className={pill(value.tradingFor === h)}>
                {h}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="mt-4 block">
        <span className={label}>{Their} income</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 mt-[3px] -translate-y-1/2 text-[14px] text-muted">£</span>
          <input inputMode="numeric" value={value.annualIncome} onChange={(e) => set("annualIncome", e.target.value.replace(/[^\d]/g, ""))} placeholder="A year, before tax" className={`${field} pl-7`} />
        </span>
      </label>

      {!noRightToRent && <YesNo q={`${Do} have a British or Irish passport?`} v={value.hasBritishPassport} on={(v) => set("hasBritishPassport", v)} />}
      {!noRightToRent && value.hasBritishPassport === false && (
        <label className="mt-3 block">
          <span className={label}>{Their} share code</span>
          <input value={value.shareCode} onChange={(e) => set("shareCode", e.target.value.toUpperCase())} placeholder="From gov.uk/prove-right-to-rent" autoComplete="off" className={field} />
        </label>
      )}
      <YesNo q={`Can ${their} current or last landlord give a reference?`} v={value.landlordRef} on={(v) => set("landlordRef", v)} />
      <YesNo q={`${Do} have a guarantor if one is needed?`} v={value.guarantor} on={(v) => set("guarantor", v)} />
      <YesNo q={self ? "Any CCJs, defaults or missed payments?" : `Any CCJs, defaults or missed payments for ${first || "them"}?`} v={value.adverseCredit} on={(v) => set("adverseCredit", v)} />
      {value.adverseCredit && <input value={value.adverseCreditNote} onChange={(e) => set("adverseCreditNote", e.target.value)} placeholder="A line about it" className={field} />}
      <YesNo q={`${Do} smoke?`} v={value.smoker} on={(v) => set("smoker", v)} />
    </div>
  );
}
