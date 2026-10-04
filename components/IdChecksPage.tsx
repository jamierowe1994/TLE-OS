"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PreTenancyHero from "@/components/pretenancy/Hero";
import { GREEN, RED } from "@/components/compliance-desk/CheckRow";
import type { IdCheck } from "@/lib/id-checks";

/**
 * RIGHT TO RENT: the office's screen (4 Oct 2026, lib/id-checks).
 *
 * Three things, in the order the work comes: the follow-up checks that are
 * owed, a share code to check, and every check on file with its document one
 * press away. Shared by the pre-tenancy and compliance workspaces - one
 * office, one list.
 */

const CHECKER = "https://www.gov.uk/view-right-to-rent";
const card = "rounded-[22px] border border-line/70 bg-card";
const pretty = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const daysTo = (ymd: string) => Math.round((new Date(`${ymd}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);

function lastsLine(c: IdCheck): string {
  if (c.noTimeLimit) return "No time limit";
  if (c.rightUntil) return `Until ${pretty(c.rightUntil)}${c.followUpOn ? ` · follow-up check by ${pretty(c.followUpOn)}` : ""}`;
  return "How long was not recorded";
}

export default function IdChecksPage() {
  const [checks, setChecks] = useState<IdCheck[] | null>(null);
  const [due, setDue] = useState<IdCheck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback((term = "") => {
    fetch(`/api/id-checks${term ? `?q=${encodeURIComponent(term)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; checks?: IdCheck[]; due?: IdCheck[]; error?: string }) => {
        if (!j.ok) return setError(j.error ?? "The checks could not be read.");
        setError(null);
        setChecks(j.checks ?? []);
        setDue(j.due ?? []);
      })
      .catch(() => setError("The checks could not be read."));
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => {
    const t = window.setTimeout(() => load(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-5 pb-8">
      <PreTenancyHero
        eyebrow="Right to Rent"
        title="ID Checks"
        blurb="Every Right to Rent check on file: the IDs agents photograph at viewings, and the share codes the office checks online. A right with a time limit owes a follow-up check, and it is listed here before it is due."
      />
      {error && <p className="rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── follow-ups owed ── */}
        <section className={`fade-up p-5 ${due.length ? "rounded-[22px] bg-accent-soft" : card}`}>
          <h2 className="text-[17px] font-bold leading-tight">{due.length ? `${due.length} follow-up check${due.length === 1 ? "" : "s"} due` : "Follow-up checks"}</h2>
          <p className="mt-0.5 text-[12px] text-muted">Time-limited rights, due within four weeks or already past. Check again before the date to keep the landlord covered.</p>
          {checks === null ? (
            <p className="mt-4 text-[13px] text-muted">Reading the checks…</p>
          ) : due.length === 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${GREEN}`}><span className="h-2 w-2 rounded-full bg-[#56634a]" /></span>
              <p className="text-[13px] text-muted">Nothing due in the next four weeks.</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-[#9d4340]/10">
              {due.map((c) => {
                const d = daysTo(c.followUpOn!);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium">{c.name}</span>
                      <span className="block truncate text-[12px] text-muted">{c.property || "No property recorded"} · right until {c.rightUntil ? pretty(c.rightUntil) : "?"}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold ${d < 0 ? RED : "bg-white/80 text-[#9d4340]"}`}>
                      {d < 0 ? `${-d} days late` : d === 0 ? "Due today" : `Due in ${d} days`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <ShareCodeForm onSaved={() => load(q.trim())} />
      </div>

      {/* ── everything on file ── */}
      <section className={`${card} fade-up p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold leading-tight">On file</h2>
            <p className="mt-0.5 text-[12px] text-muted">Newest first. Open a file to see the ID or the Home Office result.</p>
          </div>
          <label className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
            <DoodleIcon name="search" size={13} className="shrink-0 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or address…" className="w-48 bg-transparent text-[12.5px] outline-none placeholder:text-muted/70" />
          </label>
        </div>
        {checks === null ? (
          <p className="mt-4 text-[13px] text-muted">Reading the checks…</p>
        ) : checks.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted">{q.trim() ? "Nothing matches." : "No checks yet. They arrive here when an agent scans an ID on the phone, or when a share code is checked above."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line/50">
            {checks.map((c) => (
              <li key={c.id} className="grid grid-cols-1 gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{c.name}</span>
                  <span className="block text-[12px] text-muted">
                    {c.docType}
                    {c.method === "share_code" && c.shareCodeEnd ? ` ending ${c.shareCodeEnd}` : c.pages > 1 ? ` · ${c.pages} pages` : ""}
                    {c.property ? ` · ${c.property}` : ""}
                  </span>
                </span>
                <span className="min-w-0 text-[12px]">
                  <span className="block">{c.method === "share_code" ? "Checked online" : "Seen in person"} by {c.by || "somebody"}</span>
                  <span className="block text-muted">{new Date(c.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{c.likeness ? " · likeness ticked" : ""}</span>
                </span>
                <span className="min-w-0">
                  <span className={`inline-block rounded-full px-3 py-1 text-[11.5px] font-semibold ${c.noTimeLimit ? GREEN : c.rightUntil ? "bg-page text-muted" : RED}`}>{lastsLine(c)}</span>
                </span>
                {!c.hasFile ? <span /> : (
                  <a href={`/api/id-checks/file?id=${encodeURIComponent(c.id)}`} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40">
                    <DoodleIcon name="doc" size={13} className="text-accent-dark" /> Open the file
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A share code, checked on GOV.UK by a person, and the result kept. */
function ShareCodeForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [property, setProperty] = useState("");
  const [code, setCode] = useState("");
  const [likeness, setLikeness] = useState(false);
  const [lasts, setLasts] = useState<"" | "none" | "until">("");
  const [until, setUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.set("name", name);
    form.set("property", property);
    form.set("shareCode", code);
    form.set("likeness", likeness ? "yes" : "no");
    form.set("lasts", lasts);
    form.set("rightUntil", until);
    if (file) form.set("file", file);
    const j = await fetch("/api/id-checks", { method: "POST", body: form }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!j?.ok) return setMsg({ ok: false, text: j?.error ?? "That did not save." });
    setMsg({ ok: true, text: `${name.trim()}'s share code check is on file.` });
    setName(""); setProperty(""); setCode(""); setLikeness(false); setLasts(""); setUntil(""); setFile(null);
    onSaved();
  };

  const field = "w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px] outline-none focus:border-ink/40";
  return (
    <section className={`${card} fade-up p-5`}>
      <h2 className="text-[17px] font-bold leading-tight">Check a share code</h2>
      <p className="mt-0.5 text-[12px] text-muted">For anybody without a British or Irish passport. Open the GOV.UK checker, put in their share code and date of birth, look at the photo, and save the result page as a PDF.</p>
      <a href={CHECKER} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40">
        Open the GOV.UK checker <DoodleIcon name="trend-up" size={12} />
      </a>
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" className={field} />
        <input value={property} onChange={(e) => setProperty(e.target.value)} placeholder="The property (if known)" className={field} />
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Share code, e.g. W4X 7RT 9KP" className={`${field} figures tracking-wider`} maxLength={13} />
        <button type="button" onClick={() => fileRef.current?.click()} className={`${field} truncate text-left ${file ? "" : "text-muted"}`}>
          {file ? file.name : "Attach the result page (PDF)"}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">They can rent:</span>
        {(
          [
            ["none", "With no time limit"],
            ["until", "Until a date"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setLasts(k)} className={`rounded-full px-3.5 py-1.5 font-semibold ${lasts === k ? "bg-ink text-page" : "border border-line/80 text-muted"}`}>
            {label}
          </button>
        ))}
        {lasts === "until" && <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-xl border border-line/80 bg-page px-2.5 py-1.5 text-[12.5px]" />}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-snug">
        <input type="checkbox" checked={likeness} onChange={(e) => setLikeness(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-dark)]" />
        <span>The photo on the Home Office result is this person - I saw them in person or on a video call.</span>
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
          {busy ? "Saving…" : "Save the check"}
        </button>
        {msg && <span className={`text-[12.5px] ${msg.ok ? "text-[#56634a]" : "text-[#9d4340]"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
