"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NoticePaper from "@/components/rent-review/NoticePaper";
import type { Part } from "@/lib/rent-increase-notice-text";
import {
  PERIODS, dayWords, earliestFor, emptyAnswers, fillNotice, increaseOf, isDay, noticePeriod, pounds, problems,
  type RentPeriod, type RentReview, type RentReviewAnswers, type StepId,
} from "@/lib/rent-review-rules";

/**
 * THE SCOTTISH RENT REVIEW SCREEN (James and Michael Healy, 19-20 Nov 2026).
 *
 * Opened from Rent review on a Scottish home (the Portfolio home's three-dots
 * menu, or the old look's tile), in place of the Section 13 checklist. Laid
 * out like Send the Terms (components/terms/TermsSendScreen): the notice on
 * the left, drawn live from what is typed, and the steps down the right in a
 * wider panel, because the agent types here.
 *
 *   1. The Tenancy     who, where, the landlord, the agent's office, PRT
 *   2. The New Rent    today's rent, the new rent, the date, the last rise
 *   3. Why This Rent   Michael's questions, kept on the record, never printed
 *   4. Check and Sign  the summary, email consent, the typed signature: Ready
 *
 * Then Who Gets It (the sitting tenants, each emailed on their own) and the
 * email itself, then Send. A tenancy that never agreed to notices by email
 * gets Download to Print instead. The server checks every rule again and
 * sends once (lib/rent-reviews).
 */

type Start = {
  ok: boolean;
  error?: string;
  scottish: boolean;
  test: boolean;
  viewingAs: boolean;
  demo: boolean;
  home: string;
  tenants: { key: string; name: string; email: string | null; where: string | null }[];
  landlord: { name: string; email: string | null; address: string; addressFrom: string | null };
  letAddress: string;
  agentAddress: string;
  rent: { amount: number | null; period: "week" | "month" };
  tenancyStart: string | null;
  beforePrt: boolean;
  lastIncrease: string | null;
  lastIncreaseFrom: string | null;
  sentOn: string;
  period: ReturnType<typeof noticePeriod>;
  me: { name: string; email: string };
  canSetDefault: boolean;
  via: "mailbox" | "ours";
};

type Evidence = { key: string; name: string; size: number; mime: string; url: string };
type Result = { name: string; email: string; sent: boolean; detail: string };
type Done = { review: RentReview; results: Result[]; accounts: { to: string; sent: boolean; detail: string }; demo: boolean; pdf: string; download: string };

const STEPS: { id: StepId; title: string; blurb: string }[] = [
  { id: "tenancy", title: "The Tenancy", blurb: "Who the notice is to, the home, and who it comes from. Change anything that isn't right." },
  { id: "rent", title: "The New Rent", blurb: "The rent today, the new rent and when it starts. The dates are checked against the law as you type." },
  { id: "why", title: "Why This Rent", blurb: "For Michael and the record. None of this is printed on the notice." },
  { id: "sign", title: "Check and Sign", blurb: "Read it through, then sign with your name." },
];

const newId = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const toNum = (s: string) => {
  const n = Number(s.replace(/[£,\s]/g, ""));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

/* ── small icons, drawn in currentColor ── */
function Ic({ k, size = 15 }: { k: "close" | "back" | "arrow" | "check" | "upload" | "mail" | "print" | "doc" | "warn" | "link"; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    close: <path d="M6 6l12 12M18 6 6 18" />,
    back: <path d="M19.5 12h-15M10 6.5 4.5 12l5.5 5.5" />,
    arrow: <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    upload: <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />,
    mail: <><rect x="3.5" y="5.5" width="17" height="13" /><path d="m4 6.5 8 6.5 8-6.5" /></>,
    print: <><path d="M7 9V3.5h10V9M7 17.5H4.5v-8h15v8H17" /><path d="M7 14.5h10v6H7z" /></>,
    doc: <><path d="M6.5 3.5h7l4 4v13h-11z" /><path d="M13.5 3.5v4h4M9 12.5h6M9 16h6" /></>,
    warn: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
    link: <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18.5v-10A1.5 1.5 0 0 1 6 7h5" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rrv-ic">
      {p[k]}
    </svg>
  );
}

export default function RentReviewScreen({ listingId, listings, onClose, onSent }: { listingId: string; listings: string[]; onClose: () => void; onSent: () => void }) {
  const [start, setStart] = useState<Start | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [a, setA] = useState<RentReviewAnswers>(emptyAnswers());
  const [money, setMoney] = useState({ current: "", next: "", market: "" });
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [phase, setPhase] = useState<"steps" | "who" | "email" | "print" | "done">("steps");
  const [picked, setPicked] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [defaultSaved, setDefaultSaved] = useState<string | null>(null);
  const id = useRef<string>("");
  if (!id.current) id.current = newId();
  const sheets = useRef<Partial<Record<Part, HTMLElement | null>>>({});
  const panelBody = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const listingsKey = listings.join(",");
  const flashTimer = useRef<number | undefined>(undefined);

  /* ── open: read the home ── */
  useEffect(() => {
    let live = true;
    fetch(`/api/rent-reviews?listing=${encodeURIComponent(listingId)}&listings=${encodeURIComponent(listingsKey)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => null)) as Start | null }))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok || !j?.ok) return setLoadErr(j?.error ?? "The home couldn't be read just now.");
        setStart(j);
        const amount = j.rent.amount;
        const period: RentPeriod = j.rent.period === "week" ? "week" : "month";
        setA({
          ...emptyAnswers(),
          tenantNames: j.tenants.map((t) => t.name).join(", "),
          letAddress: j.letAddress,
          landlordName: j.landlord.name,
          landlordAddress: j.landlord.address,
          agentAddress: j.agentAddress,
          currentRent: amount,
          currentPeriod: period,
          newPeriod: period,
          effectiveDate: earliestFor({ notIncreased: false, lastIncrease: j.lastIncrease }, j.sentOn),
          lastIncrease: j.lastIncrease,
        });
        setMoney({ current: amount ? String(amount) : "", next: "", market: "" });
        setPicked(j.tenants.filter((t) => t.email).map((t) => t.key));
      })
      .catch(() => live && setLoadErr("The home couldn't be read just now."));
    return () => {
      live = false;
    };
  }, [listingId, listingsKey]);

  /* Escape closes, unless it has gone (then it is the same as Back to the home). */
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) (done ? onSent : onClose)(); };
    window.addEventListener("keydown", k);
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); html.style.overflow = was; };
  }, [busy, done, onClose, onSent]);

  const sentOn = start?.sentOn ?? "";
  const filled = useMemo(() => fillNotice(a, sentOn || "2000-01-01"), [a, sentOn]);
  const issues = useMemo(() => (sentOn ? problems(a, sentOn, evidence.length) : { tenancy: [], rent: [], why: [], sign: [] }), [a, sentOn, evidence.length]);
  const here = STEPS[step];
  const allClear = STEPS.every((s) => issues[s.id].length === 0);
  const inc = increaseOf(a.currentRent, a.currentPeriod, a.newRent, a.newPeriod);
  const earliest = sentOn ? earliestFor(a, sentOn) : "";
  const period = start?.period;

  /* A change flashes on the paper, and the paper scrolls to the part it is in. */
  const PART_OF: Partial<Record<keyof RentReviewAnswers, Part>> = { tenantNames: "part1", letAddress: "part1", landlordName: "part2a", landlordAddress: "part2a", agentAddress: "part2a", currentRent: "part2a", newRent: "part2a", effectiveDate: "part2a", lastIncrease: "part2a", notIncreased: "part2a", signature: "part2a" };
  const SLOT_OF: Partial<Record<keyof RentReviewAnswers, string>> = { notIncreased: "lastIncrease", currentPeriod: "currentRent", newPeriod: "newRent" };
  const set = useCallback(<K extends keyof RentReviewAnswers>(k: K, v: RentReviewAnswers[K]) => {
    setA((x) => ({ ...x, [k]: v }));
    const slot = SLOT_OF[k] ?? k;
    setFlash(String(slot));
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 900);
    const part = PART_OF[k];
    const el = part ? sheets.current[part] : null;
    if (el && window.matchMedia("(min-width: 1100px)").matches) {
      const box = el.closest(".rrv-left");
      const target = el.querySelector(".rrv-fld.is-flash") as HTMLElement | null;
      if (box && target) {
        const r = target.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 40) target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    setErr(null);
    panelBody.current?.scrollTo({ top: 0 });
  };
  const next = () => {
    setTried((t) => ({ ...t, [step]: true }));
    if (issues[here.id].length) return;
    if (step < STEPS.length - 1) go(step + 1);
  };
  const ready = () => {
    setTried((t) => ({ ...t, [step]: true }));
    const first = STEPS.findIndex((s) => issues[s.id].length > 0);
    if (first >= 0) { setTried((t) => ({ ...t, [first]: true })); return go(first); }
    setErr(null);
    setPhase(a.emailAgreed ? "who" : "print");
    panelBody.current?.scrollTo({ top: 0 });
  };

  /* ── evidence ── */
  const addFiles = async (files: File[]) => {
    setUploadErr(null);
    for (const f of files) {
      setUploading(f.name);
      const fd = new FormData();
      fd.append("id", id.current);
      fd.append("listing", listingId);
      fd.append("listings", listingsKey);
      fd.append("file", f);
      const r = await fetch("/api/rent-reviews/files", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
      if (r?.ok) setEvidence((e) => [...e, r.file as Evidence]);
      else { setUploadErr(r?.error ?? `${f.name} didn't upload. Try again.`); break; }
    }
    setUploading(null);
  };

  /* ── the email, then send ── */
  const body = (mode: "preview" | "send" | "print") => JSON.stringify({ mode, id: id.current, listing: listingId, listings, answers: a, evidence, recipients: picked });
  const loadPreview = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/rent-reviews", { method: "POST", headers: { "content-type": "application/json" }, body: body("preview") }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "The email couldn't be drawn just now.");
    setPreview({ subject: r.subject, html: r.html, to: r.to, name: r.name });
    setPhase("email");
    panelBody.current?.scrollTo({ top: 0 });
  };
  const send = async (mode: "send" | "print") => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/rent-reviews", { method: "POST", headers: { "content-type": "application/json" }, body: body(mode) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't go. Nothing was sent; try again in a minute.");
    setDone(r as Done);
    setPhase("done");
    panelBody.current?.scrollTo({ top: 0 });
    if (mode === "print") {
      const link = document.createElement("a");
      link.href = r.download;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const saveDefault = async () => {
    setDefaultSaved("Saving…");
    const r = await fetch("/api/rent-reviews/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentAddress: a.agentAddress }) }).then((x) => x.json()).catch(() => null);
    setDefaultSaved(r?.ok ? "Saved as the default for every notice." : r?.error ?? "That didn't save.");
  };

  const jump = (p: Part) => sheets.current[p]?.scrollIntoView({ block: "start", behavior: "smooth" });

  /* ── the panel's pieces ── */
  const field = (label: string, input: React.ReactNode, hint?: React.ReactNode) => (
    <label className="rrv-f">
      <span className="rrv-f-l">{label}</span>
      {input}
      {hint ? <span className="rrv-f-h">{hint}</span> : null}
    </label>
  );
  const tick = (on: boolean, change: (v: boolean) => void, label: React.ReactNode, sub?: React.ReactNode) => (
    <label className={`rrv-tick${on ? " is-on" : ""}`}>
      <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />
      <span>
        <b>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </label>
  );
  const periodSelect = (v: RentPeriod, change: (p: RentPeriod) => void, label: string) => (
    <select value={v} onChange={(e) => change(e.target.value as RentPeriod)} aria-label={label}>
      {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );

  const stepBody = () => {
    if (!start) return null;
    switch (here.id) {
      case "tenancy":
        return (
          <>
            {field("Tenants", <input value={a.tenantNames} onChange={(e) => set("tenantNames", e.target.value)} />, start.tenants.length > 1 ? "Joint tenants are named together in Part 1." : "Everyone on the tenancy, named together.")}
            {field("Let address", <textarea rows={2} value={a.letAddress} onChange={(e) => set("letAddress", e.target.value)} />)}
            {field("Landlord", <input value={a.landlordName} onChange={(e) => set("landlordName", e.target.value)} />)}
            {field(
              "Landlord's address",
              <textarea rows={3} value={a.landlordAddress} onChange={(e) => set("landlordAddress", e.target.value)} placeholder="Where the landlord lives, not the let" />,
              start.landlord.addressFrom ? `From ${start.landlord.addressFrom}. Change it if it's out of date.` : "Not on their record yet. Type it in."
            )}
            {field(
              "Landlord's agent address",
              <textarea rows={3} value={a.agentAddress} onChange={(e) => { set("agentAddress", e.target.value); setDefaultSaved(null); }} />,
              start.canSetDefault && a.agentAddress.trim() !== start.agentAddress.trim() ? (
                <>The office address from settings. <button type="button" className="rrv-linkbtn" onClick={() => void saveDefault()}>Save as the default</button>{defaultSaved ? ` ${defaultSaved}` : ""}</>
              ) : "The office address from settings."
            )}
            <div className="rrv-row">
              <span className="rrv-f-l">Rent Pressure Zone</span>
              <p className="rrv-fixed">No - Part 2b says the home is not in a Rent Pressure Zone.</p>
              <p className="rrv-f-h">
                There are no Rent Pressure Zones in Scotland, so there is no Yes here.{" "}
                <a href="https://www.mygov.scot/rent-pressure-zone-checker/" target="_blank" rel="noopener noreferrer" className="rrv-link">Check on mygov.scot <Ic k="link" size={12} /></a>
              </p>
            </div>
            {start.beforePrt && (
              <div className="rrv-warn" role="alert">
                <Ic k="warn" />
                <p>This tenancy began {dayWords(start.tenancyStart)}, before 1 December 2017. It may be a short assured tenancy, which needs a different procedure. Speak to Michael before sending this.</p>
              </div>
            )}
            {tick(a.prtConfirmed, (v) => set("prtConfirmed", v), "This is a private residential tenancy", start.tenancyStart ? `The tenancy began ${dayWords(start.tenancyStart)}.` : "Private residential tenancies began on 1 December 2017.")}
          </>
        );
      case "rent":
        return (
          <>
            <div className="rrv-two">
              {field("Rent today", <span className="rrv-money"><i>£</i><input inputMode="decimal" value={money.current} onChange={(e) => { setMoney((m) => ({ ...m, current: e.target.value })); set("currentRent", toNum(e.target.value)); }} /></span>)}
              {field("Paid every", periodSelect(a.currentPeriod, (p) => set("currentPeriod", p), "Today's rent is paid every"))}
            </div>
            <div className="rrv-two">
              {field("New rent", <span className="rrv-money"><i>£</i><input inputMode="decimal" autoFocus value={money.next} onChange={(e) => { setMoney((m) => ({ ...m, next: e.target.value })); set("newRent", toNum(e.target.value)); }} /></span>)}
              {field("Paid every", periodSelect(a.newPeriod, (p) => set("newPeriod", p), "The new rent is paid every"))}
            </div>
            {inc && (
              <p className={`rrv-inc${inc.amount <= 0 ? " is-bad" : ""}`}>
                {inc.amount > 0 ? <>Up <b>{pounds(inc.amount)}</b> {inc.per}, <b>{inc.pct}%</b></> : <>That is not an increase.</>}
              </p>
            )}
            {field(
              "The new rent starts",
              <input type="date" min={earliest} value={a.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />,
              period ? <>Earliest date: <b>{dayWords(earliest)}</b>. {earliest === period.earliest ? period.why : `The last increase was ${dayWords(a.lastIncrease)}, and the new rent can't start until 12 months after it.`}</> : null
            )}
            {field(
              "The last time the rent went up",
              <input type="date" max={sentOn} value={a.notIncreased ? "" : a.lastIncrease ?? ""} disabled={a.notIncreased} onChange={(e) => set("lastIncrease", isDay(e.target.value) ? e.target.value : null)} />,
              start.lastIncreaseFrom && !a.notIncreased && a.lastIncrease === start.lastIncrease ? `From ${start.lastIncreaseFrom}.` : undefined
            )}
            {tick(a.notIncreased, (v) => set("notIncreased", v), "Not increased since the tenancy began", "The notice says n/a.")}
          </>
        );
      case "why":
        return (
          <>
            {field("Why is this increase appropriate?", <textarea rows={4} value={a.why} onChange={(e) => set("why", e.target.value)} placeholder="The market has moved, works done, the rent hasn't changed since…" />)}
            <div className="rrv-two">
              {field("What are similar homes renting for?", <span className="rrv-money"><i>£</i><input inputMode="decimal" value={money.market} onChange={(e) => { setMoney((m) => ({ ...m, market: e.target.value })); set("marketRent", toNum(e.target.value)); }} /></span>, `${PERIODS.find((p) => p.id === a.newPeriod)?.per ?? ""}`)}
              {field("A short note", <input value={a.marketNote} onChange={(e) => set("marketNote", e.target.value)} placeholder="3 two-beds on the same street" />)}
            </div>
            <div className="rrv-row">
              <span className="rrv-f-l">Market evidence</span>
              <p className="rrv-f-h">Rightmove comparables, a valuation. PDF or pictures, at least one.</p>
              {evidence.length > 0 && (
                <ul className="rrv-files">
                  {evidence.map((f) => (
                    <li key={f.key}>
                      <Ic k="doc" />
                      <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a>
                      <small>{kb(f.size)}</small>
                      <button type="button" className="rrv-linkbtn" onClick={() => setEvidence((e) => e.filter((x) => x.key !== f.key))}>Take off</button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) void addFiles(files);
                }}
              />
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={Boolean(uploading)} onClick={() => fileInput.current?.click()}>
                <Ic k="upload" /> {uploading ? `Uploading ${uploading}…` : evidence.length ? "Add Another File" : "Add Evidence"}
              </button>
              {uploadErr && <p className="rrv-err">{uploadErr}</p>}
            </div>
          </>
        );
      case "sign":
        return (
          <>
            <dl className="rrv-sum">
              <div><dt>Tenants</dt><dd>{a.tenantNames}<button type="button" className="rrv-linkbtn" onClick={() => go(0)}>Change</button></dd></div>
              <div><dt>Home</dt><dd>{a.letAddress}</dd></div>
              <div><dt>Landlord</dt><dd>{a.landlordName}</dd></div>
              <div><dt>Rent</dt><dd>{pounds(a.currentRent)} to {pounds(a.newRent)} {PERIODS.find((p) => p.id === a.newPeriod)?.per}{inc ? `, up ${inc.pct}%` : ""}<button type="button" className="rrv-linkbtn" onClick={() => go(1)}>Change</button></dd></div>
              <div><dt>Starts</dt><dd>{dayWords(a.effectiveDate)}</dd></div>
              <div><dt>Last rise</dt><dd>{a.notIncreased ? "Not since the tenancy began (n/a)" : dayWords(a.lastIncrease)}</dd></div>
              <div><dt>Why</dt><dd>{a.why}<button type="button" className="rrv-linkbtn" onClick={() => go(2)}>Change</button></dd></div>
              <div><dt>Evidence</dt><dd>{evidence.length} {evidence.length === 1 ? "file" : "files"}, similar homes at {pounds(a.marketRent)}</dd></div>
            </dl>
            {tick(
              a.emailAgreed,
              (v) => set("emailAgreed", v),
              "The tenancy agreement says notices can be sent by email",
              "The law only allows email when the tenant agreed to it, usually in the communication clause. Without it, the notice is handed over or sent recorded delivery: you'll get Download to Print instead."
            )}
            <div className="rrv-two">
              {field("Sign: type your name", <input className="rrv-sig" value={a.signature} onChange={(e) => set("signature", e.target.value)} placeholder={start.me.name} autoComplete="name" />, "Your typed name is your signature on the notice.")}
              {field("Date", <input value={dayWords(sentOn)} readOnly />, "The day it is sent.")}
            </div>
          </>
        );
    }
  };

  const tenantsWithEmail = start?.tenants.filter((t) => t.email) ?? [];
  const tenantsWithout = start?.tenants.filter((t) => !t.email) ?? [];

  const panel = () => {
    if (loadErr) return <div className="rrv-pbody"><p className="rrv-err" role="alert">{loadErr}</p></div>;
    if (!start) return <div className="rrv-pbody"><p className="rrv-wait"><span className="rrv-spin" aria-hidden /> Reading the home…</p></div>;
    if (!start.scottish) return <div className="rrv-pbody"><p className="rrv-err">This home isn&apos;t in Scotland. Use the Section 13 rent review.</p></div>;

    if (phase === "done" && done) {
      const went = done.results.filter((r) => r.sent).length;
      return (
        <div className="rrv-pbody" ref={panelBody}>
          {done.demo && <p className="rrv-demo" role="status">Demo - nothing was sent. Everything was recorded as it would be.</p>}
          <h3 className="rrv-done-h">{done.review.method === "print" ? "Ready to Print" : done.demo ? "Recorded" : went ? "Sent" : "Not Sent"}</h3>
          <p className="rrv-lead">
            {done.review.method === "print"
              ? "The notice has downloaded. Hand it to the tenants or post it recorded delivery, and keep the proof."
              : done.demo
                ? "On the live system each tenant below would have had their own email from you, with the notice attached."
                : `${went} of ${done.results.length} ${done.results.length === 1 ? "tenant" : "tenants"} emailed, each on their own, with the notice attached.`}
          </p>
          {done.results.length > 0 && (
            <ul className="rrv-results">
              {done.results.map((r) => (
                <li key={`${r.email}-${r.name}`} className={r.sent ? "is-ok" : "is-no"}>
                  <span className="rrv-dot" aria-hidden>{r.sent ? <Ic k="check" size={12} /> : null}</span>
                  <span><b>{r.name}</b><small>{r.email}. {r.detail}</small></span>
                </li>
              ))}
            </ul>
          )}
          <ul className="rrv-results">
            <li className="is-ok"><span className="rrv-dot" aria-hidden><Ic k="check" size={12} /></span><span><b>Saved to the home&apos;s Documents</b><small>Rent increase notice {dayWords(sentOn)}</small></span></li>
            <li className={done.accounts.sent ? "is-ok" : "is-no"}><span className="rrv-dot" aria-hidden>{done.accounts.sent ? <Ic k="check" size={12} /> : null}</span><span><b>Accounts {done.accounts.sent ? "told" : "not told"}</b><small>{done.accounts.to}. {done.accounts.detail}</small></span></li>
            <li className="is-ok"><span className="rrv-dot" aria-hidden><Ic k="check" size={12} /></span><span><b>On Michael&apos;s desk</b><small>Rent Reviews, on the compliance desk</small></span></li>
          </ul>
          <div className="rrv-acts">
            <a className="nl-btn nl-btn--secondary" href={done.pdf} target="_blank" rel="noopener noreferrer"><Ic k="doc" /> Open the Notice</a>
            <button type="button" className="nl-btn nl-btn--primary" onClick={onSent}>Back to the Home <Ic k="arrow" /></button>
          </div>
        </div>
      );
    }

    if (phase === "who" || phase === "email" || phase === "print") {
      return (
        <>
          <div className="rrv-pbody" ref={panelBody}>
            <button type="button" className="rrv-back" onClick={() => { setPhase(phase === "email" ? "who" : "steps"); setErr(null); }}><Ic k="back" /> {phase === "email" ? "Who gets it" : "Back to the notice"}</button>
            {phase === "print" ? (
              <>
                <h3 className="rrv-done-h">Download to Print</h3>
                <p className="rrv-lead">The tenancy agreement doesn&apos;t say notices can go by email, so this one is handed over or posted recorded delivery. Download it, print it, and keep the proof of delivery.</p>
                <p className="rrv-f-h">Downloading records the rent review: it is saved to the home&apos;s Documents, accounts are told to amend PayProp from {dayWords(a.effectiveDate)}, and it goes on Michael&apos;s desk. Nothing is emailed to the tenants.</p>
                <p className="rrv-f-h">The 48 hours still count: posted today, the three months' notice allows a start from {dayWords(period?.earliest)}. Handed over in person, it counts from the day they get it.</p>
              </>
            ) : phase === "who" ? (
              <>
                <h3 className="rrv-done-h">Who Gets It</h3>
                <p className="rrv-lead">Each tenant gets their own email from {start.via === "mailbox" ? "your Outlook" : "The Letting Experts, with your address to reply to"}, with the notice attached.</p>
                <ul className="rrv-who">
                  {tenantsWithEmail.map((t) => (
                    <li key={t.key}>
                      {tick(picked.includes(t.key), (v) => setPicked((p) => (v ? [...p, t.key] : p.filter((k) => k !== t.key))), t.name, `${t.email}${t.where ? ` · ${t.where}` : ""}`)}
                    </li>
                  ))}
                  {tenantsWithout.map((t) => (
                    <li key={t.key} className="is-none">
                      <span className="rrv-noemail"><b>{t.name}</b><small>No email - hand it over or post it recorded delivery.</small></span>
                    </li>
                  ))}
                </ul>
                {!tenantsWithEmail.length && <p className="rrv-err">Nobody on this tenancy has an email address. Go back and untick the email box to print it instead.</p>}
              </>
            ) : (
              <>
                <h3 className="rrv-done-h">The Email</h3>
                <p className="rrv-lead">{picked.length === 1 ? "This is the email that goes." : `This is ${preview?.name ? `${preview.name.split(" ")[0]}'s` : "the first"} email. Each tenant gets their own, with their name.`}</p>
                {preview && (
                  <div className="rrv-mail">
                    <div><span>To</span><b>{preview.to}</b></div>
                    <div><span>Subject</span><b>{preview.subject}</b></div>
                    <iframe title="The email" srcDoc={preview.html} sandbox="" />
                    <div className="rrv-att"><Ic k="doc" /> <b>Rent-increase-notice-{sentOn}.pdf</b> attached</div>
                  </div>
                )}
                <p className="rrv-f-h">Sending also saves the notice to the home&apos;s Documents, tells accounts to amend PayProp from {dayWords(a.effectiveDate)}, and puts it on Michael&apos;s desk.</p>
              </>
            )}
            {err && <p className="rrv-err" role="alert">{err}</p>}
          </div>
          <div className="rrv-pfoot">
            {phase === "print" ? (
              <button type="button" className="nl-btn nl-btn--primary rrv-wide" disabled={busy} onClick={() => void send("print")}><Ic k="print" /> {busy ? "Making the notice…" : "Download to Print"}</button>
            ) : phase === "who" ? (
              <button type="button" className="nl-btn nl-btn--primary rrv-wide" disabled={busy || !picked.length} onClick={() => void loadPreview()}>{busy ? "Drawing the email…" : `Continue to the Email`} <Ic k="arrow" /></button>
            ) : (
              <button type="button" className="nl-btn nl-btn--primary rrv-wide" disabled={busy || !picked.length} onClick={() => void send("send")}><Ic k="mail" /> {busy ? "Sending…" : `Send to ${picked.length} ${picked.length === 1 ? "Tenant" : "Tenants"}`}</button>
            )}
            {start.demo && <p className="rrv-todo">Demo copy: nothing is sent, everything is recorded.</p>}
          </div>
        </>
      );
    }

    const shown = tried[step] ? issues[here.id] : [];
    return (
      <>
        <div className="rrv-progress" aria-hidden><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="rrv-pbody" ref={panelBody}>
          <div key={here.id} className="rrv-step" style={{ animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` }}>
            <p className="rrv-count">{step + 1} of {STEPS.length}</p>
            <h3 className="rrv-step-h">{here.title}</h3>
            <p className="rrv-lead">{here.blurb}</p>
            {stepBody()}
            {shown.length > 0 && (
              <ul className="rrv-issues" role="alert">
                {shown.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
            {err && <p className="rrv-err" role="alert">{err}</p>}
          </div>
        </div>
        <div className="rrv-pfoot">
          <div className="rrv-nav">
            <button type="button" className="nl-btn nl-btn--secondary" disabled={step === 0} onClick={() => go(step - 1)}><Ic k="back" /> Back</button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="nl-btn nl-btn--primary" onClick={next}>Continue <Ic k="arrow" /></button>
            ) : (
              <button type="button" className="nl-btn nl-btn--primary" onClick={ready}>Ready <Ic k="check" /></button>
            )}
          </div>
          <p className="rrv-todo">{allClear ? "Everything the notice needs is in." : `Still to do: ${STEPS.filter((s) => issues[s.id].length).map((s) => s.title).join(", ")}.`}</p>
        </div>
      </>
    );
  };

  return createPortal(
    <div data-look="new" className="rrv nl-edge" role="dialog" aria-modal="true" aria-label="Rent increase notice">
      <div className="rrv-grid">
        <section className="rrv-left" aria-label="The notice as the tenants will read it">
          <div className="rrv-top">
            <span><Ic k="doc" /> Rent-increase notice · as the tenants will read it</span>
            <span className="rrv-jumps">
              <button type="button" onClick={() => jump("part1")}>Part 1</button>
              <button type="button" onClick={() => jump("part2a")}>Part 2a</button>
              <button type="button" onClick={() => jump("part2b")}>Part 2b</button>
              <button type="button" onClick={() => jump("part3")}>Part 3</button>
            </span>
          </div>
          {start ? <NoticePaper filled={filled} flash={flash} sheetRef={(p, el) => { sheets.current[p] = el; }} /> : <div className="rrv-paper"><div className="rrv-sheet is-wait"><span className="rrv-spin" aria-hidden /> Reading the home…</div></div>}
        </section>
        <aside className="rrv-panel">
          <div className="rrv-phead">
            <button type="button" className="rrv-back" onClick={done ? onSent : onClose} disabled={busy}><Ic k="back" /> Back to the home</button>
            <p className="nl-eyebrow">Scotland · Rent-increase notice</p>
            <h2 className="rrv-h">Rent Review</h2>
            <p className="rrv-sub">{start ? <>{start.home}. The prescribed notice under section 22(1) of the Private Housing (Tenancies) (Scotland) Act 2016.</> : " "}</p>
            {start?.demo && phase !== "done" && <p className="rrv-demo">Demo - nothing is sent from here.</p>}
          </div>
          {panel()}
        </aside>
      </div>
      <button type="button" className="rrv-x" aria-label="Close" onClick={done ? onSent : onClose} disabled={busy}><Ic k="close" size={18} /></button>
    </div>,
    document.body
  );
}

