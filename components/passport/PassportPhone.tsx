"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import {
  APPLICANT_TYPES,
  TRADING_FOR,
  WORK_HOURS,
  isEmployed,
  isTrading,
  money,
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
 * and a Save. No more than four lines to a page; once a page is answered a
 * Next button rises, and only the list slides across - the passport stays
 * put, so the whole thing feels like one object being filled in.
 *
 * It asks exactly what the desktop asks and writes into the same answers
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

export default function PassportPhone({
  d,
  set,
  answers,
  setAnswer,
  questions,
  agentName,
  demo,
  saveState,
  submitted,
  accountExists,
  pct,
  allDone,
  onFinish,
  renderAddress,
}: {
  d: PassportData;
  set: Setter;
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  questions: PassportQuestion[];
  agentName: string;
  demo: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  submitted: boolean;
  accountExists: boolean;
  /** How much of the passport is filled in, for the ring round the photo. */
  pct: number;
  allDone: boolean;
  onFinish: () => void;
  /** The desktop's own address lookup, so a phone finds addresses the same way. */
  renderAddress: (value: string, onChange: (v: string) => void, onPicked: () => void) => React.ReactNode;
}) {
  /* A passport already handed in opens on its list; a new one on the welcome. */
  const [screen, setScreen] = useState<"intro" | number>(submitted ? 0 : "intro");
  const [dir, setDir] = useState<1 | -1>(1);
  /* Which sheet is up, by its line's key - looked up afresh each render, so a
     sheet always shows the answer as it is now, not as it was when opened. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();
  const adults = Math.min(9, Math.max(0, parseInt(d.numAdults, 10) || 0));
  const firstName = d.legalName.trim().split(/\s+/)[0] ?? "";

  /* ── The pages, four lines at most ─────────────────────────────────────── */

  const pages: Page[] = useMemo(() => {
    const text = (k: keyof PassportData, opts: { placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; list?: string[] } = {}) =>
      (close: () => void) => (
        <TextSheet
          value={String(d[k] ?? "")}
          placeholder={opts.placeholder}
          type={opts.type}
          inputMode={opts.inputMode}
          quick={opts.list}
          onSave={(v) => { set(k, v as PassportData[typeof k]); close(); }}
        />
      );
    const yesNo = (k: keyof PassportData) => (close: () => void) => (
      <YesNoSheet value={d[k] as boolean | null} onPick={(v) => { set(k, v as PassportData[typeof k]); close(); }} />
    );
    const choice = (k: keyof PassportData, options: readonly string[]) => (close: () => void) => (
      <ChoiceSheet value={String(d[k] ?? "")} options={options} onPick={(v) => { set(k, v as PassportData[typeof k]); close(); }} />
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

    const list: Page[] = [
      {
        key: "about",
        title: "About You",
        rows: [
          { key: "legalName", icon: "user", label: "Full name", value: d.legalName.trim(), required: true, question: "Your full legal name", hint: "As it appears on your passport or driving licence.", sheet: text("legalName", { placeholder: "e.g. Samantha Jones" }) },
          { key: "knownAs", icon: "pencil", label: "Known as", value: d.knownAs.trim(), required: false, question: "What do you go by?", hint: "Optional. If you use a shorter name, or a nickname.", sheet: text("knownAs", { placeholder: "e.g. Sam" }) },
          {
            key: "dob", icon: "calendar", label: "Date of birth", value: longDob(d.dob), required: true, question: "When were you born?",
            sheet: (close) => <DateSheet value={d.dob} max={`${thisYear - 16}-12-31`} onSave={(v) => { set("dob", v); close(); }} />,
          },
          { key: "nationality", icon: "target", label: "Nationality", value: d.nationality.trim(), required: true, question: "What's your nationality?", sheet: text("nationality", { placeholder: "Start typing", list: NATIONALITY_QUICK }) },
        ],
      },
      {
        key: "contact",
        title: "Personal Information",
        rows: [
          { key: "email", icon: "mail", label: "Email", value: d.email.trim(), required: true, question: "Your email address", hint: "Where your agent writes to you, and how you log in.", sheet: text("email", { type: "email", inputMode: "email", placeholder: "you@example.com" }) },
          { key: "mobile", icon: "call", label: "Mobile number", value: d.mobile.trim(), required: false, question: "Your mobile number", hint: "So your agent can ring you about a viewing or an offer.", sheet: text("mobile", { type: "tel", inputMode: "tel", placeholder: "e.g. 07123 456789" }) },
          { key: "hasBritishPassport", icon: "shield", label: "British or Irish passport", value: yes(d.hasBritishPassport), required: true, question: "Do you have a British or Irish passport?", hint: "Every landlord in England has to check this by law. This one question decides how.", sheet: yesNo("hasBritishPassport") },
          {
            key: "shareCode", icon: "lock", label: "Share code", value: d.shareCode.trim(), required: true, when: d.hasBritishPassport === false, question: "Your share code",
            hint: "Free from gov.uk/prove-right-to-rent. It takes about two minutes and lasts 90 days. With this we can do the whole check online, today.",
            sheet: text("shareCode", { placeholder: "e.g. W12 A34 B56" }),
          },
        ],
      },
      {
        key: "work",
        title: "Your Work",
        rows: [
          { key: "applicantType", icon: "suitcase", label: "What you do", value: d.applicantType, required: true, question: "Which best describes you?", sheet: choice("applicantType", APPLICANT_TYPES) },
          { key: "workHours", icon: "clock", label: "Hours", value: d.workHours, required: true, when: isEmployed(d), question: "Full-time or part-time?", sheet: choice("workHours", WORK_HOURS) },
          { key: "zeroHours", icon: "doc", label: "Zero-hours contract", value: yes(d.zeroHours), required: true, when: isEmployed(d), question: "Are you on a zero-hours contract?", hint: "Referencing can't accept zero-hours income on its own, so it's worth knowing now. A guarantor gets round it.", sheet: yesNo("zeroHours") },
          { key: "onProbation", icon: "checklist", label: "On probation", value: yes(d.onProbation), required: true, when: isEmployed(d), question: "Are you still on probation?", hint: "If you are, a landlord may ask for a guarantor as well.", sheet: yesNo("onProbation") },
          { key: "tradingFor", icon: "trend-up", label: "Trading for", value: d.tradingFor, required: true, when: isTrading(d), question: "How long have you been trading?", hint: "Under a year, a landlord may ask for a guarantor as well.", sheet: choice("tradingFor", TRADING_FOR) },
        ],
      },
      {
        key: "income",
        title: "Your Income",
        rows: [
          { key: "annualIncome", icon: "wallet", label: "Annual income", value: pounds(d.annualIncome) ? `${pounds(d.annualIncome)} a year` : "", required: true, question: "What do you earn a year?", hint: "Before tax. If you're not sure, your monthly pay times twelve is close enough.", sheet: text("annualIncome", { inputMode: "decimal", placeholder: "32,000" }) },
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
            sheet: (close) => <AddressSheet render={renderAddress} value={d.currentAddress} onChange={(v) => set("currentAddress", v)} onDone={close} />,
          },
          {
            key: "movedIn", icon: "clock", label: "Lived there", value: sinceLabel(d.movedIn), required: true, question: `How long have you lived ${d.currentAddress.split(",")[0].trim() ? `at ${d.currentAddress.split(",")[0].trim()}` : "there"}?`,
            sheet: (close) => <ChoiceSheet value={sinceLabel(d.movedIn)} options={sinceOptions} onPick={(v) => { pickSince(v); close(); }} />,
          },
          {
            key: "previousAddress", icon: "home-1", label: "Previous address", value: d.previousAddress.trim(), required: true, when: d.livedThreeYears === false, question: "Where were you before?", hint: "Under three years, so referencing needs one more.",
            sheet: (close) => <AddressSheet render={renderAddress} value={d.previousAddress} onChange={(v) => set("previousAddress", v)} onDone={close} />,
          },
        ],
      },
      {
        key: "renting",
        title: "Renting",
        rows: [
          { key: "rentedLast12Months", icon: "key", label: "Rented in the last year", value: yes(d.rentedLast12Months), required: true, question: "Have you rented in the last 12 months?", sheet: yesNo("rentedLast12Months") },
          { key: "rentOnTime", icon: "calendar", label: "Rent always on time", value: yes(d.rentOnTime), required: false, when: d.rentedLast12Months === true, question: "Was the rent always paid on time?", hint: "If not, say so. It's far better coming from you than from a reference.", sheet: yesNo("rentOnTime") },
          { key: "landlordRef", icon: "doc", label: "Landlord reference", value: yes(d.landlordRef), required: false, when: d.rentedLast12Months === true, question: "Can your landlord give a reference?", sheet: yesNo("landlordRef") },
        ],
      },
      {
        key: "last",
        title: "A Few Last Things",
        rows: [
          {
            key: "adverseCredit", icon: "info", label: "Adverse credit", value: d.adverseCredit === true ? d.adverseCreditNote.trim() || "Yes" : yes(d.adverseCredit), required: true,
            question: "Any adverse credit? CCJs, defaults or bankruptcy.", hint: "None of these is automatically a no. Better said now than found later.",
            sheet: (close) => <YesNoMoreSheet value={d.adverseCredit} note={d.adverseCreditNote} noteLabel="Tell us about it" notePlaceholder="A couple of sentences. Context helps." onSave={(v, note) => { set("adverseCredit", v); set("adverseCreditNote", v ? note : ""); close(); }} />,
          },
          { key: "guarantor", icon: "shield", label: "Could provide a guarantor", value: yes(d.guarantor), required: true, question: "Could you provide a guarantor if one were needed?", sheet: yesNo("guarantor") },
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
      const shown = qn.kind === "yesno" ? (v === "yes" ? "Yes" : v === "no" ? "No" : "") : v;
      const put = (x: string) => setAnswer(qn.id, x);
      return {
        key: `q-${qn.id}`, icon: "note", label: qn.label, value: shown, required: qn.required, question: qn.label,
        sheet: (close) =>
          qn.kind === "yesno" ? <YesNoSheet value={v === "" ? null : v === "yes"} onPick={(b) => { put(b ? "yes" : "no"); close(); }} />
          : qn.kind === "select" ? <ChoiceSheet value={v} options={qn.options} onPick={(x) => { put(x); close(); }} />
          : <TextSheet value={v} onSave={(x) => { put(x); close(); }} />,
      };
    });
    for (let i = 0; i < extra.length; i += 4) {
      list.push({ key: `extra-${i}`, title: agentName ? `A Few More from ${agentName}` : "A Few More Questions", rows: extra.slice(i, i + 4) });
    }
    return list;
  }, [d, answers, questions, agentName, adults, thisYear, set, setAnswer, renderAddress]);

  const shown = (p: Page) => p.rows.filter((r) => r.when !== false);
  const open: Row | "photo" | null = openKey === "photo" ? "photo" : openKey ? pages.flatMap((p) => p.rows).find((r) => r.key === openKey) ?? null : null;
  const setOpen = (r: Row | "photo" | null) => setOpenKey(r === null ? null : r === "photo" ? "photo" : r.key);
  const pageDone = (p: Page) => shown(p).every((r) => !r.required || r.value !== "");
  const at = typeof screen === "number" ? Math.min(screen, pages.length - 1) : 0;
  const page = pages[at];
  const last = at === pages.length - 1;
  const firstOpen = pages.findIndex((p) => !pageDone(p));

  const go = (to: number) => {
    setDir(to > at ? 1 : -1);
    setScreen(to);
  };

  /* ── The welcome ───────────────────────────────────────────────────────── */

  if (screen === "intro") {
    return (
      <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-white px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-10">
        <div className="flex flex-1 flex-col items-center justify-center text-center" style={{ animation: "riseIn 420ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <Cover d={d} pct={0} closed />
          <h1 className="mt-10 text-[30px] font-normal leading-[1.1] tracking-normal">Let&apos;s Fill Out Your Passport</h1>
          <p className="mt-3 max-w-[30ch] text-[15px] leading-relaxed text-muted">
            {firstName ? `Hi ${firstName}. ` : ""}A tap at a time, about ten minutes. It saves as you go, so you can stop and come back.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setDir(1); setScreen(firstOpen > 0 ? firstOpen : 0); }}
          className="mt-8 w-full rounded-2xl bg-[#141213] py-4 text-[16px] font-semibold text-white transition-transform active:scale-[0.98]"
        >
          Next
        </button>
        <p className="mt-3 text-center text-[12px] text-muted">Nothing is shared with a landlord unless you apply for their home.</p>
      </div>
    );
  }

  /* ── The passport and its list ─────────────────────────────────────────── */

  const done = pageDone(page);
  const savedNote = demo ? "A sample, nothing is saved" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, check your connection" : saveState === "saved" ? "Saved" : "Saves as you go";

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-white">
      <div className="flex items-center justify-between px-5 pt-4">
        <button
          type="button"
          onClick={() => (at === 0 ? setScreen("intro") : go(at - 1))}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span className={`text-[12px] ${saveState === "error" && !demo ? "text-[#9d4340]" : "text-muted"}`}>{savedNote}</span>
      </div>

      <button type="button" onClick={() => setOpen("photo")} className="mx-auto mt-3 block" aria-label={d.photo ? "Change your photo" : "Add a photo"}>
        <Cover d={d} pct={pct} w={164} />
      </button>

      <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
        {pages.map((p, i) => (
          <span key={p.key} className={`h-1.5 rounded-full transition-all duration-300 ${i === at ? "w-5 bg-[#141213]" : pageDone(p) ? "w-1.5 bg-[#141213]/60" : "w-1.5 bg-line"}`} />
        ))}
      </div>

      <div className="relative flex-1 overflow-x-hidden px-5 pb-32 pt-3">
        <div key={page.key} style={{ animation: "slideIn 380ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 56}px` }}>
          <h2 className="text-[19px] font-normal tracking-normal">{page.title}</h2>
          <ul className="mt-2 divide-y divide-line/60">
            {shown(page).map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3.5 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4f1ef] text-ink">
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[#141213]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M8 12.5l2.6 2.6L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted"><path d="M9 6l6 6-6 6" /></svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The way on: rises once this page is answered. On the last page it is
          the finish, or the first thing still missing. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white to-white/0 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-8 transition-transform duration-500"
        style={{ transform: done || last ? "translateY(0)" : "translateY(120%)", transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}
      >
        {!last ? (
          <button type="button" onClick={() => go(at + 1)} className="w-full rounded-2xl bg-[#141213] py-4 text-[16px] font-semibold text-white transition-transform active:scale-[0.98]">
            Next
          </button>
        ) : submitted && accountExists ? (
          <Link href="/tenant" className="block w-full rounded-2xl bg-[#141213] py-4 text-center text-[16px] font-semibold text-white">Open my tenant area</Link>
        ) : allDone ? (
          <button type="button" onClick={onFinish} className="w-full rounded-2xl bg-[#141213] py-4 text-[16px] font-semibold text-white transition-transform active:scale-[0.98]">
            Great, create my passport
          </button>
        ) : (
          <button type="button" onClick={() => go(firstOpen >= 0 ? firstOpen : 0)} className="w-full rounded-2xl border border-[#141213] bg-white py-4 text-[15px] font-semibold text-[#141213]">
            {firstOpen === at ? "A few still to answer on this page" : "Some still to answer - take me there"}
          </button>
        )}
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
  /* Drawn at 210px wide and scaled from there, so the smaller cover on the
     list screens keeps its proportions exactly. */
  const k = w / 210;
  const px = (n: number) => `${Math.round(n * k * 10) / 10}px`;
  return (
    <div
      className="relative mx-auto flex flex-col items-center overflow-hidden text-center"
      style={{
        width: w,
        borderRadius: px(14),
        padding: `${px(20)} ${px(16)} ${px(24)}`,
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

      <p className="relative font-semibold uppercase tracking-[0.26em] text-white/45" style={{ fontSize: px(10.5) }}>Tenant Passport</p>

      {closed ? (
        <div className="relative flex flex-1 flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/tle-logo-white.png" alt="The Letting Experts" className="opacity-60" style={{ width: px(96) }} />
        </div>
      ) : (
        <>
          <div className="relative" style={{ marginTop: px(16), width: px(120), height: px(120) }}>
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
              <circle cx="60" cy="60" r={R} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, Math.max(0, pct)) / 100)} style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }} />
            </svg>
            <div className="absolute flex items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)]" style={{ inset: px(13), boxShadow: "0 0 0 3px #151314" }}>
              {d.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.photo} alt="" className="h-full w-full object-cover" style={{ objectPosition: focusPosition(d.photoFocus) }} />
              ) : initials ? (
                <span className="font-semibold text-[var(--accent-dark)]" style={{ fontSize: px(26) }}>{initials}</span>
              ) : (
                <DoodleIcon name="camera" size={26} className="text-[var(--accent-dark)]" />
              )}
            </div>
            {!d.photo && badge && (
              <span className="absolute bottom-0.5 right-0.5 flex items-center justify-center rounded-full bg-white text-[#151314] shadow" style={{ width: px(28), height: px(28) }} aria-hidden>
                <DoodleIcon name="camera" size={14} />
              </span>
            )}
          </div>
          <p className="relative max-w-full truncate font-semibold leading-tight text-white" style={{ marginTop: px(12), fontSize: px(19) }}>{name || "Your name"}</p>
          <p className="relative max-w-full truncate text-white/60" style={{ marginTop: px(4), fontSize: px(11.5) }}>{line || (d.photo || !badge ? "Tenant passport" : "Tap to add a photo")}</p>
        </>
      )}
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

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = was; };
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

const fieldCls = "w-full rounded-2xl border border-line/80 bg-[#faf8f7] px-4 py-3.5 text-[16px] outline-none focus:border-[#141213]";
const saveCls = "mt-4 w-full rounded-2xl bg-[#141213] py-4 text-[16px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40";

function TextSheet({ value, onSave, placeholder, type = "text", inputMode, quick }: { value: string; onSave: (v: string) => void; placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; quick?: string[] }) {
  const [v, setV] = useState(value);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(v.trim()); }}>
      <input autoFocus type={type} inputMode={inputMode} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} className={fieldCls} />
      {quick && (
        <div className="mt-3 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => onSave(q)} className={`rounded-full border px-3.5 py-2 text-[13.5px] ${v === q ? "border-[#141213] bg-[#141213] text-white" : "border-line/80"}`}>{q}</button>
          ))}
        </div>
      )}
      <button type="submit" className={saveCls}>Save</button>
    </form>
  );
}

function YesNoSheet({ value, onPick }: { value: boolean | null; onPick: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((b) => (
        <button key={String(b)} type="button" onClick={() => onPick(b)} className={`rounded-2xl border py-4 text-[16px] font-semibold transition-colors ${value === b ? "border-[#141213] bg-[#141213] text-white" : "border-line/80 bg-white"}`}>
          {b ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function YesNoMoreSheet({ value, note, noteLabel, notePlaceholder, onSave }: { value: boolean | null; note: string; noteLabel: string; notePlaceholder: string; onSave: (v: boolean, note: string) => void }) {
  const [v, setV] = useState<boolean | null>(value);
  const [n, setN] = useState(note);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" onClick={() => (b ? setV(true) : onSave(false, ""))} className={`rounded-2xl border py-4 text-[16px] font-semibold transition-colors ${v === b ? "border-[#141213] bg-[#141213] text-white" : "border-line/80 bg-white"}`}>
            {b ? "Yes" : "No"}
          </button>
        ))}
      </div>
      {v === true && (
        <div className="mt-4" style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
          <p className="text-[13.5px] font-semibold">{noteLabel}</p>
          <input autoFocus value={n} placeholder={notePlaceholder} onChange={(e) => setN(e.target.value)} className={`mt-2 ${fieldCls}`} />
          <button type="button" onClick={() => onSave(true, n.trim())} className={saveCls}>Save</button>
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
          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-[15.5px] transition-colors ${grid ? "justify-center text-center font-semibold" : ""} ${value === o ? "border-[#141213] bg-[#141213] text-white" : "border-line/80 bg-white"}`}
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

/** Day, month and year as three wheels - quicker than paging a calendar back thirty years. */
function DateSheet({ value, max, onSave }: { value: string; max: string; onSave: (v: string) => void }) {
  const maxYear = Number(max.slice(0, 4));
  const [y, setY] = useState(value ? value.slice(0, 4) : "");
  const [m, setM] = useState(value ? value.slice(5, 7) : "");
  const [day, setDay] = useState(value ? value.slice(8, 10) : "");
  const days = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;
  const ok = y && m && day && Number(day) <= days;
  const sel = "w-full appearance-none rounded-2xl border border-line/80 bg-[#faf8f7] px-4 py-3.5 text-[16px] outline-none focus:border-[#141213]";
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
      <button type="button" disabled={!ok} onClick={() => onSave(`${y}-${m}-${day}`)} className={saveCls}>Save</button>
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
      <button type="button" disabled={!ok} onClick={() => onSave(rows.map((r) => (r.name || r.income ? `${r.name.trim()} - ${r.income.trim()}` : "")).join("\n"))} className={saveCls}>Save</button>
    </div>
  );
}

function AddressSheet({ render, value, onChange, onDone }: { render: (value: string, onChange: (v: string) => void, onPicked: () => void) => React.ReactNode; value: string; onChange: (v: string) => void; onDone: () => void }) {
  return (
    <div className="pp-phone-address">
      {render(value, onChange, onDone)}
      <button type="button" disabled={!value.trim()} onClick={onDone} className={saveCls}>Save</button>
    </div>
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
        className="flex items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)]"
        style={{ width: SIZE, height: SIZE, touchAction: "none", boxShadow: value ? "0 0 0 4px #fff, 0 0 0 6px #141213" : undefined }}
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
          <DoodleIcon name="camera" size={40} className="text-[var(--accent-dark)]" />
        )}
      </div>
      {value && <p className="mt-3 text-[12.5px] text-muted">Drag the picture to centre your face.</p>}
      <label className="mt-5 block w-full cursor-pointer rounded-2xl border border-[#141213] py-3.5 text-center text-[15.5px] font-semibold">
        {busy ? "One moment…" : value ? "Change the photo" : "Take or choose a photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <button type="button" onClick={onDone} className={saveCls}>{value ? "Done" : "Not just now"}</button>
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
      const r = await fetch("/api/tenant/passport/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
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
    <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
      <div className="transition-all duration-700" style={{ marginTop: docked ? 0 : "12vh", transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}>
        <Cover d={d} pct={100} w={docked ? 150 : 210} badge={false} />
      </div>
      <p className="mt-5 flex items-center justify-center gap-2.5 text-[15px] font-medium text-ink">
        {phase === "loading" ? (
          <><span className="block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-[#141213]" aria-hidden />Loading in your details now…</>
        ) : (
          <><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#141213] text-white" aria-hidden><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>All in. That&apos;s your passport.</>
        )}
      </p>

      {docked && (
        <div className="mt-6" style={{ animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 200ms both" }}>
          {sampleDone ? (
            <div>
              <h2 className="text-[24px] font-normal leading-tight">That Is the Whole Journey</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">Nothing was created - this page is a sample. A real tenant would now be inside their tenant area, with their passport already filled in.</p>
              <Link href="/preview" className="mt-5 block rounded-2xl bg-[#141213] py-4 text-center text-[16px] font-semibold text-white">Back to the preview</Link>
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
              <button type="submit" disabled={busy || !ok} className={saveCls}>{busy ? "Opening your account…" : "Create my account"}</button>
              <button type="button" onClick={onBack} className="mt-3 w-full rounded-2xl border border-line/80 py-3.5 text-[15px] font-medium">Back to my passport</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
