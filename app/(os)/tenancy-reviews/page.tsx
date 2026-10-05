"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile, { toneFor } from "@/components/StatTile";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import { PressButton } from "@/components/Bits";
import type { DueReview, Review, ReviewRules } from "@/lib/tenancy-reviews";

/**
 * Tenancy reviews (1 Oct 2026). See lib/tenancy-reviews.
 *
 *   DUE   every tenancy owed a decision, latest first in lateness. While the
 *         team still works the old system this is its own list, copied
 *         across, so the figures match it.
 *   DONE  what was decided here, newest first.
 *
 * Agent copy never names the old system (James, 15 Sep).
 */

/* The outcomes, mirrored from lib/tenancy-reviews so the page needs no server import. */
const OUTCOMES = [
  { id: "increase", label: "Rent goes up", blurb: "A new rent is agreed, from a date." },
  { id: "renewed", label: "Renewed, same rent", blurb: "A new agreement at the rent they pay now." },
  { id: "no_change", label: "Left as it is", blurb: "No change this year. The tenancy carries on." },
  { id: "ending", label: "Tenancy is ending", blurb: "Notice given by either side." },
  { id: "other", label: "Something else", blurb: "Say what in the note." },
] as const;
type OutcomeId = (typeof OUTCOMES)[number]["id"];
const outcomeLabel = (id: string) => OUTCOMES.find((o) => o.id === id)?.label ?? "Reviewed";

interface Board {
  ok: boolean;
  live: boolean;
  reason?: string;
  due: DueReview[];
  done: Review[];
  rules?: ReviewRules;
  summary: { due: number; overdue: number; noDate: number; doneThisMonth: number; risesThisMonth: number } | null;
  source?: "rex-pm" | "os";
  readAt?: string | null;
  bookError?: string;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" }) : "No date";

/** "at 14:05 today", or "on 30 Sep" - when the old system's list was last copied across. */
const readWhen = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const same = d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) === new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  return same ? `at ${time} today` : `on ${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })}`;
};

/** "Fixed Term | expires 1 Jun 2026" → "Fixed term, ended 1 Jun 2026" (or "ends" while it is still ahead). */
const agreementText = (a: string) => {
  if (!a) return "";
  const [kind, rest = ""] = a.split(" | ");
  const k = kind.charAt(0) + kind.slice(1).toLowerCase();
  const m = rest.match(/expires (.+)$/i);
  if (!m) return k;
  const when = new Date(m[1]);
  const past = !Number.isNaN(when.getTime()) && when.getTime() < Date.now();
  return `${k}, ${past ? "ended" : "ends"} ${m[1]}`;
};

const money = (n: number | null) => (n == null ? "" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);

export default function TenancyReviews() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"due" | "done">("due");
  const [q, setQ] = useState("");
  const [recording, setRecording] = useState<DueReview | null>(null);

  const load = useCallback(() => {
    fetch("/api/tenancy-reviews", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setError(null); } else setError(j.error ?? "Could not read the tenancy reviews."); })
      .catch(() => setError("Could not read the tenancy reviews."));
  }, []);
  useEffect(load, [load]);

  const needle = q.trim().toLowerCase();
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);
  const due = useMemo(() => (data?.due ?? []).filter((d) => match(`${d.propertyName} ${d.locality} ${d.tenant} ${d.landlord} ${d.managedBy ?? ""}`)), [data, needle]);
  const done = useMemo(() => (data?.done ?? []).filter((r) => match(`${r.propertyName} ${r.tenant} ${r.landlord} ${r.doneBy}`)), [data, needle]);
  const s = data?.summary ?? null;

  return (
    <>
      <PageHeader
        title="Tenancy Reviews"
        blurb="Every tenancy coming up to its anniversary, and what was decided: the rent goes up, it is renewed, it is left as it is, or it is ending. Record it here and it comes off the list."
        /* Same artwork and measurements as Inspections, its neighbour in Portfolio. */
        illustration="/illustrations/houses-row.webp"
        hideArtOnPhone
        illustrationHeight={130}
        illustrationAspect={4.67}
        illustrationCrop
        lineBreak="none"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search addresses, tenants, landlords…"
      />

      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {(
          [
            ["To review", s ? String(s.due) : "•", s ? (s.noDate ? `${s.noDate} with no date set` : "open now") : "reading…", "calendar"],
            ["Already late", s ? String(s.overdue) : "•", "past the review date", "clock"],
            ["Reviewed this month", s ? String(s.doneThisMonth) : "•", "recorded here", "checklist"],
            ["Rent rises this month", s ? String(s.risesThisMonth) : "•", "agreed and recorded", "trend-up"],
          ] as const
        ).map(([k, v, hint, icon]) => (
          /* Portfolio's tile; Already late is the one that matters. */
          <StatTile key={k} label={k} value={v} hint={hint} icon={icon} tone={k === "Already late" ? toneFor(s?.overdue) : undefined} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Segmented
          className="w-full sm:w-auto sm:min-w-[260px]"
          value={tab}
          onChange={setTab}
          options={[
            { id: "due" as const, label: `To review ${due.length}`, icon: <DoodleIcon name="calendar" size={14} /> },
            { id: "done" as const, label: `Done ${done.length}`, icon: <DoodleIcon name="checklist" size={14} /> },
          ]}
        />
        {data?.source === "rex-pm" ? (
          <span className="ml-auto text-[11px] text-muted">
            Copied across from the old system{data.readAt ? ` ${readWhen(data.readAt)}` : ""}. Reviews recorded here take over from it.
          </span>
        ) : data?.rules ? (
          <span className="ml-auto text-[11px] text-muted">Every {data.rules.everyMonths} months from the last review, or from the start of the tenancy.</span>
        ) : null}
      </div>

      {error && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {data && !data.live && <p className="mt-4 text-[12.5px] text-muted">{data.reason}</p>}
      {data?.bookError && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{data.bookError}</p>}

      {!data && !error ? (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading the reviews…
        </p>
      ) : !data ? null : tab === "due" ? (
        due.length === 0 ? (
          <Empty title="Nothing to review." blurb="Every tenancy has a decision recorded, or none is coming up yet." />
        ) : (
          <section className="mt-4 rounded-[22px] border border-line/50 bg-white p-5">
            <ul className="divide-y divide-line/50">
              {due.map((d) => {
                const late = d.daysAway !== null && d.daysAway < 0;
                return (
                  <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <span className="min-w-0">
                      <span className="hand block truncate text-[13.5px]">{d.propertyName}</span>
                      <span className="block truncate text-[10.5px] text-muted">{[d.locality, d.tenant].filter(Boolean).join(" · ") || "No tenant named"}</span>
                    </span>
                    <span className="col-start-1 min-w-0 text-[11.5px] md:col-start-auto">
                      <span className="block truncate">{agreementText(d.agreement) || "Agreement not recorded"}</span>
                      <span className="block truncate text-[10.5px] text-muted">{d.rent ? `Rent ${d.rent.replace(" | ", ", ").toLowerCase()}` : "Rent not recorded"}</span>
                    </span>
                    <span className={`col-start-1 text-[12px] md:col-start-auto ${late ? "font-semibold text-accent-dark" : "text-muted"}`}>
                      {d.daysAway === null ? "No review date set" : late ? `${Math.abs(d.daysAway)} day${d.daysAway === -1 ? "" : "s"} over` : d.daysAway === 0 ? "Due today" : `Due ${day(d.dueAt)}`}
                      {d.why ? ` · ${d.why}` : ""}
                      {d.managedBy ? <span className="block text-[10.5px] font-normal text-muted">With {d.managedBy}</span> : null}
                    </span>
                    <PressButton onClick={() => setRecording(d)} className="row-span-2 rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold md:row-span-1">
                      Record review
                    </PressButton>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      ) : done.length === 0 ? (
        <Empty title="Nothing recorded yet." blurb="Record a review from the list and it shows here, with what was decided." />
      ) : (
        <section className="mt-4 rounded-[22px] border border-line/50 bg-white p-5">
          <ul className="divide-y divide-line/50">
            {done.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
                <span className="min-w-0">
                  <span className="hand block truncate text-[13.5px]">{r.propertyName}</span>
                  <span className="block truncate text-[10.5px] text-muted">{r.tenant || "No tenant named"}</span>
                </span>
                <span className="col-start-1 min-w-0 text-[12px] md:col-start-auto">
                  <Pill tone={r.outcome === "increase" ? "accent" : "neutral"}>{outcomeLabel(r.outcome)}</Pill>
                  {r.outcome === "increase" && r.newRent != null ? (
                    <span className="ml-2 text-[11.5px]">
                      {money(r.newRent)} a {r.newRentPeriod === "week" ? "week" : "month"}{r.newRentFrom ? ` from ${day(r.newRentFrom)}` : ""}
                    </span>
                  ) : null}
                  {r.note ? <span className="mt-1 block truncate text-[10.5px] text-muted">{r.note}</span> : null}
                </span>
                <span className="text-right text-[11px] text-muted">
                  {day(r.doneAt)}
                  <span className="block">{r.doneBy}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recording && <RecordSheet due={recording} onClose={() => setRecording(null)} onSaved={() => { setRecording(null); setTab("done"); load(); }} />}
    </>
  );
}

function Empty({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mt-6 rounded-[22px] border border-dashed border-line/60 bg-white p-8 text-center">
      <p className="hand text-[20px]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[12.5px] text-muted">{blurb}</p>
    </div>
  );
}

/** Recording a review: what was decided, and the new rent if it went up. */
function RecordSheet({ due, onClose, onSaved }: { due: DueReview; onClose: () => void; onSaved: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeId | null>(null);
  const [rent, setRent] = useState("");
  const [period, setPeriod] = useState<"month" | "week">(/week/i.test(due.rent) ? "week" : "month");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const rentOk = outcome !== "increase" || Number(rent.replace(/[£,\s]/g, "")) > 0;
  const noteOk = outcome !== "other" || note.trim().length > 0;
  const canSave = !!outcome && rentOk && noteOk && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/tenancy-reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rexpmTaskId: due.taskId ?? null, osPropertyId: due.osPropertyId, rexPropertyId: due.propertyId,
        propertyName: due.propertyName, tenant: due.tenant, landlord: due.landlord, dueOn: due.dueOn,
        outcome, rentBefore: due.rent,
        newRent: outcome === "increase" ? Number(rent.replace(/[£,\s]/g, "")) : null,
        newRentPeriod: period, newRentFrom: outcome === "increase" && from ? from : null, note,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg(r?.error ?? "Could not record it. Try again.");
    onSaved();
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Record the review"
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name="file-contract" size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] leading-tight">Record the Review</h3>
            <p className="mt-0.5 truncate text-[12px] text-muted">{due.propertyName}{due.tenant ? ` · ${due.tenant}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30 disabled:opacity-40">
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-panel p-3 text-[11.5px]">
            <span><span className="block text-[9.5px] font-bold uppercase tracking-wider text-muted">Agreement</span>{agreementText(due.agreement) || "Not recorded"}</span>
            <span><span className="block text-[9.5px] font-bold uppercase tracking-wider text-muted">Rent now</span>{due.rent ? due.rent.replace(" | ", ", ") : "Not recorded"}</span>
          </div>

          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold">What was decided?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOutcome(o.id)}
                  aria-pressed={outcome === o.id}
                  className={`rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${outcome === o.id ? "border-[var(--brown)] bg-accent-soft/50" : "border-line/80 hover:border-ink/30"}`}
                >
                  <span className="block text-[12.5px] font-semibold">{o.label}</span>
                  <span className="block text-[10.5px] text-muted">{o.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {outcome === "increase" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <label className="text-[11.5px] font-semibold">
                New rent
                <span className="mt-1 flex items-center rounded-xl border border-line/80 bg-panel px-3">
                  <span className="text-muted">£</span>
                  <input inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="1,250" className="w-full bg-transparent px-1.5 py-2 text-[13px] font-normal outline-none" />
                </span>
              </label>
              <label className="text-[11.5px] font-semibold">
                Per
                <select value={period} onChange={(e) => setPeriod(e.target.value as "month" | "week")} className="mt-1 block rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px] font-normal">
                  <option value="month">Month</option>
                  <option value="week">Week</option>
                </select>
              </label>
              <label className="text-[11.5px] font-semibold">
                From
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px] font-normal" />
              </label>
            </div>
          )}

          <label className="text-[11.5px] font-semibold">
            Note {outcome === "other" ? "" : <span className="font-normal text-muted">(optional)</span>}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What the landlord and tenant agreed, and anything to follow up." className="mt-1 block w-full rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px] font-normal" />
          </label>

          {msg && <p className="rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">{msg}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-3.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            <DoodleIcon name="checklist" size={13} />
            {busy ? "Saving…" : "Save the review"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40">
            Not now
          </button>
          <span className="ml-auto text-[11px] text-muted">{!outcome ? "Pick what was decided." : !rentOk ? "Put in the new rent." : !noteOk ? "Say what in the note." : "It comes off the list once saved."}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
