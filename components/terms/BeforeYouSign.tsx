"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QuestionField from "@/components/terms/QuestionField";
import { KEPT, PROPERTY_QUESTIONS, asked, cardAsked, cardKey, filled, stepDone, wants, type Answers, type QuestionStep } from "@/lib/property-questions";
import { askedOf, detailText } from "@/lib/terms/detail-text";
import type { DetailField, LandlordDetails, TermsDoc } from "@/lib/terms/types";

/**
 * "WE NEED A FEW MORE DETAILS" - the questions before the contract (James,
 * 5 Nov 2026).
 *
 * "When the landlord goes to sign it ... a screen, 'We need a few more
 * details', and then we'll see a selection of questions ... just a few
 * questions at a time, just to get all of the questions out of the way, and
 * then they can move on to signing. We need a section where they can add
 * their bank details in, which will attach it to the contract."
 *
 * So, on their own link (app/sign/[token]) before the contract opens:
 *
 *   1. A short hello: how many screens, and that their agent has filled in
 *      what they already knew.
 *   2. One subject a screen (lib/property-questions), only the screens with
 *      something still to answer; whatever the agent answered is skipped.
 *      Each answer saves as they go, against the home (lib/home-answers).
 *   3. Their own part of the contract: the declarations (their residence, and
 *      for the first landlord the licensing), their registration, then last
 *      the bank account the rent goes to (the first landlord only), each saved
 *      straight into their boxes on the contract.
 *   4. A check screen, every subject with Change, the ones the agent answered
 *      included, then on to the contract.
 *
 * James's rule for long forms (screens of questions that belong together,
 * sliding across, then check): Continue only waits on a question the
 * contract can't go without, and every one of those has a "Not sure".
 */

type Screen =
  | { kind: "intro" }
  | { kind: "you" }
  | { kind: "home"; step: QuestionStep }
  | { kind: "declarations" }
  | { kind: "registration" }
  | { kind: "bank" }
  | { kind: "check" };

type Saved<T> = { ok: boolean; error?: string } & T;

export type BeforeProps = {
  doc: TermsDoc;
  /** Their place on the contract: 0 is the first landlord, who also gives the home's part. */
  index: number;
  firstName: string;
  agentFirst: string;
  street: string;
  answers: Answers;
  answeredBy: Record<string, string>;
  details: Partial<LandlordDetails>;
  fromFile: Array<keyof LandlordDetails>;
  bankOnFile: { bankName: string; accountName: string; sortCode: string; last4: string } | null;
  saveAnswers: (patch: Answers, checked?: string[]) => Promise<Saved<{ answers?: Answers }>>;
  /**
   * Subjects the agent sent them to check anyway, and what the OS already had for them
   * (James, 5 Nov 2026: "pulled through ... confirm the details again"). Shown filled in.
   */
  askAgain?: string[];
  pulled?: Answers;
  /**
   * What the file shows for a declaration (gas, licensing), said beside the question. Never
   * ticked for them: a declaration on the contract is theirs to give (James, 5 Nov 2026).
   */
  hints?: Record<string, string>;
  saveDetails: (d: Partial<LandlordDetails>) => Promise<Saved<{ details?: Partial<LandlordDetails> }>>;
  onDone: (details: Partial<LandlordDetails>, answers: Answers) => void;
  /** Came back to look over their answers: straight to the check screen. */
  review?: boolean;
};

const blank = (v: unknown) => String(v ?? "").trim() === "";

/** Is a detail as it should be? (A sort code is six numbers, an account six to ten; an account shown as its last four is kept.) */
function detailOk(f: DetailField, v: string): boolean {
  const t = v.trim();
  if (!t) return !f.required;
  if (f.kind === "sortcode") return /^\d{6}$/.test(t.replace(/[\s-]/g, ""));
  if (f.kind === "account") return t.startsWith("••••") || t === "on-file" || /^\d{6,10}$/.test(t.replace(/\s/g, ""));
  if (f.kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  if (f.kind === "yesno") return t === "yes" || t === "no";
  return true;
}

/** The screens, worked out once as they arrive, so a screen never vanishes while they are on it. */
function plan(p: BeforeProps): Screen[] {
  const fields = askedOf(p.doc, p.index);
  const of = (step: DetailField["step"]) => fields.filter((f) => f.step === step);
  const fromFile = new Set(p.fromFile);
  const out: Screen[] = [];
  if (of("you").some((f) => !detailOk(f, String(p.details[f.key] ?? "")))) out.push({ kind: "you" });
  for (const st of PROPERTY_QUESTIONS) {
    /* Still something to answer; or a screen of optional questions nobody has touched, asked once. */
    const untouched = st.questions.every((q) => q.optional) && st.questions.every((q) => !filled(p.answers[q.id]));
    if (!stepDone(st, p.answers) || untouched || (p.askAgain ?? []).includes(st.id)) out.push({ kind: "home", step: st });
  }
  const want = (fs: DetailField[]) => fs.some((f) => !detailOk(f, String(p.details[f.key] ?? "")) || fromFile.has(f.key) || (!f.required && blank(p.details[f.key])));
  if (want(of("declarations"))) out.push({ kind: "declarations" });
  if (want(of("registration"))) out.push({ kind: "registration" });
  if (of("bank").some((f) => !detailOk(f, String(p.details[f.key] ?? "")))) out.push({ kind: "bank" });
  return p.review ? [{ kind: "check" }] : [{ kind: "intro" }, ...out, { kind: "check" }];
}

const STEP_TITLE: Record<"you" | "declarations" | "registration" | "bank", { title: string; blurb: string }> = {
  you: { title: "About You", blurb: "So the contract is in your name and we can reach you." },
  declarations: { title: "Your Declarations", blurb: "These go on page 2 of your contract, and you confirm them when you sign." },
  registration: { title: "Registration", blurb: "Your landlord registration, as it goes on the contract." },
  bank: { title: "Your Bank Details", blurb: "The account your rent is paid into. They go on your contract and are kept locked away." },
};

export default function BeforeYouSign(p: BeforeProps) {
  const [screens] = useState<Screen[]>(() => plan(p));
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState(1);
  /* What the file already had for the subjects sent to check, shown filled in; anything kept since wins. */
  const [answers, setAnswers] = useState<Answers>(() => ({ ...(p.pulled ?? {}), ...p.answers }));
  const [fromFileAns] = useState(() => new Set(Object.keys(p.pulled ?? {}).filter((k) => !String(p.answers[k] ?? "").trim())));
  const [details, setDetails] = useState<Partial<LandlordDetails>>(p.details);
  const [fromFile, setFromFile] = useState(new Set(p.fromFile));
  const [useFile, setUseFile] = useState<boolean>(Boolean(p.bankOnFile));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<number | null>(null);
  /* A subject the agent answered, opened from the check screen: shown in place, then back to the check. */
  const [extra, setExtra] = useState<QuestionStep | null>(null);

  const fields = askedOf(p.doc, p.index);
  const of = (step: DetailField["step"]) => fields.filter((f) => f.step === step);
  const screen = screens[at];

  /* Answers save as they go, a beat after the last change, and never lost to a closed tab. */
  const pending = useRef<Answers>({});
  const timer = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  const flush = useCallback(async (checked: string[] = []) => {
    if (timer.current) window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length && !checked.length) return true;
    setSaving(true);
    const r = await p.saveAnswers(patch, checked).catch(() => null);
    setSaving(false);
    if (!r?.ok) {
      pending.current = { ...patch, ...pending.current };
      setErr(r?.error ?? "That didn't save. Check your connection and try again.");
      return false;
    }
    return true;
  }, [p]);
  useEffect(() => () => void flush(), [flush]);

  const answer = (id: string, v: string) => {
    setErr(null);
    setAnswers((a) => ({ ...a, [id]: v }));
    pending.current[id] = v;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 650);
  };

  const go = (to: number) => {
    setDir(to >= at ? 1 : -1);
    setAt(Math.max(0, Math.min(screens.length - 1, to)));
    setErr(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const checkAt = screens.length - 1;
  const forward = () => (returnTo != null ? (setReturnTo(null), go(returnTo)) : go(at + 1));

  /* The boxes of one of their own screens: checked here, then saved into their part of the contract. */
  async function saveOwn(step: "you" | "declarations" | "registration" | "bank") {
    let fs = of(step);
    let send: Partial<LandlordDetails> = {};
    if (step === "bank" && p.bankOnFile && useFile) {
      send = { bankName: p.bankOnFile.bankName, bankAccountName: p.bankOnFile.accountName, sortCode: p.bankOnFile.sortCode, accountNumber: "on-file" };
      fs = [];
    }
    const bad = fs.find((f) => !detailOk(f, String(details[f.key] ?? "")));
    if (bad) {
      setErr(
        bad.kind === "sortcode" ? "A sort code is six numbers, like 12-34-56." : bad.kind === "account" ? "Your account number is usually eight numbers." : `${bad.ask ?? bad.label} is needed before you sign.`
      );
      return false;
    }
    if (!Object.keys(send).length) send = Object.fromEntries(fs.map((f) => [f.key, String(details[f.key] ?? "").trim()]));
    setBusy(true);
    const r = await p.saveDetails(send).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setErr(r?.error ?? "That didn't save. Try again in a moment.");
      return false;
    }
    if (r.details) setDetails(r.details);
    setFromFile((s) => new Set([...s].filter((k) => !(k in send))));
    return true;
  }

  async function next() {
    if (busy) return;
    setErr(null);
    if (!screen) return;
    if (screen.kind === "home") {
      const open = screen.step.questions.filter((q) => wants(q, answers));
      if (open.length) {
        setErr(open.length === 1 ? `"${open[0].label}" still needs an answer. "Not sure" is fine.` : `${open.length} questions here still need an answer. "Not sure" is fine.`);
        return;
      }
      /* A subject sent to them to check: what they saw is now theirs, saved as they confirmed it. */
      const again = (p.askAgain ?? []).includes(screen.step.id);
      if (again) {
        for (const q of screen.step.questions) {
          if (!asked(q, answers)) continue;
          if (filled(answers[q.id]) && answers[q.id] !== KEPT) pending.current[q.id] = answers[q.id];
          if (cardAsked(q, answers) && filled(answers[cardKey(q.id)])) pending.current[cardKey(q.id)] = answers[cardKey(q.id)];
        }
      }
      if (!(await flush(again ? [screen.step.id] : []))) return;
    }
    if (screen.kind === "you" || screen.kind === "declarations" || screen.kind === "registration" || screen.kind === "bank") {
      if (!(await saveOwn(screen.kind))) return;
    }
    if (screen.kind === "check") {
      if (!(await flush())) return;
      const left = PROPERTY_QUESTIONS.filter((st) => !stepDone(st, answers));
      const own = fields.find((f) => f.required && !detailOk(f, String(details[f.key] ?? "")));
      if (left.length || own) {
        setErr(left.length ? `${left[0].title} still has a question to answer.` : `${own!.ask ?? own!.label} is still needed.`);
        return;
      }
      p.onDone(details, answers);
      return;
    }
    forward();
  }

  /* Enter moves on, except in a long answer. */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.tagName === "BUTTON") return;
      e.preventDefault();
      void next();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  const steps = screens.filter((s) => s.kind !== "intro" && s.kind !== "check").length;
  const n = screens.slice(0, at + 1).filter((s) => s.kind !== "intro" && s.kind !== "check").length;
  const agentDid = Object.values(p.answeredBy).filter((w) => w === "agent").length;
  /* Answered already by another landlord on the contract (or on their own portal). */
  const othersDid = Object.values(p.answeredBy).filter((w) => w === "landlord").length;
  const mins = Math.max(2, Math.round(steps * 0.6));

  const detailInputs = (fs: DetailField[]) =>
    fs.map((f) => {
      const v = String(details[f.key] ?? "");
      const on = (x: string) => {
        setErr(null);
        setDetails((d) => ({ ...d, [f.key]: x }));
      };
      if (f.kind === "yesno") {
        return (
          <div key={f.key} className="tq-q">
            <span className="tq-l">{f.ask ?? f.label}</span>
            {f.hint ? <p className="tq-help">{f.hint}</p> : null}
            <div className="tq-opts" role="radiogroup" aria-label={f.ask ?? f.label}>
              {(["yes", "no"] as const).map((x) => (
                <button key={x} type="button" role="radio" aria-checked={v === x} className={v === x ? "on" : ""} onClick={() => on(x)}>
                  {x === "yes" ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {p.hints?.[f.key] && !v ? <p className="tq-by">Our file shows {p.hints[f.key]}. Choose the answer yourself: it goes on your contract.</p> : null}
          </div>
        );
      }
      const bad = v.trim() !== "" && !detailOk(f, v);
      return (
        <div key={f.key} className="tq-q">
          <label className="tq-l" htmlFor={`tq-d-${f.key}`}>
            {f.label}
            {f.required ? null : <span className="tq-opt">Optional</span>}
          </label>
          <input
            id={`tq-d-${f.key}`}
            type={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : f.kind === "date" ? "date" : "text"}
            inputMode={f.kind === "sortcode" || f.kind === "account" ? "numeric" : undefined}
            autoComplete={f.key === "email" ? "email" : f.key === "phone" ? "tel" : f.key === "name" ? "name" : f.key === "address" ? "street-address" : "off"}
            value={f.key === "accountNumber" && v.startsWith("••••") ? "" : v}
            placeholder={f.key === "accountNumber" && v.startsWith("••••") ? `Saved, ending ${v.slice(-4)}. Type to change it.` : f.kind === "sortcode" ? "12-34-56" : f.kind === "account" ? "12345678" : undefined}
            onChange={(e) => on(e.target.value)}
          />
          {bad ? (
            <small className="tq-bad">{f.kind === "sortcode" ? "Six numbers, like 12-34-56." : f.kind === "account" ? "Usually eight numbers." : "That doesn't look right."}</small>
          ) : fromFile.has(f.key) ? (
            <small className="tq-by">We have this on file. Change it if it isn&apos;t right.</small>
          ) : f.hint ? (
            <small className="tq-help">{f.hint}</small>
          ) : null}
        </div>
      );
    });

  /* ── the check screen: every subject, with Change ── */
  const summary = (st: QuestionStep): string[] =>
    st.questions
      .filter((q) => asked(q, answers) && filled(answers[q.id]))
      .map((q) => {
        const v = answers[q.id];
        const val = q.secret ? "Kept locked away" : q.kind === "choice" ? q.options?.find((o) => o.id === v)?.label ?? String(v) : String(v);
        const card = cardAsked(q, answers) && answers[cardKey(q.id)] ? (answers[cardKey(q.id)] === "yes" ? ", card meter" : "") : "";
        return `${q.label.replace(/\?$/, "")}: ${val}${card}`;
      });
  const ownSummary = (fs: DetailField[]) =>
    fs.filter((f) => !blank(details[f.key])).map((f) => `${f.ask ? f.label : f.label}: ${detailText(f, String(details[f.key] ?? ""), { mask: true })}`);
  const jumpTo = (match: (s: Screen) => boolean) => {
    const i = screens.findIndex(match);
    if (i >= 0) {
      setReturnTo(checkAt);
      go(i);
    }
  };
  const byAgent = (st: QuestionStep) => st.questions.some((q) => p.answeredBy[q.id] === "agent");

  const body = (() => {
    if (!screen) return null;
    switch (screen.kind) {
      case "intro":
        return (
          <div className="bys-intro">
            <h1>
              We need a few more details, <span>{p.firstName}.</span>
            </h1>
            <p>
              Before your contract opens, a few questions about {p.street}: {steps} short {steps === 1 ? "screen" : "screens"}, about {mins} minutes. It saves as you
              go, so you can stop and come back to this link.
            </p>
            {agentDid > 0 ? (
              <p className="bys-note">{p.agentFirst} has already filled in what they knew, so those aren&apos;t asked again. You&apos;ll see them at the end to check.</p>
            ) : othersDid > 0 ? (
              <p className="bys-note">Some of this has been answered already, so it isn&apos;t asked again. You&apos;ll see it all at the end to check.</p>
            ) : null}
            <ul className="bys-list">
              {screens
                .filter((s) => s.kind !== "intro" && s.kind !== "check")
                .map((s, i) => (
                  <li key={i}>{s.kind === "home" ? s.step.title : STEP_TITLE[s.kind as keyof typeof STEP_TITLE].title}</li>
                ))}
            </ul>
          </div>
        );
      case "home":
        return (
          <>
            <Head title={screen.step.title} blurb={screen.step.blurb} />
            {(p.askAgain ?? []).includes(screen.step.id) && screen.step.questions.some((q) => asked(q, answers) && (fromFileAns.has(q.id) || filled(p.answers[q.id]))) ? (
              <p className="bys-file">We&apos;ve filled in what we already had. Check it&apos;s still right, and change anything that isn&apos;t.</p>
            ) : null}
            <div className="tq">
              {screen.step.questions.map((q) => (
                <QuestionField
                  key={q.id}
                  q={q}
                  answers={answers}
                  onChange={answer}
                  by={
                    p.hints?.[q.id] && !filled(answers[q.id])
                      ? `Our file shows ${p.hints[q.id]}. Choose the answer yourself: it goes on your contract.`
                      : fromFileAns.has(q.id) && filled(answers[q.id])
                      ? "From your file. Change it if it isn't right."
                      : p.answeredBy[q.id] === "agent" && filled(answers[q.id])
                        ? `${p.agentFirst} filled this in. Change it if it isn't right.`
                        : null
                  }
                />
              ))}
            </div>
          </>
        );
      case "bank":
        return (
          <>
            <Head title={STEP_TITLE.bank.title} blurb={STEP_TITLE.bank.blurb} />
            <div className="tq">
              {p.bankOnFile ? (
                <div className="tq-q">
                  <span className="tq-l">The account we have for you</span>
                  <div className="tq-opts col" role="radiogroup" aria-label="Which account">
                    <button type="button" role="radio" aria-checked={useFile} className={useFile ? "on" : ""} onClick={() => setUseFile(true)}>
                      {p.bankOnFile.bankName || "Your bank"}, {p.bankOnFile.sortCode}, account ending {p.bankOnFile.last4}
                    </button>
                    <button type="button" role="radio" aria-checked={!useFile} className={!useFile ? "on" : ""} onClick={() => setUseFile(false)}>
                      A different account
                    </button>
                  </div>
                </div>
              ) : null}
              {!p.bankOnFile || !useFile ? detailInputs(of("bank")) : null}
              <p className="bys-lock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Kept encrypted. Only the last four numbers are ever shown on screen; the full account goes on your signed contract.
              </p>
            </div>
          </>
        );
      case "check":
        return (
          <>
            <Head title="Check Your Answers" blurb="Everything here goes on your file, and your part goes on the contract. Change anything that isn't right." />
            <div className="bys-check">
              {fields.some((f) => f.step === "you") && (
                <Group title="About You" lines={ownSummary(of("you"))} onChange={screens.some((s) => s.kind === "you") ? () => jumpTo((s) => s.kind === "you") : null} />
              )}
              {PROPERTY_QUESTIONS.map((st) => {
                const lines = summary(st);
                const visited = screens.some((s) => s.kind === "home" && s.step.id === st.id);
                return (
                  <Group
                    key={st.id}
                    title={st.title}
                    note={!visited && byAgent(st) ? `Filled in by ${p.agentFirst}` : null}
                    lines={lines.length ? lines : ["Nothing given"]}
                    warn={!stepDone(st, answers)}
                    onChange={() => {
                      const i = screens.findIndex((s) => s.kind === "home" && s.step.id === st.id);
                      if (i >= 0) return jumpTo((s) => s.kind === "home" && s.step.id === st.id);
                      setExtra(st);
                    }}
                  />
                );
              })}
              {(["declarations", "registration", "bank"] as const).map((k) =>
                of(k).length ? (
                  <Group key={k} title={STEP_TITLE[k].title} lines={ownSummary(of(k)).length ? ownSummary(of(k)) : ["Nothing given"]} onChange={screens.some((s) => s.kind === k) ? () => jumpTo((s) => s.kind === k) : null} />
                ) : null
              )}
            </div>
          </>
        );
      default:
        return (
          <>
            <Head title={STEP_TITLE[screen.kind].title} blurb={STEP_TITLE[screen.kind].blurb} />
            <div className="tq">{detailInputs(of(screen.kind))}</div>
          </>
        );
    }
  })();

  if (extra) {
    return (
      <Frame step={n} of={steps} saving={saving} dir={1} k={`x-${extra.id}`}>
        <Head title={extra.title} blurb={extra.blurb} />
        <div className="tq">
          {extra.questions.map((q) => (
            <QuestionField key={q.id} q={q} answers={answers} onChange={answer} by={p.answeredBy[q.id] === "agent" && filled(answers[q.id]) ? `${p.agentFirst} filled this in.` : null} />
          ))}
        </div>
        {err && <p className="bys-err" role="alert">{err}</p>}
        <div className="bys-foot">
          <span />
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              const open = extra.questions.filter((q) => wants(q, answers));
              if (open.length) return setErr(`"${open[0].label}" still needs an answer. "Not sure" is fine.`);
              if (await flush()) setExtra(null);
            }}
          >
            Done
          </button>
        </div>
      </Frame>
    );
  }

  const last = screen?.kind === "check";
  return (
    <Frame step={n} of={steps} saving={saving} dir={dir} k={String(at)} intro={screen?.kind === "intro"}>
      {body}
      {err && <p className="bys-err" role="alert">{err}</p>}
      <div className="bys-foot">
        {at > 0 && returnTo == null ? (
          <button type="button" className="btn ghost" onClick={() => go(at - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn primary" disabled={busy} onClick={() => void next()}>
          {busy ? "Saving…" : screen?.kind === "intro" ? "Start" : last ? "Continue to your contract" : returnTo != null ? "Save and go back" : "Continue"}
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </Frame>
  );
}

function Head({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="bys-head">
      <h2>{title}</h2>
      <p>{blurb}</p>
    </header>
  );
}

function Frame({ step, of, saving, dir, k, intro = false, children }: { step: number; of: number; saving: boolean; dir: number; k: string; intro?: boolean; children: React.ReactNode }) {
  return (
    <section className="view on">
      <div className="bys">
        {!intro && of > 0 ? (
          <div className="bys-prog" aria-label={`Screen ${Math.min(step, of)} of ${of}`}>
            <div className="bys-bar">
              <i style={{ width: `${Math.round((Math.min(step, of) / of) * 100)}%` }} />
            </div>
            <span>
              {step > of ? "Last check" : `${step} of ${of}`}
              {saving ? " · Saving…" : ""}
            </span>
          </div>
        ) : null}
        <div key={k} className="bys-card" style={{ animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` }}>
          {children}
        </div>
      </div>
    </section>
  );
}

function Group({ title, lines, note = null, warn = false, onChange }: { title: string; lines: string[]; note?: string | null; warn?: boolean; onChange: (() => void) | null }) {
  return (
    <div className={`bys-g${warn ? " warn" : ""}`}>
      <div className="bys-gh">
        <b>{title}</b>
        {note ? <span className="bys-gn">{note}</span> : null}
        {onChange ? (
          <button type="button" onClick={onChange}>
            Change
          </button>
        ) : null}
      </div>
      <ul>
        {lines.slice(0, 6).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {lines.length > 6 ? <li className="more">and {lines.length - 6} more</li> : null}
      </ul>
      {warn ? <p className="bys-gw">Something here still needs an answer.</p> : null}
    </div>
  );
}
