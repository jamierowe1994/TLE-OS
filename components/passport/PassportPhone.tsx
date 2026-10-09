"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import {
  APPLICANT_TYPES,
  TRADING_FOR,
  WORK_HOURS,
  isEmployed,
  isTrading,
  money,
  workLine,
  type PassportData,
} from "@/lib/passport-shape";
import type { PassportQuestion } from "@/components/PassportForm";

/**
 * The tenant passport on a phone (James, 9 Oct 2026).
 *
 * The desktop passport - a question on the left, the card on a desk on the
 * right - does not fold down to a phone well, so a phone gets its own way
 * through, modelled on the screenshots James sent: a clean white screen, the
 * passport itself at the top as a black leather cover, and the questions as a
 * short list underneath it. Each line opens a bottom sheet with one question
 * and a Save. Four lines to a page, as full as the questions allow; once a
 * page is answered the Next button lights up, and only the list swipes across
 * - the passport stays put, so the whole thing feels like one object being
 * filled in. The welcome is the first of those pages: its closed cover opens
 * where it stands as the questions come in.
 *
 * Second pass the same day: one screen with no scrolling, the pink logo and
 * pink buttons with black text, a bigger passport sized to the phone, six
 * pages rather than nine (follow-up questions live inside their sheet), the
 * mobile number required, and an address search that finds a postcode's
 * doors or uses where they are.
 *
 * It asks what the desktop asks and writes into the same answers
 * (PassportForm owns the data and the autosave), so a passport started on a
 * phone carries on at a desk and the other way round. Desktop is untouched:
 * PassportForm shows this below the sm breakpoint only.
 */

type Setter = <K extends keyof PassportData>(k: K, v: PassportData[K]) => void;

type Row = {
  key: string;
  icon: string;
  label: string;
  /** What the line shows once answered. Empty means not answered yet. */
  value: string;
  /** Needed before the page counts as done. */
  required: boolean;
  when?: boolean;
  /** The sheet's question, in a sentence. */
  question: string;
  hint?: string;
  sheet: (close: () => void) => React.ReactNode;
};

type Page = { key: string; title: string; rows: Row[] };

/* The palette's warm clay, with black text on it (James, 9 Oct 2026). */
const PINK = "#DE968F";
const PINK_WASH = "#FDEFEC";
const INK = "#141213";
const pinkBtn = "w-full rounded-2xl py-4 text-[16px] font-semibold text-[#141213] transition-transform active:scale-[0.98] disabled:opacity-40";

const NATIONALITY_QUICK = ["British", "Irish", "Polish", "Romanian", "Indian", "Italian"];
const yes = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
const pounds = (v: string) => {
  const n = money(v);
  return n === null ? "" : `£${n.toLocaleString("en-GB")}`;
};
const longDob = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};
const monthsSince = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y) return 0;
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - (m || 1));
};

/** The window's height, so the passport can be as big as the phone allows. */
function useScreenHeight() {
  const [h, setH] = useState(780);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

export default function PassportPhone({
  d,
  set,
  answers,
  setAnswer,
  questions,
  agentName,
  demo,
  token,
  saveState,
  submitted,
  accountExists,
  pct,
  allDone,
  onFinish,
}: {
  d: PassportData;
  set: Setter;
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  questions: PassportQuestion[];
  agentName: string;
  demo: boolean;
  /** The passport's link code: the address search answers to it. */
  token: string;
  saveState: "idle" | "saving" | "saved" | "error";
  submitted: boolean;
  accountExists: boolean;
  /** How much of the passport is filled in, for the ring round the photo. */
  pct: number;
  allDone: boolean;
  onFinish: () => void;
}) {
  /* A passport already handed in opens on its list; a new one on the welcome. */
  const [screen, setScreen] = useState<"intro" | number>(submitted ? 0 : "intro");
  /* The page on its way out, kept on screen while the new one swipes in. */
  const [leaving, setLeaving] = useState<{ screen: "intro" | number; dir: 1 | -1; n: number } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();
  const adults = Math.min(9, Math.max(0, parseInt(d.numAdults, 10) || 0));
  const firstName = d.legalName.trim().split(/\s+/)[0] ?? "";

  /* As big a passport as leaves room for four lines and the button. */
  const vh = useScreenHeight();
  const coverW = Math.round(Math.max(128, Math.min(236, (vh - 65 - 52 - 18 - 92 - 300) * 0.74)));

  /* ── The pages ─────────────────────────────────────────────────────────── */

  const text = (k: keyof PassportData, opts: { placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; list?: string[]; required?: boolean } = {}) =>
    (close: () => void) => (
      <TextSheet
        value={String(d[k] ?? "")}
        placeholder={opts.placeholder}
        type={opts.type}
        inputMode={opts.inputMode}
        quick={opts.list}
        required={opts.required}
        onSave={(v) => { set(k, v as PassportData[typeof k]); close(); }}
      />
    );
  const yesNo = (k: keyof PassportData) => (close: () => void) => (
    <YesNoSheet value={d[k] as boolean | null} onPick={(v) => { set(k, v as PassportData[typeof k]); close(); }} />
  );

  const sinceOptions = ["Less than a year", ...Array.from({ length: 9 }, (_, i) => `Since ${thisYear - 1 - i}`), `Before ${thisYear - 10}`];
  const sinceLabel = (ym: string) => {
    if (!ym) return "";
    const y = Number(ym.slice(0, 4));
    if (y >= thisYear) return "Less than a year";
    if (y < thisYear - 10) return `Before ${thisYear - 10}`;
    return `Since ${y}`;
  };
  const pickSince = (label: string) => {
    const y = label === "Less than a year" ? thisYear : label.startsWith("Before") ? thisYear - 11 : Number(label.replace("Since ", ""));
    const ym = `${y}-01`;
    set("movedIn", ym);
    set("livedThreeYears", label === "Less than a year" ? false : monthsSince(ym) >= 36);
  };
  const others = d.coOccupantIncomes.split("\n").filter((l) => l.trim());
  const workDone = Boolean(d.applicantType) && (!isEmployed(d) || (Boolean(d.workHours) && d.zeroHours !== null && d.onProbation !== null)) && (!isTrading(d) || Boolean(d.tradingFor));
  const rentedValue = d.rentedLast12Months === null ? "" : d.rentedLast12Months
    ? ["Yes", d.rentOnTime === true ? "always on time" : d.rentOnTime === false ? "not always on time" : "", d.landlordRef === true ? "reference available" : ""].filter(Boolean).join(", ")
    : "No";

  const pages: Page[] = [
    {
      key: "about",
      title: "About You",
      rows: [
        { key: "legalName", icon: "user", label: "Full name", value: d.legalName.trim(), required: true, question: "Your full legal name", hint: "As it appears on your passport or driving licence.", sheet: text("legalName", { placeholder: "e.g. Samantha Jones", required: true }) },
        { key: "knownAs", icon: "pencil", label: "Known as", value: d.knownAs.trim(), required: false, question: "What do you go by?", hint: "Optional. If you use a shorter name, or a nickname.", sheet: text("knownAs", { placeholder: "e.g. Sam" }) },
        {
          key: "dob", icon: "calendar", label: "Date of birth", value: longDob(d.dob), required: true, question: "When were you born?",
          sheet: (close) => <DateSheet value={d.dob} max={`${thisYear - 16}-12-31`} onSave={(v) => { set("dob", v); close(); }} />,
        },
        { key: "nationality", icon: "target", label: "Nationality", value: d.nationality.trim(), required: true, question: "What's your nationality?", sheet: text("nationality", { placeholder: "Start typing", list: NATIONALITY_QUICK, required: true }) },
      ],
    },
    {
      key: "contact",
      title: "Personal Information",
      rows: [
        { key: "email", icon: "mail", label: "Email", value: d.email.trim(), required: true, question: "Your email address", hint: "Where your agent writes to you, and how you log in.", sheet: text("email", { type: "email", inputMode: "email", placeholder: "you@example.com", required: true }) },
        { key: "mobile", icon: "call", label: "Mobile number", value: d.mobile.trim(), required: true, question: "Your mobile number", hint: "So your agent can reach you about a viewing or an offer.", sheet: text("mobile", { type: "tel", inputMode: "tel", placeholder: "e.g. 07123 456789", required: true }) },
        { key: "hasBritishPassport", icon: "shield", label: "British or Irish passport", value: yes(d.hasBritishPassport), required: true, question: "Do you have a British or Irish passport?", hint: "Every landlord in England has to check this by law. This one question decides how.", sheet: yesNo("hasBritishPassport") },
        {
          key: "shareCode", icon: "lock", label: "Share code", value: d.shareCode.trim(), required: true, when: d.hasBritishPassport === false, question: "Your share code",
          hint: "Free from gov.uk/prove-right-to-rent. It takes about two minutes and lasts 90 days. With this we can do the whole check online, today.",
          sheet: text("shareCode", { placeholder: "e.g. W12 A34 B56", required: true }),
        },
      ],
    },
    {
      /* Work and income together (James, 9 Oct 2026). The questions referencing
         turns on - hours, zero-hours, probation, how long trading - follow on
         inside the "What you do" sheet rather than taking lines of their own. */
      key: "work",
      title: "Work and Income",
      rows: [
        {
          key: "applicantType", icon: "suitcase", label: "What you do", value: workDone ? workLine(d) : d.applicantType ? `${d.applicantType}, a little more to add` : "", required: true, question: "Which best describes you?",
          sheet: (close) => <WorkSheet d={d} onSave={(p) => { (Object.keys(p) as (keyof PassportData)[]).forEach((k) => set(k, p[k] as never)); close(); }} />,
        },
        { key: "annualIncome", icon: "wallet", label: "Annual income", value: pounds(d.annualIncome) ? `${pounds(d.annualIncome)} a year` : "", required: true, question: "What do you earn a year?", hint: "Before tax. If you're not sure, your monthly pay times twelve is close enough.", sheet: text("annualIncome", { inputMode: "decimal", placeholder: "32,000", required: true }) },
        { key: "savings", icon: "coin", label: "Savings", value: pounds(d.savings), required: false, question: "Anything saved?", hint: "Optional. It's what rescues a borderline application, so it's worth putting in.", sheet: text("savings", { inputMode: "decimal", placeholder: "4,000" }) },
      ],
    },
    {
      key: "household",
      title: "Who's Moving In",
      rows: [
        {
          key: "numAdults", icon: "user", label: "Adults, including you", value: d.numAdults.trim(), required: true, question: "How many adults are moving in, including you?",
          sheet: (close) => <ChoiceSheet value={d.numAdults} options={["1", "2", "3", "4", "5", "6"]} grid onPick={(v) => { set("numAdults", v); close(); }} />,
        },
        {
          key: "numChildren", icon: "home", label: "Children", value: d.numChildren.trim(), required: false, question: "And children?",
          sheet: (close) => <ChoiceSheet value={d.numChildren} options={["0", "1", "2", "3", "4", "5"]} grid onPick={(v) => { set("numChildren", v); close(); }} />,
        },
        {
          key: "coOccupantIncomes", icon: "list", label: adults === 2 ? "Who else is moving in" : "The others moving in",
          value: others.length ? others.map((l) => l.split(" - ")[0].trim()).filter(Boolean).join(", ") : "",
          required: true, when: adults > 1, question: adults === 2 ? "Who else is moving in?" : `The other ${adults - 1} adults`,
          hint: "Their income counts towards the household total, so it's worth putting in. A year, before tax.",
          sheet: (close) => <OthersSheet count={adults - 1} value={d.coOccupantIncomes} onSave={(v) => { set("coOccupantIncomes", v); close(); }} />,
        },
      ],
    },
    {
      key: "address",
      title: "Where You Live",
      rows: [
        {
          key: "currentAddress", icon: "home", label: "Current address", value: d.currentAddress.trim(), required: true, question: "Where do you live now?",
          sheet: (close) => <AddressSheet token={token} demo={demo} value={d.currentAddress} onSave={(v) => { set("currentAddress", v); close(); }} />,
        },
        {
          key: "movedIn", icon: "clock", label: "Lived there", value: sinceLabel(d.movedIn), required: true, question: `How long have you lived ${d.currentAddress.split(",")[0].trim() ? `at ${d.currentAddress.split(",")[0].trim()}` : "there"}?`,
          sheet: (close) => <ChoiceSheet value={sinceLabel(d.movedIn)} options={sinceOptions} onPick={(v) => { pickSince(v); close(); }} />,
        },
        {
          key: "previousAddress", icon: "home-1", label: "Previous address", value: d.previousAddress.trim(), required: true, when: d.livedThreeYears === false, question: "Where were you before?", hint: "Under three years, so referencing needs one more.",
          sheet: (close) => <AddressSheet token={token} demo={demo} value={d.previousAddress} onSave={(v) => { set("previousAddress", v); close(); }} />,
        },
        {
          key: "rentedLast12Months", icon: "key", label: "Rented in the last 12 months", value: rentedValue, required: true, question: "Have you rented in the last 12 months?",
          sheet: (close) => <RentedSheet d={d} onSave={(p) => { (Object.keys(p) as (keyof PassportData)[]).forEach((k) => set(k, p[k] as never)); close(); }} />,
        },
      ],
    },
    {
      key: "last",
      title: "A Few Last Things",
      rows: [
        { key: "guarantor", icon: "shield", label: "Could provide a guarantor", value: yes(d.guarantor), required: true, question: "Could you provide a guarantor if one were needed?", sheet: yesNo("guarantor") },
        {
          key: "adverseCredit", icon: "info", label: "Adverse credit", value: d.adverseCredit === true ? d.adverseCreditNote.trim() || "Yes" : yes(d.adverseCredit), required: true,
          question: "Any adverse credit? CCJs, defaults or bankruptcy.", hint: "None of these is automatically a no. Better said now than found later.",
          sheet: (close) => <YesNoMoreSheet value={d.adverseCredit} note={d.adverseCreditNote} noteLabel="Tell us about it" notePlaceholder="A couple of sentences. Context helps." onSave={(v, note) => { set("adverseCredit", v); set("adverseCreditNote", v ? note : ""); close(); }} />,
        },
        {
          key: "pets", icon: "star", label: "Pets", value: d.pets === true ? d.petsNote.trim() || "Yes" : yes(d.pets), required: true, question: "Any pets?",
          sheet: (close) => <YesNoMoreSheet value={d.pets} note={d.petsNote} noteLabel="What kind?" notePlaceholder="e.g. one cat" onSave={(v, note) => { set("pets", v); set("petsNote", v ? note : ""); close(); }} />,
        },
        { key: "smoker", icon: "cross", label: "Anyone smokes", value: yes(d.smoker), required: true, question: "Does anyone moving in smoke?", sheet: yesNo("smoker") },
      ],
    },
  ];
  /* The agent's own questions, four to a page. */
  const extra: Row[] = questions.map((qn) => {
    const v = answers[qn.id] ?? "";
    const shownV = qn.kind === "yesno" ? (v === "yes" ? "Yes" : v === "no" ? "No" : "") : v;
    const put = (x: string) => setAnswer(qn.id, x);
    return {
      key: `q-${qn.id}`, icon: "note", label: qn.label, value: shownV, required: qn.required, question: qn.label,
      sheet: (close) =>
        qn.kind === "yesno" ? <YesNoSheet value={v === "" ? null : v === "yes"} onPick={(b) => { put(b ? "yes" : "no"); close(); }} />
        : qn.kind === "select" ? <ChoiceSheet value={v} options={qn.options} onPick={(x) => { put(x); close(); }} />
        : <TextSheet value={v} required={qn.required} onSave={(x) => { put(x); close(); }} />,
    };
  });
  for (let i = 0; i < extra.length; i += 4) {
    pages.push({ key: `extra-${i}`, title: agentName ? `A Few More from ${agentName}` : "A Few More Questions", rows: extra.slice(i, i + 4) });
  }

  const shown = (p: Page) => p.rows.filter((r) => r.when !== false);
  const pageDone = (p: Page) => shown(p).every((r) => !r.required || r.value !== "");
  const allRows = pages.flatMap((p) => p.rows);
  const open: Row | "photo" | null = openKey === "photo" ? "photo" : openKey ? allRows.find((r) => r.key === openKey) ?? null : null;
  const setOpen = (r: Row | "photo" | null) => setOpenKey(r === null ? null : r === "photo" ? "photo" : r.key);
  const intro = screen === "intro";
  const at = typeof screen === "number" ? Math.min(screen, pages.length - 1) : 0;
  const page = pages[at];
  const last = at === pages.length - 1;
  const firstOpen = pages.findIndex((p) => !pageDone(p));
  const done = !intro && pageDone(page);

  const go = (to: "intro" | number) => {
    const from = screen;
    const d2: 1 | -1 = to === "intro" ? -1 : from === "intro" ? 1 : to > (from as number) ? 1 : -1;
    setDir(d2);
    setLeaving({ screen: from, dir: d2, n: Date.now() });
    setScreen(to);
  };
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), 480);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const savedNote = demo ? "A sample, nothing is saved" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved yet, check your signal. We'll keep trying" : saveState === "saved" ? "Saved" : "Saves as you go";

  /* One panel of the swiping area: the welcome's words, or a page's lines. */
  const panel = (s: "intro" | number) => {
    if (s === "intro") {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <h1 className="text-[30px] font-normal leading-[1.1] tracking-normal">Let&apos;s Fill Out Your Passport</h1>
          <p className="mt-3 max-w-[30ch] text-[15px] leading-relaxed text-muted">
            {firstName ? `Hi ${firstName}. ` : ""}A tap at a time, about ten minutes. It saves as you go, so you can stop and come back.
          </p>
        </div>
      );
    }
    const p = pages[Math.min(s, pages.length - 1)];
    return (
      <div className="h-full overflow-y-auto px-5 pt-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted">{p.title}</h2>
        <ul className="mt-1 divide-y divide-line/60">
          {shown(p).map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3.5 py-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: PINK_WASH, color: PINK }}>
                  <DoodleIcon name={r.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] text-ink">{r.label}{!r.required && !r.value ? <span className="text-muted"> (optional)</span> : null}</span>
                  {r.value ? (
                    <span className="mt-0.5 block truncate text-[14px] font-semibold text-ink">{r.value}</span>
                  ) : (
                    <span className="mt-0.5 block text-[13px] text-muted">{r.required ? "Tap to add" : "Tap to add, or leave it"}</span>
                  )}
                </span>
                {r.value ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: PINK }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M8 12.5l2.6 2.6L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted"><path d="M9 6l6 6-6 6" /></svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  const swipe = (kind: "in" | "out", d2: 1 | -1): React.CSSProperties => ({
    animation: `pp-${kind}-${d2 === 1 ? "next" : "back"} 460ms cubic-bezier(0.32,0.72,0,1) both`,
  });

  /* The way on. On the welcome, always; on a page, lit once it is answered;
     on the last, the finish or the first thing still missing. */
  const button = intro ? (
    <button type="button" onClick={() => go(firstOpen > 0 ? firstOpen : 0)} className={pinkBtn} style={{ background: PINK }}>Next</button>
  ) : !last ? (
    <button type="button" disabled={!done} onClick={() => go(at + 1)} className={pinkBtn} style={{ background: PINK }}>Next</button>
  ) : submitted && accountExists ? (
    <Link href="/tenant" className={`block text-center ${pinkBtn}`} style={{ background: PINK }}>Open my tenant area</Link>
  ) : allDone ? (
    <button type="button" onClick={onFinish} className={pinkBtn} style={{ background: PINK }}>Great, create my passport</button>
  ) : (
    <button type="button" onClick={() => go(firstOpen >= 0 ? firstOpen : 0)} className="w-full rounded-2xl border-2 py-3.5 text-[15px] font-semibold text-[#141213]" style={{ borderColor: PINK }}>
      {firstOpen === at ? "A few still to answer on this page" : "Some still to answer - take me there"}
    </button>
  );

  return (
    <div className="flex h-[calc(100dvh-65px)] flex-col overflow-hidden bg-white">
      {/* Back and the save line. Kept in place on the welcome, just hidden, so
          the passport does not jump when the questions arrive. */}
      <div className={`flex h-[52px] shrink-0 items-center justify-between px-5 transition-opacity duration-300 ${intro ? "pointer-events-none opacity-0" : "opacity-100"}`}>
        <button type="button" onClick={() => go(at === 0 ? "intro" : at - 1)} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 text-ink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span className={`text-[12px] ${saveState === "error" && !demo ? "text-[#9d4340]" : "text-muted"}`}>{savedNote}</span>
      </div>

      <button type="button" onClick={() => (intro ? go(firstOpen > 0 ? firstOpen : 0) : setOpen("photo"))} className="mx-auto block shrink-0" aria-label={intro ? "Start" : d.photo ? "Change your photo" : "Add a photo"}>
        <Cover d={d} pct={pct} closed={intro} w={coverW} />
      </button>

      <div className={`flex h-[18px] shrink-0 items-end justify-center gap-1.5 transition-opacity duration-300 ${intro ? "opacity-0" : "opacity-100"}`} aria-hidden>
        {pages.map((p, i) => (
          <span key={p.key} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === at ? 20 : 6, background: i === at ? INK : pageDone(p) ? PINK : "var(--line)" }} />
        ))}
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        {leaving && (
          <div key={`out-${leaving.n}`} className="absolute inset-0" style={swipe("out", leaving.dir)} aria-hidden>
            {panel(leaving.screen)}
          </div>
        )}
        <div key={`in-${String(screen)}`} className="absolute inset-0" style={leaving ? swipe("in", dir) : undefined}>
          {panel(screen)}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        {button}
        {intro ? (
          <p className="mt-2.5 text-center text-[11.5px] leading-snug text-muted">
            Nothing is shared with a landlord unless you apply for their home.{" "}
            <a href="https://thelettingexperts.co.uk/privacy-policy" target="_blank" rel="noreferrer" className="underline underline-offset-2">Privacy &amp; your data</a>
          </p>
        ) : null}
      </div>

      <Sheet
        open={open !== null}
        title={open === "photo" ? (d.photo ? "Your photo" : "Add a photo") : open?.question ?? ""}
        hint={open === "photo" ? "Optional. A selfie is fine. It only goes on your card, and your agent still checks your ID in person." : open?.hint}
        onClose={() => setOpen(null)}
      >
        {(close) => (open === "photo" ? <PhotoSheet value={d.photo} focus={d.photoFocus} onChange={(v) => set("photo", v)} onFocus={(f) => set("photoFocus", f)} onDone={close} /> : open ? open.sheet(close) : null)}
      </Sheet>
    </div>
  );
}

/* ── The black leather passport ──────────────────────────────────────────── */

function Cover({ d, pct, closed = false, w = 210, badge = true }: { d: PassportData; pct: number; closed?: boolean; w?: number; badge?: boolean }) {
  const name = d.knownAs.trim() || d.legalName.trim().split(/\s+/)[0] || "";
  const initials = d.legalName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("");
  const born = /^\d{4}-\d{2}-\d{2}$/.test(d.dob) ? new Date(`${d.dob}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const line = [d.nationality.trim(), born ? `born ${born}` : ""].filter(Boolean).join(" · ");
  const R = 52, C = 2 * Math.PI * R;
  /* Drawn at 210px wide and scaled from there, so every size of the cover
     keeps its proportions exactly. */
  const k = w / 210;
  const px = (n: number) => `${Math.round(n * k * 10) / 10}px`;
  const face = "absolute inset-0 flex flex-col items-center transition-opacity duration-500";
  return (
    <div
      className="relative mx-auto overflow-hidden text-center transition-[width] duration-500"
      style={{
        width: w,
        borderRadius: px(14),
        aspectRatio: "0.74",
        background:
          "radial-gradient(120% 70% at 30% 0%, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%), radial-gradient(90% 60% at 100% 100%, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%), #151314",
        boxShadow: "0 22px 40px -18px rgba(0,0,0,0.55), 0 4px 10px -4px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.05)",
      }}
    >
      {/* The grain of the leather, and the stitched spine. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22] mix-blend-overlay" aria-hidden>
        <filter id="pp-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0" /></filter>
        <rect width="100%" height="100%" filter="url(#pp-grain)" />
      </svg>
      <span className="pointer-events-none absolute inset-y-3 left-2.5 border-l border-dashed border-white/15" aria-hidden />

      <p className="absolute inset-x-0 font-semibold uppercase tracking-[0.26em] text-white/55" style={{ top: px(20), fontSize: px(10.5), textShadow: "0 -1px 0 rgba(255,255,255,0.12), 0 1px 1px rgba(0,0,0,0.9)" }}>Tenant Passport</p>

      {/* Closed: the company's mark, the pin in the palette's pink and the
          words in white (James, 9 Oct 2026), raised off the leather like an
          embossed foil stamp - lit from the top left, a shadow below. One
          logo file, coloured in two: the pin is the left third of it (it ends
          at 272 of 869px and the words start at 306), so each colour is the
          logo used as a mask and clipped to its own side. */}
      <div className={`${face} justify-center`} style={{ opacity: closed ? 1 : 0 }} aria-hidden={!closed}>
        <span
          role="img"
          aria-label="The Letting Experts"
          className="relative block"
          style={{
            width: px(118), height: px(63),
            filter: `drop-shadow(${px(-0.6)} ${px(-0.6)} 0 rgba(255,255,255,0.28)) drop-shadow(${px(0.8)} ${px(1.4)} ${px(1)} rgba(0,0,0,0.85))`,
          }}
        >
          {([
            { clip: "inset(0 66.5% 0 0)", fill: `linear-gradient(155deg, #F6C3BC 0%, ${PINK} 45%, #B9706A 100%)` },
            { clip: "inset(0 0 0 33.5%)", fill: "linear-gradient(155deg, #FFFFFF 0%, #F1ECEA 50%, #C9C0BD 100%)" },
          ] as const).map((l) => (
            <span
              key={l.clip}
              className="absolute inset-0"
              style={{
                background: l.fill, clipPath: l.clip,
                WebkitMaskImage: "url(/brand/tle-logo-coral.png)", maskImage: "url(/brand/tle-logo-coral.png)",
                WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center",
              }}
            />
          ))}
        </span>
      </div>

      {/* Open: their photo, the ring of how much is done, their name. */}
      <div className={face} style={{ opacity: closed ? 0 : 1, paddingTop: px(44) }} aria-hidden={closed}>
        <div className="relative" style={{ width: px(120), height: px(120) }}>
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
            <circle cx="60" cy="60" r={R} fill="none" stroke={PINK} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, Math.max(0, pct)) / 100)} style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }} />
          </svg>
          <div className="absolute flex items-center justify-center overflow-hidden rounded-full" style={{ inset: px(13), background: PINK_WASH, boxShadow: "0 0 0 3px #151314" }}>
            {d.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.photo} alt="" className="h-full w-full object-cover" style={{ objectPosition: focusPosition(d.photoFocus) }} />
            ) : initials ? (
              <span className="font-semibold" style={{ fontSize: px(26), color: "#56423E" }}>{initials}</span>
            ) : (
              <span style={{ color: PINK }}><DoodleIcon name="camera" size={Math.round(26 * k)} /></span>
            )}
          </div>
          {!d.photo && badge && (
            <span className="absolute bottom-0.5 right-0.5 flex items-center justify-center rounded-full text-[#151314] shadow" style={{ width: px(28), height: px(28), background: PINK }} aria-hidden>
              <DoodleIcon name="camera" size={Math.round(14 * k)} />
            </span>
          )}
        </div>
        <p className="max-w-full truncate px-3 font-semibold leading-tight text-white" style={{ marginTop: px(12), fontSize: px(19) }}>{name || "Your name"}</p>
        <p className="max-w-full truncate px-3 text-white/60" style={{ marginTop: px(4), fontSize: px(11.5) }}>{line || (d.photo || !badge ? "Tenant passport" : "Tap to add a photo")}</p>
      </div>
    </div>
  );
}

function focusPosition(f: string) {
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec((f ?? "").trim());
  return m ? `${m[1]}% ${m[2]}%` : "50% 22%";
}

/* ── The bottom sheet ────────────────────────────────────────────────────── */

/**
 * One question at a time, from the bottom. It lifts above the keyboard
 * (visualViewport), so the Save button is never hidden behind it.
 */
function Sheet({ open, title, hint, onClose, children }: { open: boolean; title: string; hint?: string; onClose: () => void; children: (close: () => void) => React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [lift, setLift] = useState(0);
  const kept = useRef<{ title: string; hint?: string; body: (close: () => void) => React.ReactNode }>({ title, hint, body: children });
  if (open) kept.current = { title, hint, body: children };

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setLift(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => { vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on); };
  }, [mounted]);

  if (!mounted) return null;
  const { title: t, hint: h, body } = kept.current;
  return (
    <div className="fixed inset-0 z-[160]" role="dialog" aria-modal="true" aria-label={t}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[#141213]/40 transition-opacity duration-300" style={{ opacity: shown ? 1 : 0 }} />
      <div
        className="absolute inset-x-0 flex max-h-[88dvh] flex-col rounded-t-[26px] bg-white shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.4)]"
        style={{
          bottom: lift,
          transform: shown ? "translateY(0)" : "translateY(100%)",
          transition: shown ? "transform 460ms cubic-bezier(0.32,0.72,0,1)" : "transform 240ms cubic-bezier(0.55,0,0.9,0.45)",
        }}
      >
        <div className="flex justify-center pt-3" aria-hidden><span className="h-1.5 w-10 rounded-full bg-line" /></div>
        <div className="flex items-start justify-between gap-3 px-6 pt-4">
          <div className="min-w-0">
            <p className="text-[18px] font-semibold leading-snug">{t}</p>
            {h && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{h}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4f1ef] text-[13px] text-muted">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-5">{body(onClose)}</div>
      </div>
    </div>
  );
}

/* ── What goes in a sheet ────────────────────────────────────────────────── */

const fieldCls = "w-full rounded-2xl border border-line/80 bg-[#faf8f7] px-4 py-3.5 text-[16px] outline-none focus:border-[#DE968F]";
const saveCls = `mt-4 ${pinkBtn}`;
const pickedCls = "border-[#DE968F] bg-[#DE968F] text-[#141213]";

function SaveButton({ onClick, disabled, label = "Save", type = "button" }: { onClick?: () => void; disabled?: boolean; label?: string; type?: "button" | "submit" }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={saveCls} style={{ background: PINK }}>{label}</button>;
}

function TextSheet({ value, onSave, placeholder, type = "text", inputMode, quick, required = false }: { value: string; onSave: (v: string) => void; placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; quick?: string[]; required?: boolean }) {
  const [v, setV] = useState(value);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!required || v.trim()) onSave(v.trim()); }}>
      <input autoFocus type={type} inputMode={inputMode} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} className={fieldCls} />
      {quick && (
        <div className="mt-3 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => onSave(q)} className={`rounded-full border px-3.5 py-2 text-[13.5px] ${v === q ? pickedCls : "border-line/80"}`}>{q}</button>
          ))}
        </div>
      )}
      <SaveButton type="submit" disabled={required && !v.trim()} />
    </form>
  );
}

function YesNo({ value, onPick }: { value: boolean | null; onPick: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((b) => (
        <button key={String(b)} type="button" onClick={() => onPick(b)} className={`rounded-2xl border py-4 text-[16px] font-semibold transition-colors ${value === b ? pickedCls : "border-line/80 bg-white"}`}>
          {b ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function YesNoSheet({ value, onPick }: { value: boolean | null; onPick: (v: boolean) => void }) {
  return <YesNo value={value} onPick={onPick} />;
}

function YesNoMoreSheet({ value, note, noteLabel, notePlaceholder, onSave }: { value: boolean | null; note: string; noteLabel: string; notePlaceholder: string; onSave: (v: boolean, note: string) => void }) {
  const [v, setV] = useState<boolean | null>(value);
  const [n, setN] = useState(note);
  return (
    <div>
      <YesNo value={v} onPick={(b) => (b ? setV(true) : onSave(false, ""))} />
      {v === true && (
        <div className="mt-4" style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <p className="text-[13.5px] font-semibold">{noteLabel}</p>
          <input autoFocus value={n} placeholder={notePlaceholder} onChange={(e) => setN(e.target.value)} className={`mt-2 ${fieldCls}`} />
          <SaveButton onClick={() => onSave(true, n.trim())} />
        </div>
      )}
    </div>
  );
}

function ChoiceSheet({ value, options, onPick, grid = false }: { value: string; options: readonly string[]; onPick: (v: string) => void; grid?: boolean }) {
  return (
    <div className={grid ? "grid grid-cols-3 gap-2.5" : "space-y-2"}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-[15.5px] transition-colors ${grid ? "justify-center text-center font-semibold" : ""} ${value === o ? pickedCls : "border-line/80 bg-white"}`}
        >
          {o}
          {!grid && value === o && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          )}
        </button>
      ))}
    </div>
  );
}

/** Small pills for a follow-up inside a sheet. */
function Pills<T extends string | boolean>({ options, value, onPick, label }: { options: T[]; value: T | null | ""; onPick: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} type="button" onClick={() => onPick(o)} className={`rounded-full border px-4 py-2.5 text-[14.5px] font-medium transition-colors ${value === o ? pickedCls : "border-line/80 bg-white"}`}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/**
 * What they do, with the follow-ups referencing turns on asked underneath
 * once the answer calls for them (Rhiannon, 1 Oct 2026): employed - hours,
 * zero-hours, probation; self-employed or a director - how long trading.
 * Anything else saves on the tap.
 */
function WorkSheet({ d, onSave }: { d: PassportData; onSave: (p: Partial<PassportData>) => void }) {
  const [type, setType] = useState(d.applicantType);
  const [hours, setHours] = useState(d.workHours);
  const [zero, setZero] = useState<boolean | null>(d.zeroHours);
  const [prob, setProb] = useState<boolean | null>(d.onProbation);
  const [trading, setTrading] = useState(d.tradingFor);
  const employed = type === "Employed";
  const trades = type === "Self-employed" || type === "Company director";
  const pick = (t: string) => {
    setType(t);
    if (t !== "Employed" && t !== "Self-employed" && t !== "Company director") onSave({ applicantType: t });
  };
  const ok = employed ? Boolean(hours) && zero !== null && prob !== null : trades ? Boolean(trading) : Boolean(type);
  return (
    <div>
      <ChoiceSheet value={type} options={APPLICANT_TYPES} onPick={pick} />
      {employed && (
        <div className="mt-5 space-y-4" style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <div>
            <p className="text-[14px] font-semibold">Full-time or part-time?</p>
            <div className="mt-2"><Pills options={[...WORK_HOURS]} value={hours} onPick={setHours} label={(v) => v} /></div>
          </div>
          <div>
            <p className="text-[14px] font-semibold">On a zero-hours contract?</p>
            <p className="text-[12.5px] text-muted">Referencing can&apos;t accept zero-hours income on its own. A guarantor gets round it.</p>
            <div className="mt-2"><Pills options={[true, false]} value={zero} onPick={setZero} label={(v) => (v ? "Yes" : "No")} /></div>
          </div>
          <div>
            <p className="text-[14px] font-semibold">Still on probation?</p>
            <div className="mt-2"><Pills options={[true, false]} value={prob} onPick={setProb} label={(v) => (v ? "Yes" : "No")} /></div>
          </div>
        </div>
      )}
      {trades && (
        <div className="mt-5" style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <p className="text-[14px] font-semibold">How long have you been trading?</p>
          <p className="text-[12.5px] text-muted">Under a year, a landlord may ask for a guarantor as well.</p>
          <div className="mt-2"><Pills options={[...TRADING_FOR]} value={trading} onPick={setTrading} label={(v) => v} /></div>
        </div>
      )}
      {(employed || trades) && (
        <SaveButton disabled={!ok} onClick={() => onSave(employed ? { applicantType: type, workHours: hours, zeroHours: zero, onProbation: prob, tradingFor: "" } : { applicantType: type, tradingFor: trading, workHours: "", zeroHours: null, onProbation: null })} />
      )}
    </div>
  );
}

/** Rented in the last year, and - if so - the two things a reference turns on. */
function RentedSheet({ d, onSave }: { d: PassportData; onSave: (p: Partial<PassportData>) => void }) {
  const [rented, setRented] = useState<boolean | null>(d.rentedLast12Months);
  const [onTime, setOnTime] = useState<boolean | null>(d.rentOnTime);
  const [ref, setRef] = useState<boolean | null>(d.landlordRef);
  return (
    <div>
      <YesNo value={rented} onPick={(b) => (b ? setRented(true) : onSave({ rentedLast12Months: false, rentOnTime: null, landlordRef: null }))} />
      {rented === true && (
        <div className="mt-5 space-y-4" style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <div>
            <p className="text-[14px] font-semibold">Was the rent always paid on time?</p>
            <p className="text-[12.5px] text-muted">If not, say so. It&apos;s far better coming from you than from a reference.</p>
            <div className="mt-2"><Pills options={[true, false]} value={onTime} onPick={setOnTime} label={(v) => (v ? "Yes" : "No")} /></div>
          </div>
          <div>
            <p className="text-[14px] font-semibold">Can your landlord give a reference?</p>
            <div className="mt-2"><Pills options={[true, false]} value={ref} onPick={setRef} label={(v) => (v ? "Yes" : "No")} /></div>
          </div>
          <SaveButton onClick={() => onSave({ rentedLast12Months: true, rentOnTime: onTime, landlordRef: ref })} />
        </div>
      )}
    </div>
  );
}

/** Day, month and year as three wheels - quicker than paging a calendar back thirty years. */
function DateSheet({ value, max, onSave }: { value: string; max: string; onSave: (v: string) => void }) {
  const maxYear = Number(max.slice(0, 4));
  const [y, setY] = useState(value ? value.slice(0, 4) : "");
  const [m, setM] = useState(value ? value.slice(5, 7) : "");
  const [day, setDay] = useState(value ? value.slice(8, 10) : "");
  const days = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;
  const ok = y && m && day && Number(day) <= days;
  const sel = "w-full appearance-none rounded-2xl border border-line/80 bg-[#faf8f7] px-4 py-3.5 text-[16px] outline-none focus:border-[#DE968F]";
  return (
    <div>
      <div className="grid grid-cols-[1fr_1.5fr_1.2fr] gap-2.5">
        <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={sel}>
          <option value="">Day</option>
          {Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0")).map((x) => <option key={x} value={x}>{Number(x)}</option>)}
        </select>
        <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} className={sel}>
          <option value="">Month</option>
          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((n, i) => <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>)}
        </select>
        <select aria-label="Year" value={y} onChange={(e) => setY(e.target.value)} className={sel}>
          <option value="">Year</option>
          {Array.from({ length: maxYear - 1919 }, (_, i) => String(maxYear - i)).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <SaveButton disabled={!ok} onClick={() => onSave(`${y}-${m}-${day}`)} />
    </div>
  );
}

function OthersSheet({ count, value, onSave }: { count: number; value: string; onSave: (v: string) => void }) {
  const lines = value.split("\n");
  const [rows, setRows] = useState(() =>
    Array.from({ length: count }, (_, k) => {
      const line = lines[k] ?? "";
      const at = line.indexOf(" - ");
      return at === -1 ? { name: line.trim(), income: "" } : { name: line.slice(0, at).trim(), income: line.slice(at + 3).trim() };
    })
  );
  const ok = rows.every((r) => r.name.trim());
  return (
    <div className="space-y-4">
      {rows.map((r, k) => (
        <div key={k} className="grid grid-cols-[1.4fr_1fr] gap-2.5">
          <input autoFocus={k === 0} value={r.name} placeholder={count === 1 ? "Their name" : `Adult ${k + 2}'s name`} onChange={(e) => setRows((cur) => cur.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} className={fieldCls} />
          <input inputMode="decimal" value={r.income} placeholder="Income" onChange={(e) => setRows((cur) => cur.map((x, j) => (j === k ? { ...x, income: e.target.value } : x)))} className={fieldCls} />
        </div>
      ))}
      <SaveButton disabled={!ok} onClick={() => onSave(rows.map((r) => (r.name || r.income ? `${r.name.trim()} - ${r.income.trim()}` : "")).join("\n"))} />
    </div>
  );
}

/* ── The address ─────────────────────────────────────────────────────────── */

/** A door has a number or a name before the street; a bare street does not. */
const looksLikeADoor = (a: string) => /^\s*(flat|apartment|unit|room|studio)\b|^\s*\d|^[^,]*\d[^,]*,/i.test(a);

/**
 * The address, the way people actually give one (James, 9 Oct 2026): the
 * postcode first, which lists every door in it to tap; or the first line,
 * which finds it as they type; or "use my location", which fills in the
 * postcode where they are standing. Typing the whole thing and pressing Save
 * still works for anywhere the register does not know.
 *
 * The lookups go through /api/tenant/passport/address, which answers only to
 * a real passport's code - so the sample, which has none, says so rather than
 * looking broken.
 */
function AddressSheet({ token, demo, value, onSave }: { token: string; demo: boolean; value: string; onSave: (v: string) => void }) {
  const [q, setQ] = useState(value);
  const [matches, setMatches] = useState<{ id: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const picked = useRef<string | null>(value || null);
  const ticket = encodeURIComponent(token);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3 || picked.current === q) return;
    if (demo) { setNote("Address search works on your real passport link. Here, type it in full and press Save."); return; }
    const id = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/tenant/passport/address?token=${ticket}&q=${encodeURIComponent(text)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const found = (j.suggestions ?? []) as { id: string; label: string }[];
        setMatches(found);
        setNote(found.length ? null : j.problem || j.error ? "Search isn't answering right now. Type your full address and press Save." : "Nothing found yet. Keep typing, or type the whole address and press Save.");
      } catch {
        setMatches([]);
        setNote("Search isn't answering right now. Type your full address and press Save.");
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [q, demo, ticket]);

  async function choose(id: string, label: string) {
    setMatches([]);
    picked.current = label;
    setQ(label);
    let full = label;
    try {
      const r = await fetch(`/api/tenant/passport/address?token=${ticket}&resolve=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.address) full = j.address;
    } catch {
      /* keep what they picked */
    }
    picked.current = full;
    setQ(full);
    if (!looksLikeADoor(full)) { setStreet(full); setNumber(""); return; }
    onSave(full);
  }

  function locate() {
    if (demo) { setNote("Location works on your real passport link."); return; }
    if (!navigator.geolocation) { setNote("Your phone isn't sharing its location. Type your postcode instead."); return; }
    setBusy(true);
    setNote("Finding where you are…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/tenant/passport/address?token=${ticket}&near=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`, { cache: "no-store" });
          const j = await r.json();
          if (j.ok && j.postcode) { picked.current = null; setQ(j.postcode); setNote(`Near ${j.postcode}. Tap your address below.`); }
          else setNote(j.error ?? "We couldn't find where you are. Type your postcode instead.");
        } catch {
          setNote("We couldn't find where you are. Type your postcode instead.");
        } finally {
          setBusy(false);
        }
      },
      () => { setBusy(false); setNote("Location is turned off for this page. Type your postcode instead."); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  if (street) {
    return (
      <div>
        <p className="text-[14px] font-semibold">That&apos;s the street. What&apos;s the house number or name?</p>
        <p className="mt-1 text-[13px] text-muted">{street}</p>
        <input autoFocus value={number} placeholder="e.g. 12, or Flat 2" onChange={(e) => setNumber(e.target.value)} className={`mt-3 ${fieldCls}`} />
        <SaveButton disabled={!number.trim()} onClick={() => onSave(`${number.trim()} ${street}`.replace(/\s+,/g, ","))} />
        <button type="button" onClick={() => setStreet(null)} className="mt-3 w-full text-[13.5px] text-muted underline underline-offset-4">Search again</button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onSave(q.trim()); }}>
      <div className="flex gap-2.5">
        <div className="relative min-w-0 flex-1">
          <input
            autoFocus
            value={q}
            placeholder="Postcode or first line"
            autoComplete="off"
            onChange={(e) => { picked.current = null; setQ(e.target.value); }}
            className={`${fieldCls} pr-10`}
          />
          {busy && <span className="absolute right-4 top-1/2 block h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line" style={{ borderTopColor: PINK }} aria-hidden />}
        </div>
        <button type="button" onClick={locate} aria-label="Use my location" title="Use my location" className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl" style={{ background: PINK_WASH, color: "#B4675F" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="7" r="3" />
            <path d="M12 21s-5-4.4-5-8.2C7 10.6 9.2 10 12 10s5 .6 5 2.8C17 16.6 12 21 12 21Z" />
          </svg>
        </button>
      </div>
      <button type="button" onClick={locate} className="mt-2 text-[13px] font-medium underline underline-offset-4" style={{ color: "#B4675F" }}>Use my location</button>
      {note && <p className="mt-2 text-[13px] leading-snug text-muted">{note}</p>}
      {matches.length > 0 && (
        <ul className="mt-3 max-h-[38dvh] overflow-y-auto rounded-2xl border border-line/80">
          {matches.map((m) => (
            <li key={m.id} className="border-b border-line/50 last:border-0">
              <button type="button" onClick={() => void choose(m.id, m.label)} className="block w-full px-4 py-3 text-left text-[14.5px] active:bg-[#FDEFEC]">{m.label}</button>
            </li>
          ))}
        </ul>
      )}
      <SaveButton type="submit" disabled={!q.trim()} label={matches.length ? "Save as typed" : "Save"} />
    </form>
  );
}

/**
 * The photo, phone-sized: a big circle to drag the face into place, one
 * button to take or choose one. Resized in the browser exactly as the desktop
 * picker does (320 by 380 JPEG), so the card and the file see the same image.
 */
function PhotoSheet({ value, focus, onChange, onFocus, onDone }: { value: string; focus: string; onChange: (v: string) => void; onFocus: (f: string) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const SIZE = 168;
  const parse = (f: string) => {
    const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(f.trim());
    return m ? { fx: Number(m[1]), fy: Number(m[2]) } : { fx: 50, fy: 22 };
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const W = 320, H = 380;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      const s = Math.max(W / bmp.width, H / bmp.height);
      ctx.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) * 0.22, bmp.width * s, bmp.height * s);
      onChange(c.toDataURL("image/jpeg", 0.82));
      onFocus("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex items-center justify-center overflow-hidden rounded-full"
        style={{ width: SIZE, height: SIZE, touchAction: "none", background: PINK_WASH, boxShadow: value ? `0 0 0 4px #fff, 0 0 0 6px ${PINK}` : undefined }}
        onPointerDown={(e) => { if (!value) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...parse(focus) }; }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const fx = Math.max(0, Math.min(100, drag.current.fx - ((e.clientX - drag.current.x) / SIZE) * 100));
          const fy = Math.max(0, Math.min(100, drag.current.fy - ((e.clientY - drag.current.y) / SIZE) * 100));
          onFocus(`${fx.toFixed(1)} ${fy.toFixed(1)}`);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: focusPosition(focus) }} />
        ) : (
          <span style={{ color: PINK }}><DoodleIcon name="camera" size={40} /></span>
        )}
      </div>
      {value && <p className="mt-3 text-[12.5px] text-muted">Drag the picture to centre your face.</p>}
      <label className="mt-5 block w-full cursor-pointer rounded-2xl border-2 py-3.5 text-center text-[15.5px] font-semibold" style={{ borderColor: PINK }}>
        {busy ? "One moment…" : value ? "Change the photo" : "Take or choose a photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <SaveButton onClick={onDone} label={value ? "Done" : "Not just now"} />
      {value && (
        <button type="button" onClick={() => { onChange(""); onFocus(""); }} className="mt-3 text-[13.5px] text-muted underline underline-offset-4">Remove the photo</button>
      )}
    </div>
  );
}

/* ── The end, on a phone ─────────────────────────────────────────────────── */

/**
 * After "Great, create my passport": the cover with its ring full, a beat of
 * "loading in your details", then the account form rising from the bottom.
 * The desktop's FinishStage lays two cards and a side panel out by pixel and
 * pushed the panel off the side of a phone; the rules are the same here - the
 * same /api/tenant/passport/account, the emailed sign-in link when the address
 * was not the one we sent the passport to, nothing created in a sample.
 */
export function PassportPhoneFinish({ d, phase, token, demo, onBack }: { d: PassportData; phase: "loading" | "done" | "docked"; token: string; demo: boolean; onBack: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [sampleDone, setSampleDone] = useState(false);
  const first = d.legalName.trim().split(/\s+/)[0] || "";
  const docked = phase === "docked";
  const ok = pw.length >= 8 && pw === pw2;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setErr("Your password needs at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setErr("");
    if (demo) return setSampleDone(true);
    setBusy(true);
    try {
      const r = await fetch("/api/tenant/passport/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw, data: d }) });
      const j = (await r.json()) as { ok?: boolean; error?: string; verify?: boolean; email?: string };
      if (!j.ok) { setErr(j.error ?? "That didn't work. Try again in a moment."); setBusy(false); return; }
      if (j.verify) { setLinkSentTo(j.email ?? "your email address"); setBusy(false); return; }
      window.location.assign("/tenant?welcome=1");
    } catch {
      setErr("Something went wrong. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-65px)] flex-col bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
      <div className="transition-all duration-700" style={{ marginTop: docked ? 0 : "12vh", transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}>
        <Cover d={d} pct={100} w={docked ? 150 : 220} badge={false} />
      </div>
      <p className="mt-5 flex items-center justify-center gap-2.5 text-[15px] font-medium text-ink">
        {phase === "loading" ? (
          <><span className="block h-4 w-4 animate-spin rounded-full border-2 border-line" style={{ borderTopColor: PINK }} aria-hidden />Loading in your details now…</>
        ) : (
          <><span className="flex h-6 w-6 items-center justify-center rounded-full text-[#141213]" style={{ background: PINK }} aria-hidden><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>All in. That&apos;s your passport.</>
        )}
      </p>

      {docked && (
        <div className="mt-6" style={{ animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 200ms both" }}>
          {sampleDone ? (
            <div>
              <h2 className="text-[24px] font-normal leading-tight">That Is the Whole Journey</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Nothing was created - this page is a sample. A real tenant would now be inside their tenant area, with their passport already filled in.</p>
              <Link href="/preview" className={`mt-5 block text-center ${pinkBtn}`} style={{ background: PINK }}>Back to the preview</Link>
            </div>
          ) : (
            <form onSubmit={create}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-muted">Nearly there{first ? `, ${first}` : ""}</p>
              <h2 className="mt-1.5 text-[24px] font-normal leading-tight">Now Let&apos;s Finish Your Account</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Choose a password and you&apos;re in. Your tenant area opens with everything already filled in.</p>
              <p className="mt-5 text-[13px] font-semibold">Your username</p>
              <div className="mt-1.5 rounded-2xl border border-line/60 bg-[#f4f1ef] px-4 py-3.5 text-[15.5px]">{d.email.trim() || "Add your email on the first page"}</div>
              <p className="mt-4 text-[13px] font-semibold">Choose a password</p>
              <div className="relative mt-1.5">
                <input type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={`${fieldCls} pr-16`} />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted">{show ? "Hide" : "Show"}</button>
              </div>
              <p className="mt-4 text-[13px] font-semibold">Type it again</p>
              <input type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={`mt-1.5 ${fieldCls}`} />
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
                <li className={pw.length >= 8 ? "text-ink" : ""}>{pw.length >= 8 ? "✓" : "·"} At least 8 characters</li>
                <li className={pw && pw === pw2 ? "text-ink" : ""}>{pw && pw === pw2 ? "✓" : "·"} Both the same</li>
              </ul>
              {err && <p className="mt-3 text-[13.5px] text-[#9d4340]">{err}</p>}
              {linkSentTo && <p className="mt-3 text-[13.5px] leading-relaxed" role="status">Your passport is saved. We&apos;ve emailed a sign-in link to {linkSentTo} - open it to finish and go straight in.</p>}
              <SaveButton type="submit" disabled={busy || !ok} label={busy ? "Opening your account…" : "Create my account"} />
              <button type="button" onClick={onBack} className="mt-3 w-full rounded-2xl border border-line/80 py-3.5 text-[15px] font-medium">Back to my passport</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
