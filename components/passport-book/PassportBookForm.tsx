"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EMPTY_PASSPORT, type PassportData, type PassportRules } from "@/lib/passport-shape";
import type { PassportQuestion } from "@/components/PassportForm";
import Passport from "./Passport";
import StepBody, { type Boxes } from "./Steps";
import { Ic, Mark } from "./icons";
import { howLongFor, missing, monthsSince, percent, shortAddress, stepOk, stepsFor, type Ctx, type Ui } from "./model";

/**
 * The tenant passport as a book (James's Claude Design file, 24 Oct 2026).
 *
 * Behind the "passport" switch in Admin > Switches (lib/new-look): until it is
 * on for everyone, tenants get today's passport (components/PassportForm),
 * and this is drawn only for signed-in staff at their level or with
 * ?look=new. The page decides (app/tenant/(public)/passport/[token]).
 *
 * The design's prototype kept its answers in the browser. This keeps today's
 * mechanics instead: every change is saved to the server after a pause
 * (PUT /api/tenant/passport), a failed save is tried again every ten seconds
 * and the moment the phone is back online, the agent's own questions save
 * alongside, Sign finishes it on the server (which refuses a passport with a
 * required answer missing), and the last page makes the tenant's account
 * (/api/tenant/passport/account) or opens the one they have.
 *
 * Stamps are earned, not stored: a step's stamp is on when every answer it
 * needs is in. Pressing Continue on a step that has just earned one turns the
 * passport over and thuds it on.
 */

const NO_RULES: PassportRules = {};
const THIS_YEAR = () => new Date().getFullYear();

/** "1996-03-14" from three boxes, or "" until they make a real date at least 16 years ago. */
function dobIso(b: Boxes): string {
  if (!/^\d{1,2}$/.test(b.dd) || !/^\d{1,2}$/.test(b.mm) || !/^\d{4}$/.test(b.yyyy)) return "";
  const y = Number(b.yyyy), m = Number(b.mm), day = Number(b.dd);
  if (y < 1900 || y > THIS_YEAR() - 16 || m < 1 || m > 12 || day < 1) return "";
  if (day > new Date(y, m, 0).getDate()) return "";
  return `${b.yyyy}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "2023-04" from two boxes, or "" until it is a real month that has already started. */
function movedIso(b: { mm: string; yyyy: string }): string {
  if (!/^\d{1,2}$/.test(b.mm) || !/^\d{4}$/.test(b.yyyy)) return "";
  const y = Number(b.yyyy), m = Number(b.mm);
  if (m < 1 || m > 12 || y < 1900) return "";
  const now = new Date();
  if (y * 12 + m > now.getFullYear() * 12 + now.getMonth() + 1) return "";
  return `${b.yyyy}-${String(m).padStart(2, "0")}`;
}

/** Which chips were lit, read back off a passport saved earlier. */
function uiFrom(d: PassportData): Ui {
  const months = monthsSince(d.movedIn);
  return {
    howlong: months !== null ? howLongFor(months) : d.livedThreeYears === true ? "Over 3 years" : "",
    rtrPick: d.hasBritishPassport === true ? "British or Irish passport" : d.hasBritishPassport === false ? "A share code" : "",
    petPick: d.pets === false ? "No pets" : d.pets === true ? (d.petsNote === "A cat" || d.petsNote === "A dog" ? d.petsNote : "Something else") : "",
  };
}

type SaveResult = "ok" | "error" | "locked" | "held";

export default function PassportBookForm({
  token,
  initial,
  rules = NO_RULES,
  submittedAt,
  questions = [],
  initialAnswers = {},
  agentName = "",
  accountExists = false,
  resume = false,
  home = null,
}: {
  token: string;
  initial: PassportData;
  rules?: PassportRules;
  submittedAt: string | null;
  questions?: PassportQuestion[];
  initialAnswers?: Record<string, string>;
  agentName?: string;
  accountExists?: boolean;
  resume?: boolean;
  /** The home they enquired about, from their lead, when there is one. */
  home?: string | null;
}) {
  const steps = useMemo(() => stepsFor(rules), [rules]);
  const last = steps.length - 1;
  const root = useRef<HTMLDivElement>(null);

  const [d, setD] = useState<PassportData>(() => ({ ...EMPTY_PASSPORT, ...initial }));
  const dRef = useRef(d);
  dRef.current = d;
  const set = useCallback(<K extends keyof PassportData>(k: K, v: PassportData[K]) => setD((cur) => ({ ...cur, [k]: v })), []);
  const patch = useCallback((p: Partial<PassportData>) => setD((cur) => ({ ...cur, ...p })), []);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const [ui, setUiState] = useState<Ui>(() => uiFrom({ ...EMPTY_PASSPORT, ...initial }));
  const setUi = (p: Partial<Ui>) => setUiState((u) => ({ ...u, ...p }));
  const [dob, setDob] = useState<Boxes>(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(initial.dob ?? "");
    return m ? { dd: m[3], mm: m[2], yyyy: m[1] } : { dd: "", mm: "", yyyy: "" };
  });
  const [moved, setMoved] = useState<{ mm: string; yyyy: string }>(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(initial.movedIn ?? "");
    return m ? { mm: m[2], yyyy: m[1] } : { mm: "", yyyy: "" };
  });

  const ctx: Ctx = { d, rules, questions, answers, ui };
  const firstOpen = (c: Ctx) => {
    const i = steps.findIndex((s) => !stepOk(s.id, c));
    return i === -1 ? last : i;
  };

  const [submitted, setSubmitted] = useState(Boolean(submittedAt));
  const [at, setAt] = useState<"start" | "steps" | "end">(() => (submittedAt ? "end" : resume ? "steps" : "start"));
  const [step, setStep] = useState(() => (resume && !submittedAt ? firstOpen(ctx) : 0));
  /** Steps they have been through with every answer in. Read through stepOk, so a cleared answer takes its stamp off. */
  const [passed, setPassed] = useState<number[]>(() => steps.map((s, i) => (stepOk(s.id, ctx) ? i : -1)).filter((i) => i >= 0));
  const [err, setErr] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [fresh, setFresh] = useState<{ k: number; n: number } | null>(null);
  const [pop, setPop] = useState<number | null>(null);
  const [got, setGot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [laterNote, setLaterNote] = useState("");

  const stamped = passed.filter((k) => k > 0 && k <= last && stepOk(steps[k].id, ctx));
  const pct = percent(steps, ctx);
  const back = passed.length > 0;
  const firstName = (d.knownAs.trim() || d.legalName.trim()).split(/\s+/)[0] || "";

  /* ── Saving ──────────────────────────────────────────────────────────── */

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | SaveResult>("idle");
  const lastSaved = useRef(JSON.stringify({ d: { ...EMPTY_PASSPORT, ...initial }, a: initialAnswers }));

  const save = useCallback(
    async (next: PassportData): Promise<SaveResult> => {
      setSaveState("saving");
      const body = { data: next, answers: answersRef.current };
      try {
        const r = await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.ok) {
          lastSaved.current = JSON.stringify({ d: next, a: body.answers });
          setSaveState("saved");
          return "ok";
        }
        /* A finished passport: only its owner, signed in, can change it, and
           never into one with an answer missing (app/api/tenant/passport). */
        if (r.status === 409) {
          const j = (await r.json().catch(() => ({}))) as { incomplete?: boolean };
          const out: SaveResult = j.incomplete ? "held" : "locked";
          setSaveState(out);
          return out;
        }
        setSaveState("error");
        return "error";
      } catch {
        setSaveState("error");
        return "error";
      }
    },
    [token]
  );

  /* After a pause; never the moment the page opens, and never what was just saved. */
  useEffect(() => {
    if (JSON.stringify({ d, a: answers }) === lastSaved.current) return;
    const t = window.setTimeout(() => void save(dRef.current), 800);
    return () => window.clearTimeout(t);
  }, [d, answers, save]);

  /* A failed save is tried again (9 Oct 2026, a phone that lost signal on the last page). */
  useEffect(() => {
    if (saveState !== "error") return;
    const retry = () => void save(dRef.current);
    const t = window.setInterval(retry, 10_000);
    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", retry);
    };
  }, [saveState, save]);

  /* "They opened it" (Admin > Tracking), once per load from the tenant's own browser. */
  useEffect(() => {
    if (!token) return;
    void fetch(`/api/tenant/passport/opened?token=${encodeURIComponent(token)}`, { method: "POST", keepalive: true }).catch(() => {});
  }, [token]);

  /* ── The answers that are asked in pieces ───────────────────────────── */

  const onDob = (part: keyof Boxes, v: string) => {
    const nb = { ...dob, [part]: v };
    setDob(nb);
    set("dob", dobIso(nb));
  };
  const onMoved = (part: "mm" | "yyyy", v: string) => {
    const nb = { ...moved, [part]: v };
    setMoved(nb);
    const ym = movedIso(nb);
    const months = monthsSince(ym);
    if (ym && months !== null) {
      patch({ movedIn: ym, livedThreeYears: months >= 36 });
      setUi({ howlong: howLongFor(months) });
    } else if (d.movedIn) {
      set("movedIn", "");
    }
  };
  /* The chip says how long; the month and year say when. A chip that
     disagrees with the month typed clears the month, so it is asked again. */
  const onHowLong = (v: string) => {
    setUi({ howlong: v });
    const months = monthsSince(d.movedIn);
    const clash = months !== null && howLongFor(months) !== v;
    patch({ livedThreeYears: v === "Over 3 years", ...(clash ? { movedIn: "" } : {}) });
    if (clash) setMoved({ mm: "", yyyy: "" });
  };

  /* ── Moving through it ──────────────────────────────────────────────── */

  const top = () => window.scrollTo({ top: 0 });
  const focusFirst = (key: string) => {
    window.requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLElement>(`[data-q="${key}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const inp = el.querySelector<HTMLElement>("input:not([type=hidden]):not(.sr), textarea, button");
      if (inp) window.setTimeout(() => inp.focus({ preventScroll: true }), 300);
    });
  };
  const stampIt = (k: number) => {
    setFresh((f) => ({ k, n: (f?.n ?? 0) + 1 }));
    setPop(k);
    window.setTimeout(() => setPop(null), 600);
  };

  async function sign(isFresh: boolean) {
    setBusy(true);
    setFormErr("");
    /* Adults counts 1 on the stepper before anybody touches it; written down so the server agrees. */
    const final: PassportData = { ...dRef.current, numAdults: dRef.current.numAdults.trim() || "1" };
    const c: Ctx = { ...ctx, d: final };
    const open = steps.findIndex((s, i) => i < last && !stepOk(s.id, c));
    if (open !== -1) {
      setBusy(false);
      setStep(open);
      setEditing(true);
      setGot(null);
      const m = missing(steps[open].id, c);
      setErr(m);
      top();
      if (m[0]) window.setTimeout(() => focusFirst(m[0]), 50);
      return;
    }
    setD(final);
    const saved = await save(final);
    if (saved !== "ok") {
      setBusy(false);
      setFormErr(
        saved === "locked" ? "Your passport is already finished. Sign in to your tenant area to change it."
        : saved === "held" ? "Something is still missing. Check each step is filled in and press Sign again."
        : "That didn’t save. Check your signal and press Sign again."
      );
      return;
    }
    if (!submitted) {
      /* Finished on the server, which refuses one with an answer missing. */
      const r = await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}&submit=1`, { method: "POST" }).catch(() => null);
      if (!r || !r.ok) {
        const j = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : {};
        setBusy(false);
        setFormErr(j.error || "That didn’t go through. Check your signal and press Sign again.");
        return;
      }
      setSubmitted(true);
    }
    setBusy(false);
    setPassed((p) => (p.includes(last) ? p : [...p, last]));
    setAt("end");
    setGot(null);
    top();
    if (isFresh) stampIt(last);
  }

  function next() {
    if (busy) return;
    const id = steps[step].id;
    const m = missing(id, ctx);
    if (m.length) {
      setErr(m);
      focusFirst(m[0]);
      return;
    }
    setErr([]);
    setFormErr("");
    if (id === "move" && (!d.numAdults.trim() || !d.numChildren.trim())) {
      patch({ numAdults: d.numAdults.trim() || "1", numChildren: d.numChildren.trim() || "0" });
    }
    const was = step;
    const isFresh = !passed.includes(was);
    /* The last page is only passed once the server has it (sign). */
    if (was === last) {
      void sign(isFresh);
      return;
    }
    const nowPassed = isFresh ? [...passed, was] : passed;
    if (isFresh) setPassed(nowPassed);
    let to = steps.every((_, i) => i === last || nowPassed.includes(i)) ? last : Math.min(last, was + 1);
    if (editing) {
      to = last;
      setEditing(false);
    }
    setStep(to);
    setGot(isFresh && was > 0 ? was : null);
    if (isFresh && was > 0) stampIt(was);
    top();
  }

  const goBack = () => {
    setErr([]);
    setFormErr("");
    setGot(null);
    setStep((s) => Math.max(0, s - 1));
    top();
  };
  const goto = (k: number) => {
    setErr([]);
    setFormErr("");
    setGot(null);
    setEditing(true);
    setStep(k);
    setAt("steps");
    top();
  };
  const start = () => {
    setAt("steps");
    setStep(back ? firstOpen(ctx) : 0);
    setGot(null);
    top();
  };
  async function later() {
    const r = await save(dRef.current);
    setAt("start");
    setErr([]);
    setGot(null);
    setLaterNote(r === "ok" ? "Saved. Come back any time" : r === "error" ? "Not saved yet, check your signal" : "");
    window.setTimeout(() => setLaterNote(""), 2200);
    top();
  }

  /* Enter on a box moves on, as Continue does. The address box and the house number deal with their own. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && at === "steps" && t.tagName === "INPUT" && t.classList.contains("in")) {
      e.preventDefault();
      next();
    }
  };

  /* ── The account, on the last screen ────────────────────────────────── */

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctErr, setAcctErr] = useState("");
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const pwOk = pw.length >= 8 && pw === pw2;

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setAcctErr("Your password needs at least 8 characters.");
    if (pw !== pw2) return setAcctErr("The two passwords don’t match.");
    setAcctErr("");
    setAcctBusy(true);
    try {
      const r = await fetch("/api/tenant/passport/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: pw, data: dRef.current }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; verify?: boolean; email?: string };
      if (!j.ok) {
        setAcctErr(j.error ?? "That didn’t work. Try again in a moment.");
        setAcctBusy(false);
        return;
      }
      /* An address we did not send this link to is proved first, by the link we have just emailed it. */
      if (j.verify) {
        setLinkSentTo(j.email ?? "your email address");
        setAcctBusy(false);
        return;
      }
      window.location.assign("/tenant?welcome=1");
    } catch {
      setAcctErr("Something went wrong. Try again in a moment.");
      setAcctBusy(false);
    }
  }

  /* ── Drawing it ─────────────────────────────────────────────────────── */

  const s = steps[step];
  const slots = steps.length - 1;
  const fine =
    saveState === "error" ? (
      <p className="fine bad" role="status"><Ic k="alert" />Not saved yet - check your signal, we’ll keep trying.</p>
    ) : saveState === "locked" ? (
      <p className="fine bad" role="status"><Ic k="lock" />Your passport is finished. <Link href="/tenant/sign-in">Sign in</Link> to your tenant area to change it.</p>
    ) : saveState === "held" ? (
      <p className="fine" role="status"><Ic k="lock" />Your passport is finished, so a change saves once every question is answered.</p>
    ) : (
      <p className="fine"><Ic k="lock" />Nothing is shared with a landlord unless you apply for their home.</p>
    );

  let content: React.ReactNode;
  let actions: React.ReactNode;
  let foot: React.ReactNode = null;

  if (at === "start") {
    content = (
      <>
        <h1>
          {back ? <>Welcome back{firstName ? `, ${firstName}` : ""}. <span>Let’s carry on.</span></> : <>Your tenant <span>passport.</span></>}
        </h1>
        <p className="lede">
          {back ? `You’re ${pct}% of the way there. Everything you filled in is saved.` : "Fill it in once and you can book viewings straight away. Your application is half done before you start it."}
        </p>
        <ul className="points">
          {home && <li><Ic k="home" /><span><b>{shortAddress(home)}.</b> The home you asked about, and any other of ours you like.</span></li>}
          <li><Ic k="clock" /><span><b>About ten minutes.</b> {steps.length === 7 ? "Seven" : "Six"} short steps, saved as you go.</span></li>
          <li><Ic k="lock" /><span><b>Private.</b> Nothing is shared with a landlord unless you apply for their home.</span></li>
        </ul>
      </>
    );
    actions = (
      <div className="actions">
        <button type="button" className="btn primary" onClick={start}>{back ? "Carry on" : "Start"} <Ic k="arrow" /></button>
      </div>
    );
    foot = (
      <p className="fine"><Ic k="lock" />Kept securely by The Letting Experts · <a href="https://thelettingexperts.co.uk/privacy-policy" target="_blank" rel="noreferrer">Privacy and your data</a></p>
    );
  } else if (at === "steps") {
    content = (
      <>
        <div className="meta">
          <span>Step {step + 1} of {steps.length} · {s.name}</span>
          {got !== null && steps[got]?.stamp && <span className="got"><Ic k="check" sw={2.2} />{steps[got].stamp!.label} stamp added</span>}
        </div>
        <h1>{s.lead} <span>{s.faint}</span></h1>
        <p className="lede">{s.lede}</p>
        <div className="qs">
          <StepBody
            id={s.id}
            d={d}
            set={set}
            patch={patch}
            rules={rules}
            err={err}
            token={token}
            ui={ui}
            setUi={setUi}
            dob={dob}
            onDob={onDob}
            moved={moved}
            onMoved={onMoved}
            onHowLong={onHowLong}
            questions={questions}
            answers={answers}
            setAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
            agentName={agentName}
            steps={steps}
            ctx={ctx}
            goto={goto}
            next={next}
          />
        </div>
        {formErr && <p className="formerr" role="alert">{formErr}</p>}
      </>
    );
    actions = (
      <div className="actions">
        {step > 0 && <button type="button" className="btn link" onClick={goBack}><Ic k="back" />Back</button>}
        <button type="button" className="btn primary" onClick={next} disabled={busy}>
          {step === last ? (busy ? "Signing…" : "Sign") : "Continue"} <Ic k="arrow" />
        </button>
      </div>
    );
    foot = fine;
  } else {
    content = (
      <>
        <h1>You’re cleared <span>to view{firstName ? `, ${firstName}` : ""}.</span></h1>
        <p className="lede">Your passport is with your agent now, so they can book you in.</p>
        <ul className="points n">
          <li><i>1</i><span><b>We’ll be in touch about viewings,</b> usually the same working day.</span></li>
          <li><i>2</i><span><b>Like a home?</b> Your passport fills in most of the application.</span></li>
          <li><i>3</i><span><b>Things change?</b> Update it any time from your tenant area.</span></li>
        </ul>
      </>
    );
    actions = accountExists ? (
      <div className="actions">
        <button type="button" className="btn link" onClick={() => goto(last)}>Change something</button>
        <Link href="/tenant" className="btn primary">Open my tenant area <Ic k="arrow" /></Link>
      </div>
    ) : (
      <form className="acct" onSubmit={createAccount}>
        <h2>Now Choose a Password</h2>
        <p>Your tenant area opens with everything already filled in.</p>
        <div className="q">
          <label htmlFor="f-user">Your username</label>
          <p className="help">The email on your passport.</p>
          <input className="in" id="f-user" readOnly value={d.email.trim() || "Add your email in Getting in touch"} />
        </div>
        <div className="q">
          <label htmlFor="f-pw">Choose a password</label>
          <div className="pwbox">
            <input className="in" id="f-pw" type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
          </div>
        </div>
        <div className="q">
          <label htmlFor="f-pw2">Type it again</label>
          <input className="in" id="f-pw2" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <ul className="ticks">
          <li className={pw.length >= 8 ? "ok" : ""}><Ic k="check" sw={2.4} />At least 8 characters</li>
          <li className={pw && pw === pw2 ? "ok" : ""}><Ic k="check" sw={2.4} />Both the same</li>
        </ul>
        {acctErr && <p className="formerr" role="alert">{acctErr}</p>}
        {linkSentTo && <p className="status" role="status">Your passport is saved. We’ve emailed a sign-in link to {linkSentTo}. Open it to finish and go straight in.</p>}
        <div className="actions">
          <button type="button" className="btn link" onClick={() => goto(last)}>Change something</button>
          <button type="submit" className="btn primary" disabled={acctBusy || !pwOk}>{acctBusy ? "Opening your account…" : "Create my account"} <Ic k="arrow" /></button>
        </div>
      </form>
    );
  }

  return (
    <div ref={root} className={`tpx${at !== "start" ? " steps-on" : ""}${at !== "steps" ? " short" : ""}`} onKeyDown={onKeyDown}>
      <header className="top">
        <div className="top-in">
          <span className="brand"><Mark /><b>The Letting Experts</b></span>
          {at !== "start" && (
            <span className="stampdots" role="img" aria-label={`${stamped.length} of ${slots} stamps`}>
              <span>{stamped.length} of {slots} stamps</span>
              {steps.slice(1).map((st, i) => (
                <i key={st.id} title={st.stamp?.label} className={`${stamped.includes(i + 1) ? "on" : ""}${pop === i + 1 ? " pop" : ""}`} />
              ))}
            </span>
          )}
          <span style={{ marginLeft: "auto" }} />
          {at !== "end" && (
            <button type="button" className="later" onClick={() => void later()} aria-live="polite">{laterNote || "Finish later"}</button>
          )}
        </div>
        {at !== "start" && (
          <div className="rail" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-hidden="true">
            {steps.map((st, k) => (
              <i key={st.id} className={at === "end" || (passed.includes(k) && k !== step) ? "done" : k === step ? "now" : ""} />
            ))}
          </div>
        )}
      </header>
      <div className="wrap">
        <Passport d={d} pct={pct} steps={steps} stamped={stamped} cleared={at === "end"} fresh={fresh} home={home} />
        <div className="form">
          <div key={`${at}-${step}`} className="fade">{content}</div>
          {actions}
          {foot}
        </div>
      </div>
    </div>
  );
}
