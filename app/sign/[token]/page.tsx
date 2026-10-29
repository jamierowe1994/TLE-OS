"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import TermsPaper, { Blank, type PaperPerson } from "@/components/terms/TermsPaper";
import type { DetailField, LandlordDetails, TermsDoc, TermsValues } from "@/lib/terms/types";

/**
 * SIGN YOUR TERMS: the page a landlord opens from their email (James's design,
 * landlord-sign.html, 24 Oct 2026).
 *
 * James: "This is just quite a nice little process where they'll click into
 * this and they can sign their terms of business... If there's anything that
 * you've noticed that isn't included, then build it using the same style and
 * choices."
 *
 * Our real contract on the left (components/terms/TermsPaper), and "Three
 * things for you" on the right: check your details, choose when we start, sign.
 * On a phone the rail goes and a bar at the foot carries the current step. The
 * signature is drawn or typed here, made into a PNG, and only goes anywhere on
 * "Finish and sign": the server hands it to DocuSeal, which seals it with the
 * agent's half (lib/terms/flow landlordSign). The sealing moment waits on that
 * request; it never ticks anything the server hasn't confirmed.
 *
 * Also here, in the same style: the link not recognised, terms withdrawn, the
 * agent not finished yet, and already signed (straight to the done screen with
 * their ink). No account; the token in the link is theirs alone.
 */

type View = {
  ok: true;
  doc: TermsDoc;
  termsId: string;
  values: TermsValues;
  status: "agent" | "sent" | "signed" | "cancelled";
  agent: { name: string; email: string; phone: string; signedAt: string | null; signature: string | null };
  mine: { signature: string; startNow: boolean | null } | null;
  agentSigned: boolean;
  completedAt: string | null;
  hasCopy: boolean;
  me: { key: string; name: string; details: Partial<LandlordDetails>; signedAt: string | null };
  people: Array<{ key: string; name: string; signed: boolean; you: boolean }>;
  preview: boolean;
};

type Posted = { ok?: boolean; error?: string; done?: boolean } | null;

/* ── small things ────────────────────────────────────────────────────────── */

const PATHS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pen: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  down: "M12 4v12M7 11l5 5 5-5M4 20h16",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  chat: "M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18.6z",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
};

function Ic({ k, sw = 1.7 }: { k: keyof typeof PATHS; sw?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[k]} />
    </svg>
  );
}

const INK = "#141413";
const firstOf = (name: string) => name.trim().split(/\s+/)[0] || "there";
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "TLE";
const streetOf = (address: string) => address.split(",")[0]?.trim() || address;
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "24 October 2026", London's day. */
const londonLong = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** London's day plus n days, worked out on the calendar (not 24-hour steps), so a clock change can't move it. */
function londonPlus(days: number, from = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(from);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + days));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** A date detail ("2027-05-01") as the contract prints it. */
const ukDay = (iso: string) => {
  const t = new Date(`${iso}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(t.getTime()) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : iso;
};

const okFor = (f: DetailField, v: string) => {
  const t = v.trim();
  if (!t) return !f.required;
  if (f.kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  if (f.kind === "sortcode") return /^\d{2}-?\d{2}-?\d{2}$/.test(t.replace(/\s/g, ""));
  if (f.kind === "account") return /^\d{6,10}$/.test(t.replace(/\s/g, ""));
  return true;
};

/** The waiver block, if this edition has one: the "start during the cancellation period" choice. */
const waiverOf = (doc: TermsDoc) => {
  for (const s of doc.sections) for (const b of s.blocks) if (b.kind === "waiver") return b;
  return null;
};

/** The cancellation period, read from the contract's own words ("the 14-day cancellation period"), 14 if it doesn't say. */
const coolDays = (doc: TermsDoc) => {
  const w = waiverOf(doc);
  const m = w?.text.match(/(\d+)-day/);
  return m ? Number(m[1]) : 14;
};

/* Errors the server writes for the OS can name the systems behind it; a landlord never sees those names. */
const forLandlord = (e: string) => (/docuseal|rex\b/i.test(e) ? "Signing isn't available just now. Try again in a moment." : e);

/* ── the page ────────────────────────────────────────────────────────────── */

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<{ text: string; gone: boolean } | null>(null);

  /* The three things, held here until "Finish and sign". */
  const [edits, setEdits] = useState<Partial<LandlordDetails>>({});
  const [detailsOk, setDetailsOk] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsErr, setDetailsErr] = useState<string | null>(null);
  const [start, setStart] = useState<boolean | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const [sheet, setSheet] = useState<null | "sign" | "details">(null);
  /* Typed on a laptop, drawn on a phone (29 Oct 2026: two landlords took 6 and
     33 minutes over this page that morning; a signature drawn with a trackpad
     is the hard part). Draw stays one press away. */
  const [mode, setMode] = useState<"draw" | "type">("draw");
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) setMode("type");
  }, []);
  /* The sealing moment: which tick is spinning, or what went wrong. */
  const [seal, setSeal] = useState<{ stage: number; error: string | null; done: boolean | null } | null>(null);
  const [reread, setReread] = useState(false);

  const fetchView = useCallback(async (): Promise<View | { text: string; gone: boolean }> => {
    const r = await fetch(`/api/sign/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    if (!r) return { text: "This didn't open. Check your connection and try again.", gone: false };
    const j = await r.json().catch(() => null);
    if (j?.ok) return j as View;
    return { text: j?.error ?? "This didn't open. Try again in a moment.", gone: r.status === 404 };
  }, [token]);

  const load = useCallback(async () => {
    const v = await fetchView();
    if ("ok" in v) {
      setView(v);
      setProblem(null);
    } else setProblem(v);
  }, [fetchView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);

  const post = (body: object): Promise<Posted> =>
    fetch(`/api/sign/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => null);

  if (problem && !view) {
    return (
      <Calm
        icon="doc"
        title={problem.gone ? "This link isn't" : "This didn't"}
        tail={problem.gone ? "recognised." : "open."}
        text={problem.gone ? "Ask your agent to send it again. Each link only works for the person it was sent to." : problem.text}
        action={problem.gone ? null : <button type="button" className="btn primary" onClick={() => void load()}>Try again</button>}
      />
    );
  }
  if (!view) {
    return (
      <div className="tsl">
        <Top />
        <div className="loading" role="status"><span className="spin" aria-hidden />Opening your terms…</div>
      </div>
    );
  }

  const { doc, values } = view;
  const agentName = view.agent.name || values.agentName;
  const agentFirst = firstOf(agentName);
  const street = streetOf(values.propertyAddress);
  const ask = { name: agentName, email: view.agent.email, phone: view.agent.phone, street };

  if (view.status === "cancelled") {
    return (
      <Calm
        ask={ask}
        icon="doc"
        title="These terms were"
        tail="withdrawn."
        text={`${agentFirst} will send you a fresh set to sign. There's nothing more to do on this one.`}
      />
    );
  }
  if (!view.agentSigned) {
    return (
      <Calm
        ask={ask}
        icon="clock"
        title="Your terms aren't"
        tail="ready yet."
        text={`${agentFirst} is still finishing their part. You'll get an email the moment they're ready for you to sign.`}
      />
    );
  }

  const first = firstOf(view.me.name);
  const today = londonLong(new Date());
  const waiver = waiverOf(doc);
  const days = coolDays(doc);
  const others = view.people.filter((p) => !p.you);
  const othersLeft = others.filter((p) => !p.signed);
  const complete = view.status === "signed" || Boolean(view.completedAt);

  /* ── already signed: the done screen ── */
  if (view.me.signedAt && !seal) {
    const startNow = view.mine?.startNow ?? start;
    const email = String(view.me.details.email ?? "").trim();
    const signedOn = londonLong(new Date(view.me.signedAt));
    const allOn = view.completedAt ? londonLong(new Date(view.completedAt)) : signedOn;
    const waitDate = view.completedAt ? londonPlus(days, new Date(view.completedAt)) : null;
    const copyLink = complete && view.hasCopy ? `/api/sign/${encodeURIComponent(token)}/document` : null;
    return (
      <div className="tsl">
        <Top street={street} ask={ask} />
        <section className="view on">
          <div className="done">
            <svg className="done-tick" viewBox="0 0 84 84" aria-hidden>
              <circle cx="42" cy="42" r="42" />
              <path d="M26 43l11 11 22-23" />
            </svg>
            <h1>
              {complete ? "You're all signed," : "You've signed,"} <span>{first}.</span>
            </h1>
            <p>
              {complete
                ? copyLink
                  ? `Everyone has signed. Your copy is here to save, and on its way${email ? ` to ${email}` : " by email"}.`
                  : `Everyone has signed. A signed copy is on its way${email ? ` to ${email}` : " by email"}.`
                : `We're waiting for ${joinAnd(othersLeft.map((p) => p.name))} to sign. Your copy comes by email as soon as they have.`}
            </p>
            {view.mine?.signature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="done-ink" src={view.mine.signature} alt="Your signature" />
            )}
            <div className="copy">
              <span className="d"><Ic k="doc" /></span>
              <span>
                <b>Terms of Business</b>
                <span>
                  {complete ? `Signed by ${view.people.length > 1 ? "everyone" : "both of you"} · ${allOn}` : `Signed by you · ${signedOn}`}
                  {!copyLink && (complete ? `. A copy is on its way${email ? ` to ${email}` : ""}.` : `. Your copy follows once ${joinAnd(othersLeft.map((p) => firstOf(p.name)))} ${othersLeft.length > 1 ? "have" : "has"} signed.`)}
                </span>
              </span>
              {copyLink && (
                <a className="btn" href={copyLink} target="_blank" rel="noopener noreferrer">
                  <Ic k="down" />Save a copy
                </a>
              )}
            </div>
            <div className="nexts">
              <div>
                <i>1</i>
                <span>
                  {/* No choice on file (an edition without one, or signed before the choice was ours to keep): no promise about when. */}
                  {!waiver || startNow == null ? (
                    <><b>{agentFirst} will be in touch</b>To agree the next steps for your home.</>
                  ) : startNow ? (
                    <><b>{agentFirst} will be in touch this week</b>To book the photos and get your home on the market.</>
                  ) : (
                    <>
                      <b>{waitDate ? `We'll start on ${waitDate}` : `We'll start ${days} days after everyone has signed`}</b>
                      Once your {days} days are up. You can change your mind before then.
                    </>
                  )}
                </span>
              </div>
              <div>
                <i>2</i>
                <span><b>Send us your ID and proof of ownership</b>A photo on your phone is fine. You can do it from your landlord file.</span>
              </div>
              <div>
                <i>3</i>
                <span>
                  <b>Changed your mind?</b>
                  You can cancel within {days} days, with the form at the end of your copy.
                  {startNow ? " If we've already started, you pay for what's been done." : ""}
                </span>
              </div>
            </div>
            <a className="btn primary wide" href="/landlord"><Ic k="home" />Open your landlord file</a>
            <button type="button" className="btn ghost wide" style={{ marginTop: 6 }} onClick={() => setReread((r) => !r)}>
              {reread ? "Hide your terms" : "Read your terms again"}
            </button>
          </div>
          {reread && (
            <div className="reread">
              <TermsPaper
                doc={doc}
                values={values}
                reference={view.termsId}
                you="landlord"
                agent={{ signature: view.agent.signature, signedOn: view.agent.signedAt ? londonLong(new Date(view.agent.signedAt)) : null }}
                coolChoice={startNow}
                people={view.people.map((p) =>
                  p.you
                    ? { key: p.key, name: view.me.name, details: view.me.details, you: true, signature: view.mine?.signature ?? null, signedOn }
                    : { key: p.key, name: p.name, signedOn: p.signed ? "Signed" : null }
                )}
              />
            </div>
          )}
        </section>
      </div>
    );
  }

  /* ── read and sign ── */
  const fields = doc.details;
  const details: Partial<LandlordDetails> = { ...view.me.details, ...edits };
  /* Asked for from what is saved, so a box stays put while it's typed into. */
  const missing = fields.filter((f) => !okFor(f, String(view.me.details[f.key] ?? "")));
  const stillBad = missing.filter((f) => !okFor(f, String(details[f.key] ?? "")));
  const printed = doc.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === "landlords" ? b.fields : [])));
  const youSection = doc.sections.find((s) => s.blocks.some((b) => b.kind === "landlords"))?.title ?? "the agreement";
  const checkList = joinAnd(printed.map((k) => fields.find((f) => f.key === k)?.label.toLowerCase() ?? k));
  const hasReg = fields.some((f) => f.step === "registration");
  const myAnchor = `ts-sig-${view.me.key}`;

  const tasks = [
    { t: "Check your details", s: hasReg ? "Your name, contact details, address and registration" : "Your name, contact details and home address", done: detailsOk, at: "ts-you" },
    ...(waiver ? [{ t: "Choose when we start", s: `Straight away, or after the ${days} days`, done: start != null, at: "ts-cool" }] : []),
    { t: "Sign", s: `As ${view.me.name}, dated today`, done: Boolean(sig), at: myAnchor },
  ];
  const k = tasks.findIndex((t) => !t.done);
  const doneCount = tasks.filter((t) => t.done).length;
  const step = k === -1 ? "finish" : tasks[k].at === "ts-you" ? "details" : tasks[k].at === "ts-cool" ? "cool" : "sign";
  const words = ["", "One", "Two", "Three"][tasks.length] ?? String(tasks.length);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const wrongHref = view.agent.email
    ? `mailto:${view.agent.email}?subject=${encodeURIComponent(`My details on the terms for ${street}`)}&body=${encodeURIComponent(`Hi ${agentFirst},\n\nSomething in my details on the Terms of Business isn't right:\n\n`)}`
    : view.agent.phone
      ? `tel:${view.agent.phone.replace(/\s/g, "")}`
      : null;

  async function confirmDetails() {
    if (!view || savingDetails) return;
    if (stillBad.length) {
      setDetailsErr(`${stillBad[0].label} is needed before you sign.`);
      if (sheet !== "details" && window.matchMedia("(max-width: 999px)").matches) setSheet("details");
      return;
    }
    const all = Object.fromEntries(fields.map((f) => [f.key, String(details[f.key] ?? "").trim()])) as Partial<LandlordDetails>;
    const changed = fields.some((f) => all[f.key] !== String(view.me.details[f.key] ?? "").trim());
    /* Saved only when something was added or changed: every save rewrites their boxes on the contract. */
    if (changed) {
      setSavingDetails(true);
      setDetailsErr(null);
      const j = await post({ action: "details", details: all });
      setSavingDetails(false);
      if (!j?.ok) return setDetailsErr(forLandlord(j?.error ?? "That didn't save. Try again in a moment."));
      setView((v) => (v ? { ...v, me: { ...v.me, details: { ...v.me.details, ...all }, name: all.name || v.me.name } } : v));
      setEdits({});
    }
    setDetailsErr(null);
    setDetailsOk(true);
    setSheet(null);
    setTimeout(() => jump(waiver && start == null ? "ts-cool" : myAnchor), 120);
  }

  function choose(v: boolean) {
    setStart(v);
    if (!sig) setTimeout(() => jump(myAnchor), 150);
  }

  function adopt(png: string) {
    setSig(png);
    setSheet(null);
    setTimeout(() => jump(myAnchor), 150);
  }

  async function finish() {
    if (!view || !sig || (seal && !seal.error)) return;
    const predicted = othersLeft.length === 0;
    setSeal({ stage: 0, error: null, done: predicted });
    const began = Date.now();
    const j = await post({ action: "sign", signature: sig, startNow: waiver ? start : null });
    let done = Boolean(j?.done);
    if (!j?.ok) {
      /* A reply that never arrived can still have signed them: ask before saying it failed. */
      const v = await fetchView();
      if (!("ok" in v) || !v.me.signedAt) {
        setSeal({ stage: 0, error: forLandlord(j?.error ?? "Your signature didn't reach us. Check your connection and try again."), done: predicted });
        return;
      }
      done = v.status === "signed";
    }
    /* Each tick turns only once the server has said so; the pauses are only so it can be read. */
    await wait(Math.max(0, 800 - (Date.now() - began)));
    setSeal({ stage: 1, error: null, done });
    await wait(750);
    setSeal({ stage: 2, error: null, done });
    const fresh = await fetchView();
    await wait(900);
    setSeal({ stage: 3, error: null, done });
    await wait(700);
    if ("ok" in fresh) setView(fresh);
    setSeal(null);
    window.scrollTo(0, 0);
  }

  const detail = (_p: PaperPerson, key: keyof LandlordDetails, value: string) => {
    const f = fields.find((x) => x.key === key);
    if (!value || (f && !okFor(f, value))) return <Blank>{f && !f.required ? "Not given" : "Add this before you sign"}</Blank>;
    const shown = key === "accountNumber" ? `•••• ${value.slice(-4)}` : f?.kind === "date" ? ukDay(value) : value;
    return (
      <span className={`fld${detailsOk ? "" : " check"}`}>
        {shown}
        {detailsOk && <span className="chk"><Ic k="check" sw={2.6} />Checked</span>}
      </span>
    );
  };

  const isLast = othersLeft.length === 0;
  const coolSlot = waiver ? (
    <div className="cools">
      <button type="button" className={start === true ? "on" : ""} aria-pressed={start === true} onClick={() => choose(true)}>
        <span>
          <b>Yes, start straight away</b>
          <span>We can book photos and start marketing this week. If you cancel after we&apos;ve started, you pay for what&apos;s been done.</span>
        </span>
      </button>
      <button type="button" className={start === false ? "on" : ""} aria-pressed={start === false} onClick={() => choose(false)}>
        <span>
          <b>No, wait until the cancellation period is over</b>
          <span>
            {isLast
              ? `We'll start when your ${days} days to change your mind end, on ${londonPlus(days)}.`
              : `We'll start when your ${days} days to change your mind end, counted from when everyone has signed.`}
          </span>
        </span>
      </button>
    </div>
  ) : undefined;

  const people: PaperPerson[] = view.people.map((p) =>
    p.you
      ? { key: p.key, name: view.me.name, details, you: true, signature: sig, signedOn: sig ? today : null }
      : { key: p.key, name: p.name, signedOn: p.signed ? "Signed" : null }
  );

  const signBtn = (
    <button type="button" className="btn primary wide" onClick={() => setSheet("sign")}>
      <Ic k="pen" />Sign
    </button>
  );
  const finishBtn = (
    <button type="button" className="btn primary wide" onClick={() => void finish()}>
      <Ic k="check" sw={2.2} />Finish and sign
    </button>
  );
  const okBtn = (
    <button type="button" className="btn primary wide" disabled={savingDetails} onClick={() => void confirmDetails()}>
      {savingDetails ? "Saving…" : "Yes, they're right"}
    </button>
  );

  return (
    <div className="tsl">
      <Top street={street} ask={ask} progress={doneCount / tasks.length} />
      <section className="view on">
        <div className="layout">
          <div>
            <div className="hello">
              <span className="av">{initials(agentName)}</span>
              <span>
                <b>{agentFirst} has signed. Your turn, {first}.</b>
                <span>Read it through, then {words.toLowerCase()} quick things. About 3 minutes.</span>
                {others.length > 0 && (
                  <span className="also">
                    {others.map((p) => (
                      <span key={p.key} className={`pill${p.signed ? " ok" : ""}`}>
                        {p.signed && <Ic k="check" sw={2.6} />}
                        {p.name} {p.signed ? "has signed" : "still to sign"}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {view.agent.signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sigmini" src={view.agent.signature} alt="" />
              )}
            </div>
            <TermsPaper
              doc={doc}
              values={values}
              reference={view.termsId}
              people={people}
              agent={{ signature: view.agent.signature, signedOn: view.agent.signedAt ? londonLong(new Date(view.agent.signedAt)) : null }}
              you="landlord"
              detail={detail}
              coolSlot={coolSlot}
              coolChoice={start}
              signSlot={
                <button type="button" className="tap" onClick={() => setSheet("sign")}>
                  <Ic k="pen" />Tap to sign here
                </button>
              }
            />
          </div>

          <aside className="rail">
            <h3>{words} things <span>for you.</span></h3>
            <p>Everything else is already filled in.</p>
            <ul className="todo">
              {tasks.map((t, j) => (
                <li
                  key={t.at}
                  className={t.done ? "ok" : j === k ? "on" : ""}
                  role="button"
                  tabIndex={0}
                  onClick={() => jump(t.at)}
                  onKeyDown={(e) => e.key === "Enter" && jump(t.at)}
                >
                  <i>{t.done ? <Ic k="check" sw={3} /> : j + 1}</i>
                  <span><b>{t.t}</b><span>{t.s}</span></span>
                </li>
              ))}
            </ul>
            {step === "details" && (
              <>
                <p style={{ fontSize: 13.5, margin: "0 0 12px" }}>
                  {missing.length ? `A few details first, then check the rest in ${youSection}.` : `Your ${checkList} in ${youSection} look right?`}
                </p>
                {missing.length > 0 && <DetailInputs fields={missing} values={details} onChange={(key, v) => setEdits((d) => ({ ...d, [key]: v }))} />}
                {okBtn}
                {wrongHref && <a className="btn ghost wide" href={wrongHref} style={{ marginTop: 6 }}>Something&apos;s not right</a>}
                {detailsErr && <p className="err" role="alert">{detailsErr}</p>}
              </>
            )}
            {step === "cool" && (
              <button type="button" className="btn primary wide" onClick={() => jump("ts-cool")}>
                Choose <Ic k="arrow" />
              </button>
            )}
            {step === "sign" && signBtn}
            {step === "finish" && (
              <>
                {finishBtn}
                <button type="button" className="btn ghost wide" style={{ marginTop: 6 }} onClick={() => setSheet("sign")}>Change my signature</button>
              </>
            )}
            <p className="meta"><Ic k="lock" />Signed securely. You&apos;ll get a copy by email.</p>
          </aside>
        </div>

        <div className="bar">
          <div className="lab">
            <span>
              <b>
                {step === "finish" ? "All done. Ready to finish." : step === "details" ? (missing.length ? "A few details first" : "Are your details right?") : step === "cool" ? "When should we start?" : "Last thing: your signature"}
              </b>
            </span>
            <span>{doneCount} of {tasks.length}</span>
          </div>
          <div className="row">
            {step === "details" && wrongHref && <a className="btn ghost" href={wrongHref}>Not right</a>}
            {step === "details" &&
              (missing.length ? (
                <button type="button" className="btn primary wide" onClick={() => setSheet("details")}>Add your details <Ic k="arrow" /></button>
              ) : (
                okBtn
              ))}
            {step === "cool" && (
              <button type="button" className="btn primary wide" onClick={() => jump("ts-cool")}>Choose <Ic k="arrow" /></button>
            )}
            {step === "sign" && signBtn}
            {step === "finish" && (
              <>
                <button type="button" className="btn ghost" onClick={() => setSheet("sign")}>Sign again</button>
                {finishBtn}
              </>
            )}
          </div>
          {step === "details" && detailsErr && !sheet && <p className="err" role="alert">{detailsErr}</p>}
        </div>
      </section>

      <Sheet open={sheet === "details"} onClose={() => setSheet(null)} label="ts-details-t">
        <h3 id="ts-details-t">Your details</h3>
        <p className="who">So the contract is in your name and we can reach you.</p>
        <DetailInputs fields={missing} values={details} onChange={(key, v) => setEdits((d) => ({ ...d, [key]: v }))} />
        {detailsErr && <p className="err" role="alert" style={{ margin: "0 0 12px" }}>{detailsErr}</p>}
        <button type="button" className="btn primary wide" disabled={savingDetails} onClick={() => void confirmDetails()}>
          {savingDetails ? "Saving…" : "Save, and they're right"}
        </button>
        {wrongHref && <a className="btn ghost wide" href={wrongHref} style={{ marginTop: 6 }}>Something&apos;s not right</a>}
      </Sheet>

      <SignSheet open={sheet === "sign"} name={view.me.name} today={today} mode={mode} setMode={setMode} onAdopt={adopt} onClose={() => setSheet(null)} />

      <Seal
        state={seal}
        agentFirst={agentFirst}
        email={String(details.email ?? "").trim()}
        waitingOn={othersLeft.map((p) => firstOf(p.name))}
        preview={view.preview}
        onRetry={() => void finish()}
        onBack={() => setSeal(null)}
      />
    </div>
  );
}

/* ── the top bar, and the Ask menu in it ─────────────────────────────────── */

type Ask = { name: string; email: string; phone: string; street: string };

function Top({ street, ask, progress }: { street?: string; ask?: Ask; progress?: number }) {
  return (
    <header className="top">
      <div className="top-in">
        <span className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/tle-logo-line.png" alt="The Letting Experts" />
        </span>
        {street && <span className="doc-t">Terms of Business · {street}</span>}
        {ask && (ask.email || ask.phone) && <AskAgent ask={ask} />}
      </div>
      {progress != null && <div className="prog"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
    </header>
  );
}

function AskAgent({ ask }: { ask: Ask }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const first = firstOf(ask.name);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const mail = `mailto:${ask.email}?subject=${encodeURIComponent(`A question about my terms for ${ask.street}`)}&body=${encodeURIComponent(`Hi ${first},\n\n`)}`;
  return (
    <span className="ask-w" ref={ref}>
      <button type="button" className="ask" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <span className="av">{initials(ask.name)}</span>
        <span className="t">Ask {first}</span>
      </button>
      {open && (
        <span className="ask-menu" role="menu">
          {ask.email && (
            <a href={mail} role="menuitem" onClick={() => setOpen(false)}>
              <Ic k="mail" />
              <span>Email {first}<span>{ask.email}</span></span>
            </a>
          )}
          {ask.phone && (
            <a href={`tel:${ask.phone.replace(/\s/g, "")}`} role="menuitem" onClick={() => setOpen(false)}>
              <Ic k="phone" />
              <span>Call {first}<span>{ask.phone}</span></span>
            </a>
          )}
        </span>
      )}
    </span>
  );
}

/* ── a calm page: not recognised, withdrawn, not ready yet ───────────────── */

function Calm({ icon, title, tail, text, ask, action }: { icon: keyof typeof PATHS; title: string; tail: string; text: string; ask?: Ask; action?: React.ReactNode }) {
  const first = ask ? firstOf(ask.name) : "";
  return (
    <div className="tsl">
      <Top street={ask?.street} ask={ask} />
      <section className="view on">
        <div className="done">
          <span className="calm-ic"><Ic k={icon} sw={1.5} /></span>
          <h1>{title} <span>{tail}</span></h1>
          <p>{text}</p>
          {action}
          {!action && ask?.email && (
            <a className="btn primary" href={`mailto:${ask.email}?subject=${encodeURIComponent(`My terms for ${ask.street}`)}`}>
              <Ic k="chat" />Message {first}
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── details they're asked for ───────────────────────────────────────────── */

function DetailInputs({ fields, values, onChange }: { fields: DetailField[]; values: Partial<LandlordDetails>; onChange: (key: keyof LandlordDetails, v: string) => void }) {
  return (
    <>
      {fields.map((f) => {
        const v = String(values[f.key] ?? "");
        const bad = v.trim() !== "" && !okFor(f, v);
        return (
          <label key={f.key} className="inp">
            <span>{f.label}{f.required ? "" : " (optional)"}</span>
            <input
              type={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : f.kind === "date" ? "date" : "text"}
              inputMode={f.kind === "sortcode" || f.kind === "account" ? "numeric" : undefined}
              value={v}
              onChange={(e) => onChange(f.key, e.target.value)}
              autoComplete={f.key === "email" ? "email" : f.key === "phone" ? "tel" : f.key === "name" ? "name" : f.key === "address" ? "street-address" : "off"}
            />
            {bad ? (
              <small className="bad">{f.kind === "sortcode" ? "Six numbers, like 12-34-56." : f.kind === "account" ? "Your account number is usually eight numbers." : "That doesn't look right."}</small>
            ) : f.hint ? (
              <small>{f.hint}</small>
            ) : null}
          </label>
        );
      })}
    </>
  );
}

/* ── the bottom sheet ────────────────────────────────────────────────────── */

function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  return (
    <div className={`sheet${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="scrim" onClick={onClose} />
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby={label}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

/**
 * The signature sheet (the design's openSheet and mountPad). Draw: a canvas
 * pad, pointer events (mouse, finger and pen alike), the ink cropped to what
 * was drawn so it sits well in their box. Type: their name set in the hand
 * (Caveat, --font-hand) on an offscreen canvas. Either way a PNG data URL,
 * which is all the server accepts.
 */
function SignSheet({ open, name, today, mode, setMode, onAdopt, onClose }: {
  open: boolean;
  name: string;
  today: string;
  mode: "draw" | "type";
  setMode: (m: "draw" | "type") => void;
  onAdopt: (png: string) => void;
  onClose: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const padEl = useRef<HTMLDivElement>(null);
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  const last = useRef<[number, number] | null>(null);
  const box = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [inked, setInked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* A finger on a phone, a mouse or trackpad on a laptop: the hint says which. */
  const [touch, setTouch] = useState(true);
  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);

  const mount = useCallback(() => {
    const c = cv.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const x = c.getContext("2d");
    if (!x) return;
    x.scale(dpr, dpr);
    x.lineWidth = 2.6;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.strokeStyle = INK;
    x.fillStyle = INK;
    ctx.current = x;
    box.current = null;
    last.current = null;
    setInked(false);
  }, []);

  /* Sized once the sheet is open, so the canvas matches the box it's drawn in. */
  useEffect(() => {
    if (!open || mode !== "draw") return;
    setErr(null);
    const id = requestAnimationFrame(mount);
    return () => cancelAnimationFrame(id);
  }, [open, mode, mount]);

  const pt = (e: { clientX: number; clientY: number }): [number, number] => {
    const b = cv.current!.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  const grow = ([x, y]: [number, number]) => {
    const b = box.current;
    box.current = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ctx.current) return;
    e.preventDefault();
    cv.current?.setPointerCapture(e.pointerId);
    const p = pt(e);
    last.current = p;
    ctx.current.beginPath();
    ctx.current.arc(p[0], p[1], 1.3, 0, Math.PI * 2);
    ctx.current.fill();
    grow(p);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const x = ctx.current;
    if (!x || !last.current) return;
    /* Every point the browser saw since the last frame, so a quick flourish stays smooth. */
    const evs = (e.nativeEvent.getCoalescedEvents?.() ?? []) as PointerEvent[];
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const p = pt(ev);
      x.beginPath();
      x.moveTo(...last.current);
      x.lineTo(...p);
      x.stroke();
      last.current = p;
      grow(p);
    }
    if (!inked) {
      setInked(true);
      setErr(null);
    }
  }
  const up = () => (last.current = null);

  function clear() {
    mount();
  }

  /** The drawn ink, cropped to what was drawn (with a margin), at most 240px tall: plenty for the page and the sealed copy, far under the server's limit. */
  function drawnPng(): string | null {
    const c = cv.current;
    const b = box.current;
    if (!c || !b) return null;
    const scale = c.width / c.getBoundingClientRect().width;
    const m = 12;
    const cy = (b.y0 + b.y1) / 2;
    const half = Math.max((b.y1 - b.y0) / 2 + m, 34);
    const sx = Math.max(0, (b.x0 - m) * scale);
    const sy = Math.max(0, (cy - half) * scale);
    const sw = Math.min(c.width - sx, (b.x1 - b.x0 + m * 2) * scale);
    const sh = Math.min(c.height - sy, half * 2 * scale);
    const k = Math.min(1, 240 / sh);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(sw * k));
    out.height = Math.max(1, Math.round(sh * k));
    out.getContext("2d")?.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  /** Their name in the hand, as a PNG. The font is waited for, or the canvas would draw the fallback. */
  async function typedPng(): Promise<string | null> {
    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim() || "cursive";
    const font = `500 96px ${fam}`;
    await document.fonts.load(font, name).catch(() => null);
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return null;
    probe.font = font;
    const out = document.createElement("canvas");
    out.width = Math.ceil(probe.measureText(name).width) + 40;
    out.height = 140;
    const x = out.getContext("2d");
    if (!x) return null;
    x.font = font;
    x.fillStyle = INK;
    x.fillText(name, 20, 100);
    return out.toDataURL("image/png");
  }

  async function sign() {
    if (busy) return;
    setErr(null);
    if (mode === "draw") {
      if (!inked) {
        padEl.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], 300);
        /* Said, not only shaken: a shake alone left people pressing Sign again. */
        setErr("Draw your signature in the box first, or choose Type to sign with your name.");
        return;
      }
      const png = drawnPng();
      if (png) onAdopt(png);
      return;
    }
    setBusy(true);
    const png = await typedPng().catch(() => null);
    setBusy(false);
    if (png) onAdopt(png);
    else setErr("That didn't work on this device. Try drawing it instead.");
  }

  return (
    <Sheet open={open} onClose={onClose} label="ts-sheet-t">
      <h3 id="ts-sheet-t">Your signature</h3>
      <p className="who">Signing as <b>{name}</b> · {today}</p>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "draw"} className={mode === "draw" ? "on" : ""} onClick={() => { setErr(null); setMode("draw"); }}>Draw</button>
        <button type="button" role="tab" aria-selected={mode === "type"} className={mode === "type" ? "on" : ""} onClick={() => { setErr(null); setMode("type"); }}>Type</button>
      </div>
      {mode === "draw" ? (
        <div className={`pad${inked ? " has" : ""}`} ref={padEl}>
          <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Signature pad" />
          <span className="base" />
          <span className="x">×</span>
          <span className="hint">{touch ? "Sign with your finger" : "Draw your signature with your mouse or trackpad"}</span>
          <button type="button" className="clr" onClick={clear}>Clear</button>
        </div>
      ) : (
        <div className="typed" style={{ fontSize: name.length > 22 ? 36 : 52, padding: "0 16px", textAlign: "center", overflow: "hidden" }}>{name}</div>
      )}
      <p className="legal">By signing, you agree to these Terms of Business with The Letting Experts. Your name, the date and time are added to the signed copy.</p>
      {err && <p className="err" role="alert" style={{ margin: "0 0 12px" }}>{err}</p>}
      <button type="button" className="btn primary wide" disabled={busy} onClick={() => void sign()}>
        <Ic k="pen" />{busy ? "Getting it ready…" : "Sign"}
      </button>
    </Sheet>
  );
}

/* ── the sealing moment (the design's finish) ────────────────────────────── */

function Seal({ state, agentFirst, email, waitingOn, preview, onRetry, onBack }: {
  state: { stage: number; error: string | null; done: boolean | null } | null;
  agentFirst: string;
  email: string;
  waitingOn: string[];
  preview: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const stage = state?.stage ?? 0;
  const items = [
    "Your signature added",
    preview ? "Preview only: nothing is sealed" : `Sealed with ${agentFirst}'s signature`,
    state?.done || !waitingOn.length ? `Your copy on its way${email ? ` to ${email}` : ""}` : `Your copy follows once ${joinAnd(waitingOn)} ${waitingOn.length > 1 ? "have" : "has"} signed`,
  ];
  return (
    <div className={`seal${state ? " on" : ""}${state && !state.error && stage >= 2 ? " s2" : ""}`} role="status" aria-live="polite">
      {state && (
        <div className="seal-in">
          <div className="mini">
            <i /><i /><i /><i /><i /><i />
            <span className="sg"><span /><span /></span>
            <span className="stamp">Signed</span>
          </div>
          {state.error ? (
            <>
              <h3>That didn&apos;t <span>go through.</span></h3>
              <p className="seal-err">{state.error} Your signature is still on the page, so you can try again.</p>
              <div className="seal-row">
                <button type="button" className="btn primary" onClick={onRetry}>Try again</button>
                <button type="button" className="btn" onClick={onBack}>Back to the terms</button>
              </div>
            </>
          ) : (
            <>
              <h3>{stage >= 3 ? <>Signed. <span>Thank you.</span></> : <>Sealing it <span>up…</span></>}</h3>
              <ul className="ticks">
                {items.map((t, j) => (
                  <li key={j} className={j < stage ? "ok" : j === stage ? "go" : ""}>
                    <i>{j < stage && <Ic k="check" sw={3} />}</i>
                    {t}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
