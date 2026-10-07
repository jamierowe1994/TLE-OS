"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import SaveChip, { SaveScopeProvider, trackSave, useSaveScope } from "@/components/SaveChip";
import { GREEN, RED } from "@/components/compliance-desk/CheckRow";
import { toast } from "@/lib/toast";
import {
  HEADER, NO_RISKS, SPECS, STATUS_LABEL, agentCanEdit, dayLabel, increaseOf, missingFor, money, pounds, s13Warnings, todayIso,
  type Answers, type CheckLine, type FieldLine, type Line, type Notice, type NoticeFile, type NoticeKind, type Section,
} from "@/lib/section-notices-spec";

/**
 * MICHAEL'S CHECKLIST, ON THE HOME'S FILE (7 Oct 2026).
 *
 * James: "They would upload all of the landlord details. You can auto-fill out
 * certain things, but still allow them to overwrite it... They would need to
 * tick off manually all of these things... Once they're all ticked, once the
 * dates are put in and all of the things on there, we could then get it to
 * submit it."
 *
 * So: the header arrives filled in from the home's record and says so, and
 * any of it can be typed over. Every box is ticked by hand, one at a time -
 * nothing here ticks itself. A line that says a document is uploaded takes the
 * file right there on the line. Progress is counted up ("31 of 44 done") and
 * Submit waits for the last one; "Next to do" jumps to it. It saves as it
 * goes, from the first change, so closing it loses nothing.
 *
 * Once submitted it is fixed and shows where it is: with compliance, returned
 * (with Michael's words, and editable again), approved, declined or served.
 * Nothing on this screen serves a notice; compliance does that.
 */

export interface HomeFacts {
  listingId: string;
  propertyId: string | null;
  label: string;
  test: boolean;
}

const card = "rounded-[20px] border border-line/60 bg-white p-4 sm:p-5";
const label = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const field = "w-full rounded-xl border border-line/80 bg-page px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink/40 disabled:bg-panel/60 disabled:text-ink/80";

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line bg-white"}`}>
      {on && (
        <svg aria-hidden width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export default function NoticeForm({
  kind, home, notice: initial, prefill, agentName, onClose, onChange,
}: {
  kind: NoticeKind;
  home: HomeFacts;
  /** The stored notice, or null for a fresh one that is not saved until the first change. */
  notice: Notice | null;
  /** What the home's record fills in: the header and a few lines. */
  prefill: Answers;
  /** Whoever is signed in: the name on the declaration. */
  agentName: string;
  onClose: () => void;
  onChange: (n: Notice) => void;
}) {
  const spec = SPECS[kind];
  const [notice, setNotice] = useState<Notice | null>(initial);
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? prefill);
  const [shown, setShown] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const saves = useSaveScope(notice?.id ?? "new");

  const editable = !notice || agentCanEdit(notice.status);
  const files = notice?.files ?? [];

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  /* ── saving: the first change makes the record, the rest update it ── */
  const idRef = useRef<string | null>(initial?.id ?? null);
  const creating = useRef<Promise<string | null> | null>(null);
  const pending = useRef<Answers | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((n: Notice) => {
    idRef.current = n.id;
    setNotice(n);
    onChange(n);
  }, [onChange]);

  const ensureId = useCallback(async (a: Answers): Promise<string | null> => {
    if (idRef.current) return idRef.current;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const { ok, body } = await trackSave<{ notice?: Notice; existing?: boolean }>(
        saves.reporter,
        spec.button,
        () => fetch("/api/section-notices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, listingId: home.listingId, propertyId: home.propertyId, propertyLabel: home.label, answers: a, test: home.test }),
        }),
        { retry: false }
      );
      creating.current = null;
      if (!ok || !body?.notice) return null;
      /* Somebody else had one open on this home already: theirs is the one. */
      if (body.existing) {
        setAnswers(body.notice.answers);
        toast(`There was already a ${spec.short} open on this home - this is it.`);
      }
      adopt(body.notice);
      return body.notice.id;
    })();
    return creating.current;
  }, [adopt, home, kind, saves.reporter, spec.button, spec.short]);

  const flush = useCallback((): boolean => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const a = pending.current;
    if (!a) return false;
    pending.current = null;
    void (async () => {
      if (!idRef.current) {
        await ensureId(a);
        return;
      }
      const id = idRef.current;
      const { ok, body } = await trackSave<{ notice?: Notice }>(saves.reporter, spec.button, () =>
        fetch(`/api/section-notices/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: a }),
          keepalive: JSON.stringify(a).length < 60_000,
        })
      );
      if (ok && body?.notice) { setNotice(body.notice); onChange(body.notice); }
    })();
    return true;
  }, [ensureId, onChange, saves.reporter, spec.button]);

  useEffect(() => saves.reporter.waiting(flush), [saves.reporter, flush]);
  useEffect(() => () => void flush(), [flush]);

  const change = useCallback((fn: (a: Answers) => Answers) => {
    if (!editable) return;
    setAnswers((prev) => {
      const next = fn(prev);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
      return next;
    });
  }, [editable, flush]);

  const setField = (id: string, v: string) =>
    change((a) => ({ ...a, fields: { ...a.fields, [id]: v }, auto: a.auto.filter((x) => x !== id) }));
  const putBack = (id: string) =>
    change((a) => ({ ...a, fields: { ...a.fields, [id]: prefill.fields[id] ?? "" }, auto: [...a.auto.filter((x) => x !== id), id] }));
  const toggle = (id: string, riskLines?: string[]) =>
    change((a) => {
      const checks = { ...a.checks };
      if (checks[id]) delete checks[id];
      else checks[id] = true;
      /* None of these apply, or some do: never both. */
      if (riskLines && checks[id]) {
        if (id === NO_RISKS) for (const r of riskLines) delete checks[r];
        else delete checks[NO_RISKS];
      }
      return { ...a, checks };
    });

  const close = () => {
    flush();
    setShown(false);
    setTimeout(onClose, 280);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── files ── */
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of files) if (f.side === "agent") out[f.lineId] = (out[f.lineId] ?? 0) + 1;
    return out;
  }, [files]);

  /* An array, not the input's FileList: clearing the input after a pick
     empties that list before the first await is over. */
  async function upload(lineId: string, list: File[]) {
    if (!list.length) return;
    setBusyLine(lineId);
    try {
      const id = await ensureId(pending.current ?? answers);
      if (!id) return;
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("line", lineId);
        const { ok, body } = await trackSave<{ notice?: Notice }>(saves.reporter, file.name, () =>
          fetch(`/api/section-notices/${encodeURIComponent(id)}/files`, { method: "POST", body: fd }), { retry: false });
        if (ok && body?.notice) { setNotice(body.notice); onChange(body.notice); }
      }
    } finally {
      setBusyLine(null);
    }
  }

  async function unfile(f: NoticeFile) {
    if (!notice) return;
    const { ok, body } = await trackSave<{ notice?: Notice }>(saves.reporter, `Removing ${f.name}`, () =>
      fetch(`/api/section-notices/${encodeURIComponent(notice.id)}/files?file=${encodeURIComponent(f.id)}`, { method: "DELETE" }), { retry: false });
    if (ok && body?.notice) { setNotice(body.notice); onChange(body.notice); }
  }

  /* ── where it stands ── */
  const missing = useMemo(() => missingFor(spec, answers, counts), [spec, answers, counts]);
  const total = useMemo(() => {
    let n = HEADER.length + spec.declaration.length + 1;
    for (const sec of spec.sections) {
      if (sec.risk) { n += 1 + (sec.lines.some((l) => l.type === "check" && answers.checks[l.id]) ? 1 : 0); continue; }
      for (const l of sec.lines) {
        if (l.type === "field" ? !l.optional && !l.computed : !l.optional) n += 1;
        if (l.type === "check" && l.evidence && answers.checks[l.id]) n += 1;
      }
    }
    if (kind === "s8" && ["rent_statement", "arrears_checked"].some((id) => answers.checks[id])) n += 1;
    return n;
  }, [spec, answers.checks, kind]);
  const done = Math.max(0, Math.min(total, total - missing.length));
  const warnings = kind === "s13" ? s13Warnings(answers) : [];

  const jump = (id: string) => {
    const el = document.getElementById(`nl-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
    const input = el.querySelector<HTMLElement>("input, textarea, button");
    setTimeout(() => input?.focus({ preventScroll: true }), 350);
  };

  async function submit() {
    if (missing.length) { jump(missing[0].id); return; }
    setSending(true);
    try {
      flush();
      const id = await ensureId(answers);
      if (!id) return;
      /* The last change is stored before the submission is checked. */
      await fetch(`/api/section-notices/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }),
      });
      const r = await fetch(`/api/section-notices/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; notice?: Notice } | null;
      if (!r.ok || !j?.ok || !j.notice) { toast(j?.error ?? "Not submitted. Try again.", "bad"); return; }
      setNotice(j.notice);
      setAnswers(j.notice.answers);
      onChange(j.notice);
      toast(`${spec.short} submitted to compliance`);
    } finally {
      setSending(false);
    }
  }

  async function withdraw() {
    if (!notice) { close(); return; }
    if (!window.confirm(notice.status === "draft" ? "Throw this draft away?" : "Take this back from compliance? It will not be served.")) return;
    const r = await fetch(`/api/section-notices/${encodeURIComponent(notice.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdraw" }),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; notice?: Notice } | null;
    if (!r.ok || !j?.ok || !j.notice) { toast(j?.error ?? "Not withdrawn.", "bad"); return; }
    onChange(j.notice);
    toast("Withdrawn");
    close();
  }

  /* ── drawing ── */
  const fileChips = (lineId: string) => {
    const mine = files.filter((f) => f.side === "agent" && f.lineId === lineId);
    if (!mine.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mine.map((f) => (
          <span key={f.id} className="flex max-w-full items-center gap-1 rounded-full border border-line/70 bg-page py-1 pl-2.5 pr-1 text-[11.5px]">
            <DoodleIcon name="doc" size={12} className="shrink-0 text-accent-dark" />
            <a href={f.url} target="_blank" rel="noreferrer" className="truncate hover:underline" title={`${f.name} · ${kb(f.sizeBytes)} · ${f.byName}`}>{f.name}</a>
            {editable && (
              <button type="button" onClick={() => void unfile(f)} aria-label={`Remove ${f.name}`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line/50 hover:text-ink">✕</button>
            )}
          </span>
        ))}
      </div>
    );
  };

  const attach = (lineId: string, text = "Attach") =>
    editable ? (
      <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${busyLine === lineId ? "border-line/70 text-muted" : "border-line/80 hover:border-ink/40"}`}>
        {busyLine === lineId ? <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" /> : <DoodleIcon name="upload" size={12} />}
        {busyLine === lineId ? "Uploading" : text}
        <input type="file" multiple className="sr-only" disabled={busyLine !== null} onChange={(e) => { void upload(lineId, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </label>
    ) : null;

  const checkRow = (l: CheckLine, riskLines?: string[]) => {
    const on = Boolean(answers.checks[l.id]);
    const needsFile = l.evidence && on && !(counts[l.id] > 0);
    return (
      <li key={l.id} id={`nl-${l.id}`} className={`rounded-xl px-2 py-2 transition-colors ${flash === l.id ? "bg-accent-soft" : ""}`}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            disabled={!editable}
            onClick={() => toggle(l.id, riskLines)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
            aria-pressed={on}
          >
            <Tick on={on} />
            <span className={`text-[13.5px] leading-snug ${on ? "text-ink" : "text-ink/80"}`}>
              {l.label}
              {!l.optional && !on && editable && <span className="ml-1 text-accent-dark" title="Needed before it can be submitted">*</span>}
            </span>
          </button>
          {l.evidence && attach(l.id, counts[l.id] ? "Add another" : "Attach")}
        </div>
        {needsFile && <p className="ml-8 mt-1 text-[11.5px] font-semibold text-accent-dark">Attach the file this line says is uploaded.</p>}
        {l.evidence && <div className="ml-8">{fileChips(l.id)}</div>}
      </li>
    );
  };

  const fieldRow = (l: FieldLine) => {
    const v = answers.fields[l.id] ?? "";
    const auto = answers.auto.includes(l.id) && v;
    const changed = !answers.auto.includes(l.id) && prefill.fields[l.id] && v !== prefill.fields[l.id];
    if (l.computed) {
      const inc = increaseOf(answers);
      const cur = money(answers.fields.current_rent);
      return (
        <li key={l.id} id={`nl-${l.id}`} className="px-2 py-2">
          <p className={label}>{l.label.replace(/ £$/, "")}</p>
          <p className="figures mt-1 text-[16px] font-bold">
            {inc == null ? <span className="text-[13px] font-normal text-muted">Worked out from the two rents above</span> : <>{pounds(inc)}{cur ? <span className="ml-2 text-[12px] font-semibold text-muted">{inc >= 0 ? "+" : ""}{((inc / cur) * 100).toFixed(1)}% a month</span> : null}</>}
          </p>
        </li>
      );
    }
    const input =
      l.input === "longtext" ? (
        <textarea value={v} disabled={!editable} onChange={(e) => setField(l.id, e.target.value)} rows={3} className={`${field} mt-1.5 resize-y`} />
      ) : l.input === "money" ? (
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-muted">£</span>
          <input inputMode="decimal" value={v.replace(/^£/, "")} disabled={!editable} onChange={(e) => setField(l.id, e.target.value)} className={`${field} figures pl-7`} placeholder="0.00" />
        </div>
      ) : (
        <input type={l.input === "date" ? "date" : "text"} value={v} disabled={!editable} onChange={(e) => setField(l.id, e.target.value)} className={`${field} mt-1.5`} />
      );
    return (
      <li key={l.id} id={`nl-${l.id}`} className={`rounded-xl px-2 py-2 transition-colors ${flash === l.id ? "bg-accent-soft" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className={label}>
            {l.label.replace(/ £$/, "")}
            {!l.optional && editable && !v.trim() && <span className="ml-1 text-accent-dark">*</span>}
          </p>
          {auto && editable && <span className="text-[10.5px] font-semibold text-[#56634a]">{l.id === "submitted" ? "Today, unless you change it" : "From the record - check it"}</span>}
          {changed && editable && <button type="button" onClick={() => putBack(l.id)} className="text-[10.5px] font-semibold text-muted underline hover:text-ink">Put back the record&apos;s</button>}
        </div>
        {input}
        {l.input === "money" && v && money(v) == null && <p className="mt-1 text-[11.5px] font-semibold text-accent-dark">That is not a sum of money.</p>}
      </li>
    );
  };

  const sectionCard = (sec: Section, n: number) => {
    const riskLines = sec.risk ? sec.lines.filter((l): l is CheckLine => l.type === "check").map((l) => l.id) : undefined;
    const anyRisk = Boolean(riskLines?.some((id) => answers.checks[id]));
    return (
      <section key={sec.id} className={card}>
        <div className="flex items-baseline gap-2.5">
          <span className="figures text-[15px] font-bold text-accent-dark">{n}</span>
          <h3 className="text-[16px] leading-tight">{sec.title}</h3>
        </div>
        {sec.note && <p className="mt-1 text-[12.5px] text-muted">{sec.note}</p>}
        {sec.risk && (
          <>
            <ul className="mt-2">{checkRow({ type: "check", id: NO_RISKS, label: "None of these apply" }, riskLines)}</ul>
            <p className="mb-1 mt-2 px-2 text-[11.5px] text-muted">Or tick any that do:</p>
          </>
        )}
        <ul className={sec.risk ? "grid gap-x-3 sm:grid-cols-2" : "mt-2 divide-y divide-line/30"}>
          {sec.lines.map((l: Line) => {
            if (sec.risk && l.type === "field") return null;
            return l.type === "check" ? checkRow(l, riskLines) : fieldRow(l);
          })}
        </ul>
        {sec.risk && anyRisk && (
          <div className="mt-3">
            <p className={`rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug ${RED}`}>
              <span className="font-semibold">Something here applies.</span> Give the full details below. Compliance sees this highlighted before anything is approved.
            </p>
            <ul className="mt-1">{fieldRow({ type: "field", id: "risk_details", label: "Risk check details", input: "longtext" })}</ul>
          </div>
        )}
        {sec.id === "rent" && warnings.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {warnings.map((w) => (
              <li key={w} className={`rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug ${RED}`}><span className="font-semibold">Check this: </span>{w}</li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  const status = notice?.status ?? "draft";
  const banner = (() => {
    if (!notice) return null;
    const by = notice.decidedBy || "Compliance";
    const when = notice.decidedAt ? dayLabel(notice.decidedAt.slice(0, 10)) : "";
    if (status === "submitted") return { tone: GREEN, head: `With compliance since ${dayLabel(notice.submittedAt?.slice(0, 10))}.`, body: "Do not serve it. Compliance checks it, decides, and serves it through PayProp once it is approved. You will see their answer in your bell." };
    if (status === "returned") return { tone: RED, head: `${by} sent this back on ${when}.`, body: notice.review.comments };
    if (status === "approved") return { tone: GREEN, head: `Approved to serve by ${by} on ${when}.`, body: `Compliance serves it through PayProp.${notice.review.comments ? ` ${notice.review.comments}` : ""}` };
    if (status === "legal") return { tone: RED, head: `${by} referred this for legal review on ${when}.`, body: notice.review.comments };
    if (status === "declined") return { tone: RED, head: `Declined by ${by} on ${when}. Do not serve it.`, body: notice.review.comments };
    if (status === "served") return { tone: GREEN, head: `Served on ${dayLabel(notice.postService.servedOn)}${notice.postService.method ? `, ${notice.postService.method.toLowerCase()}` : ""}.`, body: "" };
    return null;
  })();

  const decl = (
    <section className={card}>
      <h3 className="text-[16px] leading-tight">Agent Declaration</h3>
      <ul className="mt-2 divide-y divide-line/30">{spec.declaration.map((l) => checkRow(l))}</ul>
      <div className="mt-3 grid gap-3 px-2 sm:grid-cols-3">
        <div>
          <p className={label}>Agent name</p>
          <p className="mt-2 text-[13.5px] font-semibold">{notice && !editable ? notice.agentName : agentName}</p>
        </div>
        <div id="nl-signature" className={`rounded-xl transition-colors ${flash === "signature" ? "bg-accent-soft" : ""}`}>
          <p className={label}>Signature{editable && !answers.signature.trim() && <span className="ml-1 text-accent-dark">*</span>}</p>
          <input
            value={answers.signature}
            disabled={!editable}
            onChange={(e) => change((a) => ({ ...a, signature: e.target.value }))}
            placeholder="Type your full name"
            className={`${field} mt-1.5 italic`}
          />
        </div>
        <div>
          <p className={label}>Date</p>
          <p className="mt-2 text-[13.5px] font-semibold">{notice?.submittedAt && !editable ? dayLabel(notice.submittedAt.slice(0, 10)) : dayLabel(todayIso())}</p>
        </div>
      </div>
    </section>
  );

  /* z-[195]: above Steve and Report a problem (189-191), whose corner the sheet's own buttons share. */
  const body = (
    <div className="fixed inset-0 z-[195]">
      <button aria-label="Close" onClick={close} className={`absolute inset-0 cursor-default bg-ink/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[380ms] sm:rounded-l-2xl lg:max-w-[880px] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        role="dialog"
        aria-label={spec.title}
      >
        <SaveScopeProvider scope={saves}>
          {/* ── head ── */}
          <div className="shrink-0 border-b border-line/70 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark">{spec.short} · {spec.form}</p>
                <h2 className="hand mt-1 text-[23px] leading-tight">{spec.button}</h2>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">{home.label}{home.test ? " · test home" : ""}</p>
              </div>
              <div className="flex items-center justify-end gap-1.5 sm:shrink-0">
                {notice && <span className={`mr-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${status === "returned" || status === "declined" || status === "legal" ? RED : status === "draft" ? "bg-panel text-muted" : GREEN}`}>{STATUS_LABEL[status]}</span>}
                {editable && <SaveChip scope={saves} className="mr-0.5" />}
                <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">✕</button>
              </div>
            </div>
          </div>

          {/* ── the checklist ── */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {banner && (
              <div className={`rounded-[18px] px-4 py-3.5 text-[13px] leading-snug ${banner.tone}`}>
                <p className="font-semibold">{banner.head}</p>
                {banner.body && <p className="mt-1 whitespace-pre-line">{banner.body}</p>}
                {status === "returned" && <p className="mt-1.5 text-[12px] opacity-90">Put it right below and submit it again.</p>}
              </div>
            )}

            <section className={card}>
              <p className="text-[13.5px] leading-snug">{spec.purpose}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{spec.intro}</p>
            </section>

            <section className={card}>
              <h3 className="text-[16px] leading-tight">The Home</h3>
              <ul className="mt-2 grid gap-x-3 sm:grid-cols-2">
                {HEADER.map((h) => fieldRow(h))}
              </ul>
            </section>

            {spec.sections.map((s, i) => sectionCard(s, i + 1))}

            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[16px] leading-tight">Other Supporting Documents</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">Anything else compliance should see. Optional.</p>
                </div>
                {attach("other", "Attach")}
              </div>
              {fileChips("other")}
              {!editable && !counts.other && <p className="mt-2 text-[12.5px] text-muted">None.</p>}
            </section>

            {decl}

            {notice && notice.history.length > 0 && (
              <details className="px-1 text-[12px] text-muted">
                <summary className="cursor-pointer select-none underline-offset-2 hover:underline">History</summary>
                <ul className="mt-2 space-y-1">
                  {notice.history.map((h, i) => (
                    <li key={i}>
                      {new Date(h.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.what}, {h.by}{h.note ? `: ${h.note}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="px-1 pb-2 text-[11.5px] text-muted">{spec.footer[0]}</p>
          </div>

          {/* ── foot ── */}
          <div className="shrink-0 border-t border-line/70 bg-page px-4 py-3 sm:px-6">
            {editable ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[min(100%,220px)] flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-semibold">{done} of {total} done</span>
                    {missing.length > 0 && (
                      <button type="button" onClick={() => jump(missing[0].id)} className="min-w-0 truncate text-right text-muted underline-offset-2 hover:text-ink hover:underline">
                        Next to do: {missing[0].label.replace(/\.$/, "")}
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/50">
                    <div className="h-full rounded-full bg-accent-dark transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {notice && (
                    <button type="button" onClick={() => void withdraw()} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink">
                      {status === "draft" ? "Throw away" : "Withdraw"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={sending || busyLine !== null}
                    className={`rounded-full px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity ${missing.length ? "bg-ink/35" : "bg-accent-dark hover:opacity-90"} disabled:opacity-50`}
                    title={missing.length ? `${missing.length} still to do` : undefined}
                  >
                    {sending ? "Submitting…" : status === "returned" ? "Send back to compliance" : "Submit to compliance"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {status === "submitted" && (
                  <button type="button" onClick={() => void withdraw()} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink">Withdraw</button>
                )}
                {notice && (
                  <a href={`/api/section-notices/${encodeURIComponent(notice.id)}/pdf`} className="inline-flex items-center gap-1.5 rounded-full border border-ink/80 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-ink hover:text-page">
                    <DoodleIcon name="doc" size={13} /> Download PDF
                  </a>
                )}
                <button type="button" onClick={close} className="rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">Done</button>
              </div>
            )}
          </div>
        </SaveScopeProvider>
      </aside>
    </div>
  );

  /* Portalled: the property drawer is transformed, which would trap a fixed panel. */
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
