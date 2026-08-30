"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PassportBook from "@/components/PassportBook";
import {
  APPLICANT_TYPES,
  EMPTY_PASSPORT,
  SECTIONS,
  completeness,
  householdIncome,
  money,
  type PassportData,
} from "@/lib/passport-shape";

/**
 * The tenant passport, filled in.
 *
 * ── It saves as they type, and says so ────────────────────────────────────
 *
 * Nobody finishes this in one sitting - it asks for a share code and a
 * landlord's address, which are in other places. So there is no Save button to
 * miss: every change is written after a pause, and the state is shown. A form
 * this long with a single Save at the bottom loses somebody's twenty minutes
 * the first time a phone rings.
 *
 * ── The passport is the progress bar ──────────────────────────────────────
 *
 * There is no separate percentage. The book fills in beside them and each
 * finished section earns a stamp, which is the same information with a reason
 * to carry on. Stamps come from SECTIONS.done, the same function the server
 * uses, so the picture cannot disagree with the record.
 */

const input =
  "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-ink";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** Yes / No, with no default. An unanswered question must look unanswered:
 *  a pre-selected "No" is an answer nobody gave. */
function YesNo({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <span className="text-[13px] font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-1.5 flex gap-2">
        {[
          [true, "Yes"],
          [false, "No"],
        ].map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v as boolean)}
            className={`rounded-full border px-5 py-1.5 text-[13px] transition-colors ${
              value === v
                ? "border-ink bg-ink text-page"
                : "border-line/80 hover:border-ink/40"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({
  index,
  title,
  blurb,
  done,
  children,
}: {
  index: number;
  title: string;
  blurb: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-baseline gap-3">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
            done ? "bg-ink text-page" : "border border-line/80 text-muted"
          }`}
        >
          {done ? "✓" : index}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] leading-tight">{title}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{blurb}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function PassportForm({
  token,
  initial,
  submittedAt,
}: {
  token: string;
  initial: PassportData;
  submittedAt: string | null;
}) {
  const [d, setD] = useState<PassportData>({ ...EMPTY_PASSPORT, ...initial });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitted, setSubmitted] = useState(Boolean(submittedAt));
  const first = useRef(true);

  const set = <K extends keyof PassportData>(k: K, v: PassportData[K]) =>
    setD((cur) => ({ ...cur, [k]: v }));

  /* Debounced autosave. The guard on the first render matters: without it the
     page saves the moment it loads, which overwrites a record with what was
     just read from it - harmless here, and the habit that corrupts one
     elsewhere. */
  const save = useCallback(
    async (next: PassportData) => {
      setState("saving");
      try {
        const r = await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: next }),
        });
        setState(r.ok ? "saved" : "error");
      } catch {
        setState("error");
      }
    },
    [token]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => void save(d), 800);
    return () => window.clearTimeout(id);
  }, [d, save]);

  const { done, total } = completeness(d);
  const household = householdIncome(d);
  const allDone = done === total;

  async function finish() {
    await save(d);
    await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}&submit=1`, {
      method: "POST",
    }).catch(() => null);
    setSubmitted(true);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          The Letting Experts
        </p>
        <h1 className="hand mt-1 text-[30px] leading-tight sm:text-[36px]">Your tenant passport</h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
          Fill this in once and it is ready for every property you apply for with us. It saves as
          you go, so you can stop and come back to it. Nothing here is shared with a landlord
          unless you apply for their property.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 space-y-4 lg:order-1">
          <Card index={1} title={SECTIONS[0].title} blurb={SECTIONS[0].blurb} done={SECTIONS[0].done(d)}>
            <Field label="Full legal name" hint="As it appears on your passport or driving licence.">
              <input className={input} value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
            </Field>
            <Field label="Known as" hint="Optional, if you go by something else.">
              <input className={input} value={d.knownAs} onChange={(e) => set("knownAs", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date of birth">
                <input type="date" className={input} value={d.dob} onChange={(e) => set("dob", e.target.value)} />
              </Field>
              <Field label="Nationality">
                <input className={input} value={d.nationality} onChange={(e) => set("nationality", e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input type="email" className={input} value={d.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Mobile">
                <input type="tel" className={input} value={d.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card index={2} title={SECTIONS[1].title} blurb={SECTIONS[1].blurb} done={SECTIONS[1].done(d)}>
            <YesNo
              label="Do you have a British or Irish passport?"
              value={d.hasBritishPassport}
              onChange={(v) => set("hasBritishPassport", v)}
            />
            {d.hasBritishPassport === false && (
              <Field
                label="Your share code"
                hint="Get one free at gov.uk/prove-right-to-rent. It takes about two minutes and lasts 90 days."
              >
                <input
                  className={input}
                  value={d.shareCode}
                  placeholder="e.g. W12 A34 B56"
                  onChange={(e) => set("shareCode", e.target.value)}
                />
              </Field>
            )}
            {d.hasBritishPassport === true && (
              <p className="rounded-xl border border-line/70 bg-card p-3 text-[12px] leading-relaxed text-muted">
                That settles it. We will check the passport itself when we meet you.
              </p>
            )}
          </Card>

          <Card index={3} title={SECTIONS[2].title} blurb={SECTIONS[2].blurb} done={SECTIONS[2].done(d)}>
            <Field label="What best describes you?">
              <select
                className={input}
                value={d.applicantType}
                onChange={(e) => set("applicantType", e.target.value)}
              >
                <option value="">Choose…</option>
                {APPLICANT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Annual income, before tax">
                <input
                  className={input}
                  value={d.annualIncome}
                  placeholder="32,000"
                  onChange={(e) => set("annualIncome", e.target.value)}
                />
              </Field>
              <Field label="Savings" hint="Optional, and it helps a borderline application.">
                <input
                  className={input}
                  value={d.savings}
                  placeholder="4,000"
                  onChange={(e) => set("savings", e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card index={4} title={SECTIONS[3].title} blurb={SECTIONS[3].blurb} done={SECTIONS[3].done(d)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adults, including you">
                <input
                  type="number"
                  min={1}
                  className={input}
                  value={d.numAdults}
                  onChange={(e) => set("numAdults", e.target.value)}
                />
              </Field>
              <Field label="Children">
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={d.numChildren}
                  onChange={(e) => set("numChildren", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="What the other adults earn"
              hint="One per line, with a name if you like. Their income counts towards the total."
            >
              <textarea
                rows={3}
                className={`${input} resize-none leading-relaxed`}
                value={d.coOccupantIncomes}
                placeholder={"Sam - 24,000\nAlex - 19,500"}
                onChange={(e) => set("coOccupantIncomes", e.target.value)}
              />
            </Field>
            {household.total !== null && (
              <p className="rounded-xl border border-line/70 bg-card p-3 text-[12px] leading-relaxed">
                <strong>
                  Household income: £{household.total.toLocaleString("en-GB")}
                </strong>
                <span className="text-muted">
                  {" "}
                  from {household.from} {household.from === 1 ? "figure" : "figures"}. If that looks
                  wrong, check the lines above - we only count what looks like an amount.
                </span>
              </p>
            )}
          </Card>

          <Card index={5} title={SECTIONS[4].title} blurb={SECTIONS[4].blurb} done={SECTIONS[4].done(d)}>
            <Field label="Your current address">
              <input
                className={input}
                value={d.currentAddress}
                onChange={(e) => set("currentAddress", e.target.value)}
              />
            </Field>
            <YesNo
              label="Have you rented in the last 12 months?"
              value={d.rentedLast12Months}
              onChange={(v) => set("rentedLast12Months", v)}
            />
            {d.rentedLast12Months && (
              <>
                <YesNo
                  label="Was the rent always paid on time?"
                  hint="If not, say so. It is far better coming from you than from a reference."
                  value={d.rentOnTime}
                  onChange={(v) => set("rentOnTime", v)}
                />
                <YesNo
                  label="Can your landlord give a reference?"
                  value={d.landlordRef}
                  onChange={(v) => set("landlordRef", v)}
                />
              </>
            )}
            <Field label="Previous address" hint="Optional, if you have moved in the last three years.">
              <input
                className={input}
                value={d.previousAddress}
                onChange={(e) => set("previousAddress", e.target.value)}
              />
            </Field>
          </Card>

          <Card index={6} title={SECTIONS[5].title} blurb={SECTIONS[5].blurb} done={SECTIONS[5].done(d)}>
            <YesNo
              label="Any adverse credit? CCJs, defaults or bankruptcy."
              value={d.adverseCredit}
              onChange={(v) => set("adverseCredit", v)}
            />
            {d.adverseCredit && (
              <Field label="Tell us about it" hint="A couple of sentences. Context helps, and it is rarely a no on its own.">
                <textarea
                  rows={3}
                  className={`${input} resize-none leading-relaxed`}
                  value={d.adverseCreditNote}
                  onChange={(e) => set("adverseCreditNote", e.target.value)}
                />
              </Field>
            )}
            <YesNo
              label="Could you provide a guarantor if one were needed?"
              value={d.guarantor}
              onChange={(v) => set("guarantor", v)}
            />
            <YesNo label="Any pets?" value={d.pets} onChange={(v) => set("pets", v)} />
            {d.pets && (
              <Field label="What kind?">
                <input className={input} value={d.petsNote} onChange={(e) => set("petsNote", e.target.value)} />
              </Field>
            )}
            <YesNo label="Does anyone moving in smoke?" value={d.smoker} onChange={(v) => set("smoker", v)} />
          </Card>

          <div className="rounded-2xl border border-line/80 bg-panel p-5">
            {submitted ? (
              <p className="text-[13.5px] leading-relaxed">
                <strong>Your passport is with us.</strong> You can still change anything above and it
                updates straight away - come back to this link any time.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={finish}
                  disabled={!allDone}
                  className={`w-full rounded-xl py-3.5 text-[14px] font-semibold transition-opacity ${
                    allDone ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  {allDone ? "That's my passport done" : `${total - done} to go`}
                </button>
                <p className="mt-2 text-center text-[11.5px] leading-relaxed text-muted">
                  Everything is already saved. This just tells us you have finished.
                </p>
              </>
            )}
          </div>
        </div>

        {/* The book. Sticky on a wide screen so it fills in beside them; above
            the form on a phone, where a sticky panel would eat the keyboard. */}
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-8">
            <PassportBook data={d} />
            <p className="mt-3 text-center text-[11.5px] text-muted">
              {state === "saving"
                ? "Saving…"
                : state === "error"
                  ? "Not saved - check your connection."
                  : `${done} of ${total} stamps`}
            </p>
            {money(d.annualIncome) !== null && (
              <p className="mt-1 text-center text-[11px] leading-relaxed text-muted">
                Affordability is worked out per property when you apply, so this passport does not
                rule anything in or out on its own.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
