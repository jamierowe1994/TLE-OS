"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PassportBook from "@/components/PassportBook";
import {
  APPLICANT_TYPES,
  EMPTY_PASSPORT,
  SECTIONS,
  answered,
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
 * landlord's address, which live in other places. So there is no Save button to
 * miss: every change is written after a pause, and the state is shown. A form
 * this long with a single Save at the bottom loses somebody's twenty minutes
 * the first time a phone rings.
 *
 * ── One block at a time ───────────────────────────────────────────────────
 *
 * Six questions on screen is a form; thirty is a wall, and people bounce off a
 * wall. So each section is its own step and the next slides in as the last
 * slides out. The cost is real - you cannot see the whole thing at once - so
 * the steps are named across the top, any of them can be jumped to, and nothing
 * is ever gated behind finishing the one before it. Somebody who cannot find
 * their share code must be able to carry on and come back.
 *
 * ── The bar starts part-filled, honestly ──────────────────────────────────
 *
 * It counts ANSWERS, not sections, so the name and email seeded from the
 * invitation genuinely put somebody about a fifth of the way along before they
 * type anything. A hardcoded floor would have done the same job and lied at
 * exactly the moment somebody is deciding whether this is worth their time -
 * and it would then sit still for their first few answers, which reads as
 * broken.
 */

const RED = "#e31f36";

const input =
  "w-full rounded-xl border border-line/80 bg-transparent px-4 py-3 text-[15px] outline-none transition-colors focus:border-ink";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
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
      <span className="text-[14px] font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-2 flex gap-2.5">
        {[
          [true, "Yes"],
          [false, "No"],
        ].map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v as boolean)}
            className={`min-w-[92px] rounded-full border px-6 py-2 text-[14px] transition-colors ${
              value === v ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink/40"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export type PassportQuestion = {
  id: string;
  label: string;
  kind: string;
  options: string[];
  required: boolean;
};

export default function PassportForm({
  token,
  initial,
  submittedAt,
  questions = [],
  initialAnswers = {},
  agentName = "",
  demo = false,
}: {
  token: string;
  initial: PassportData;
  submittedAt: string | null;
  /**
   * Extra questions the agent who issued this passport asked for.
   *
   * Empty for most passports, and that is the normal case rather than a
   * degraded one: an agent who has written none adds nothing here, and the
   * form is exactly the standard six sections. They arrive as a prop, read
   * server-side from the passport's own agent, so the browser is never in a
   * position to ask for somebody else's.
   */
  questions?: PassportQuestion[];
  initialAnswers?: Record<string, string>;
  agentName?: string;
  /**
   * Showing the form rather than filling one in.
   *
   * Used by the public preview, where the token belongs to no passport. Every
   * field works and nothing is written: without this the autosave would fire
   * against a token that does not exist, get a 404, and sit there saying "not
   * saved" through an entire demonstration.
   */
  demo?: boolean;
}) {
  const [d, setD] = useState<PassportData>({ ...EMPTY_PASSPORT, ...initial });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitted, setSubmitted] = useState(Boolean(submittedAt));
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  /* `save` is a useCallback keyed on the passport data, and the autosave
     effect below fires on that. Reading the answers through a ref keeps them
     out of that dependency list: adding them would rebuild the callback on
     every keystroke in a custom question and restart the debounce, which is
     the difference between saving once and saving on every letter. */
  const answersRef = useRef(answers);
  answersRef.current = answers;
  /** Which way the next panel comes in from, so Back reads as going back. */
  const [dir, setDir] = useState<1 | -1>(1);
  const first = useRef(true);

  const set = <K extends keyof PassportData>(k: K, v: PassportData[K]) =>
    setD((cur) => ({ ...cur, [k]: v }));

  /* Debounced autosave. The guard on the first render matters: without it the
     page saves the moment it loads, writing back what it just read - harmless
     here, and the habit that corrupts a record elsewhere. */
  const save = useCallback(
    async (next: PassportData) => {
      if (demo) {
        /* The reassurance without the round trip. Somebody watching a demo
           should see it behave, and nothing should be written. */
        setState("saved");
        return;
      }
      setState("saving");
      try {
        const r = await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: next, answers: answersRef.current }),
        });
        setState(r.ok ? "saved" : "error");
      } catch {
        setState("error");
      }
    },
    [token, demo]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => void save(d), 800);
    return () => window.clearTimeout(id);
  }, [d, save]);

  /* Answers save on the same debounce. Separate effect, same 800ms, because
     `d` is untouched when somebody only answers a custom question and the
     effect above would never fire. */
  const firstAnswers = useRef(true);
  useEffect(() => {
    if (firstAnswers.current) {
      firstAnswers.current = false;
      return;
    }
    const id = window.setTimeout(() => void save(d), 800);
    return () => window.clearTimeout(id);
  }, [answers, save, d]);

  /**
   * The agent's own questions, as a seventh section - and only if there are
   * any. An agent who has written none leaves the passport exactly as it is.
   */
  const extraDone =
    questions.length > 0 &&
    questions.every((qn) => !qn.required || (answers[qn.id] ?? "").trim() !== "");

  const sections =
    questions.length > 0
      ? [
          ...SECTIONS,
          {
            key: "extra",
            title: agentName ? `A few more from ${agentName}` : "A few more questions",
            blurb:
              "Your agent asks these as well. They are not part of the standard passport, so nobody else will see them.",
            stamp: "EXTRA",
            done: () => extraDone,
          },
        ]
      : SECTIONS;

  const { done, total } = completeness(d);
  const bar = answered(d);
  const household = householdIncome(d);
  /* The extra section counts towards "finished" exactly like the other six. */
  const allDone = done === total && (questions.length === 0 || extraDone);
  const last = step === sections.length - 1;

  /** Required questions with nothing in them. Named, so the message can say. */
  const unanswered = questions.filter(
    (qn) => qn.required && (answers[qn.id] ?? "").trim() === ""
  );

  /* `completeness` only knows about the standard six, so the count on the
     button has to add the seventh itself. Without this the button sat
     disabled reading "0 sections to go" the moment somebody had finished
     everything except a required question - a dead end with no explanation,
     which is the worst possible last screen. */
  const sectionsLeft = total - done + (questions.length > 0 && !extraDone ? 1 : 0);
  const finishLabel = allDone
    ? "That's my passport done"
    : done === total && unanswered.length
      ? `${unanswered.length} question${unanswered.length === 1 ? "" : "s"} still to answer`
      : `${sectionsLeft} section${sectionsLeft === 1 ? "" : "s"} to go`;

  function go(to: number) {
    setDir(to > step ? 1 : -1);
    setStep(Math.max(0, Math.min(sections.length - 1, to)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish() {
    await save(d);
    if (!demo) {
      await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}&submit=1`, {
        method: "POST",
      }).catch(() => null);
    }
    setSubmitted(true);
  }

  const panels = [
    <>
      <Field label="Full legal name" hint="As it appears on your passport or driving licence, so referencing matches first time.">
        <input className={input} value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
      </Field>
      <Field label="Known as" hint="Optional, if you go by something else.">
        <input className={input} value={d.knownAs} onChange={(e) => set("knownAs", e.target.value)} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Date of birth">
          <input type="date" className={input} value={d.dob} onChange={(e) => set("dob", e.target.value)} />
        </Field>
        <Field label="Nationality">
          <input className={input} value={d.nationality} onChange={(e) => set("nationality", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email">
          <input type="email" className={input} value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Mobile">
          <input type="tel" className={input} value={d.mobile} onChange={(e) => set("mobile", e.target.value)} />
        </Field>
      </div>
    </>,

    <>
      <YesNo
        label="Do you have a British or Irish passport?"
        hint="Every landlord in England has to check this by law. This one question decides how."
        value={d.hasBritishPassport}
        onChange={(v) => set("hasBritishPassport", v)}
      />
      {d.hasBritishPassport === false && (
        <Field
          label="Your share code"
          hint="Free from gov.uk/prove-right-to-rent. It takes about two minutes and lasts 90 days. With this we can do the whole check online, today."
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
        <p className="rounded-xl border border-line/70 bg-card p-4 text-[13px] leading-relaxed text-muted">
          That settles it, and there is nothing to upload. The law says the passport has to be seen
          in person, so your agent will check it when you meet - it takes a moment.
        </p>
      )}
    </>,

    <>
      <Field label="What best describes you?">
        <select className={input} value={d.applicantType} onChange={(e) => set("applicantType", e.target.value)}>
          <option value="">Choose…</option>
          {APPLICANT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Annual income, before tax">
          <input className={input} value={d.annualIncome} placeholder="32,000" onChange={(e) => set("annualIncome", e.target.value)} />
        </Field>
        <Field label="Savings" hint="Optional, and it is what rescues a borderline application.">
          <input className={input} value={d.savings} placeholder="4,000" onChange={(e) => set("savings", e.target.value)} />
        </Field>
      </div>
    </>,

    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Adults, including you">
          <input type="number" min={1} className={input} value={d.numAdults} onChange={(e) => set("numAdults", e.target.value)} />
        </Field>
        <Field label="Children">
          <input type="number" min={0} className={input} value={d.numChildren} onChange={(e) => set("numChildren", e.target.value)} />
        </Field>
      </div>
      <Field label="What the other adults earn" hint="One per line, with a name if you like. Their income counts towards the total.">
        <textarea
          rows={3}
          className={`${input} resize-none leading-relaxed`}
          value={d.coOccupantIncomes}
          placeholder={"Sam - 24,000\nAlex - 19,500"}
          onChange={(e) => set("coOccupantIncomes", e.target.value)}
        />
      </Field>
      {household.total !== null && (
        <p className="rounded-xl border border-line/70 bg-card p-4 text-[13px] leading-relaxed">
          <strong>Household income: £{household.total.toLocaleString("en-GB")}</strong>
          <span className="text-muted">
            {" "}
            from {household.from} {household.from === 1 ? "figure" : "figures"}. If that looks wrong,
            check the lines above - we only count what looks like an amount.
          </span>
        </p>
      )}
    </>,

    <>
      <Field label="Your current address">
        <input className={input} value={d.currentAddress} onChange={(e) => set("currentAddress", e.target.value)} />
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
        <input className={input} value={d.previousAddress} onChange={(e) => set("previousAddress", e.target.value)} />
      </Field>
    </>,

    <>
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
      <YesNo label="Could you provide a guarantor if one were needed?" value={d.guarantor} onChange={(v) => set("guarantor", v)} />
      <YesNo label="Any pets?" value={d.pets} onChange={(v) => set("pets", v)} />
      {d.pets && (
        <Field label="What kind?">
          <input className={input} value={d.petsNote} onChange={(e) => set("petsNote", e.target.value)} />
        </Field>
      )}
      <YesNo label="Does anyone moving in smoke?" value={d.smoker} onChange={(v) => set("smoker", v)} />
    </>,
  ];

  /* The agent's own questions, rendered with the SAME field components as
     everything above, so a custom question does not announce itself as an
     afterthought bolted on the end. Pushed rather than always present: with
     no questions there is no seventh panel and no seventh step. */
  if (questions.length > 0) {
    panels.push(
      <>
        {questions.map((qn) => {
          const value = answers[qn.id] ?? "";
          const put = (v: string) => setAnswers((a) => ({ ...a, [qn.id]: v }));
          const label = qn.required ? `${qn.label} *` : qn.label;

          if (qn.kind === "yesno") {
            return (
              <YesNo
                key={qn.id}
                label={label}
                /* Tri-state on purpose: null is "not answered yet", which is
                   what a required question needs to be able to mean. */
                value={value === "" ? null : value === "yes"}
                onChange={(v) => put(v ? "yes" : "no")}
              />
            );
          }

          if (qn.kind === "select") {
            return (
              <Field key={qn.id} label={label}>
                <select className={input} value={value} onChange={(e) => put(e.target.value)}>
                  <option value="">Please choose</option>
                  {qn.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
            );
          }

          return (
            <Field key={qn.id} label={label}>
              <input className={input} value={value} onChange={(e) => put(e.target.value)} />
            </Field>
          );
        })}
        <p className="text-[13px] leading-relaxed text-muted">
          Anything marked * has to be answered before you can finish.
        </p>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      {/* ── The bar, across the whole width ── */}
      <div className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            The Letting Experts · Tenant Passport
          </p>
          <p className="text-[12.5px] text-muted">
            {state === "saving" ? "Saving…" : state === "error" ? "Not saved - check your connection" : `${bar.pct}% complete`}
          </p>
        </div>
        <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-line/50">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(bar.pct, 3)}%`, background: RED }}
          />
        </div>

        {/* The steps, nameable and jumpable. Nothing is gated: somebody who
            cannot find their share code has to be able to carry on. */}
        <nav className="mt-4 flex flex-wrap gap-x-1.5 gap-y-2">
          {sections.map((s, i) => {
            const isDone = s.done(d);
            const here = i === step;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => go(i)}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
                  here ? "border-ink bg-ink text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    isDone ? "text-page" : here ? "bg-page/25 text-page" : "bg-line/60 text-muted"
                  }`}
                  style={isDone ? { background: RED } : undefined}
                >
                  {isDone ? "✓" : i + 1}
                </span>
                {s.title}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Copy hard left, passport hard right ── */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-14">
        <div className="order-2 min-w-0 lg:order-1">
          {/* key on the step so React remounts and the animation replays. */}
          <div
            key={step}
            style={{
              animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both",
              ["--from" as string]: `${dir * 28}px`,
            }}
          >
            <h1 className="hand text-[34px] leading-tight sm:text-[42px]">{sections[step].title}</h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-muted">
              {sections[step].blurb}
            </p>
            <div className="mt-7 max-w-2xl space-y-6">{panels[step]}</div>
          </div>

          <div className="mt-9 flex max-w-2xl flex-wrap items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => go(step - 1)}
                className="rounded-xl border border-line/80 px-6 py-3 text-[14px] transition-colors hover:border-ink"
              >
                Back
              </button>
            )}
            {!last ? (
              <button
                type="button"
                onClick={() => go(step + 1)}
                className="rounded-xl bg-ink px-8 py-3 text-[14px] font-semibold text-page"
              >
                Next
              </button>
            ) : submitted ? (
              <p className="text-[14px] leading-relaxed">
                <strong>Your passport is with us.</strong> Change anything you like - it updates
                straight away, and this link keeps working.
              </p>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={!allDone}
                className={`rounded-xl px-8 py-3 text-[14px] font-semibold transition-opacity ${
                  allDone ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                }`}
              >
                {finishLabel}
              </button>
            )}
            <span className="text-[12.5px] text-muted">Everything saves as you go.</span>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-8">
            <PassportBook data={d} />
            <p className="mt-4 text-center text-[12px] leading-relaxed text-muted">
              {done} of {total} stamps. Nothing here is shared with a landlord unless you apply for
              their property.
            </p>
            {money(d.annualIncome) !== null && (
              <p className="mt-1.5 text-center text-[11.5px] leading-relaxed text-muted">
                Affordability is worked out per property when you apply, so this does not rule
                anything in or out on its own.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
