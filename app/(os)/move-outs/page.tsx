"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile, { toneFor } from "@/components/StatTile";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import { PressButton } from "@/components/Bits";
import type { MoveOut, OpenMoveOut } from "@/lib/move-outs";

/**
 * Move-outs (2 Oct 2026). See lib/move-outs.
 *
 *   MOVING OUT  every tenancy that is ending, the late ones first. While the
 *               team still works the old system this is its own list,
 *               copied across, so the figures match it.
 *   DONE        what was closed off here, newest first.
 *
 * Agent copy never names the old system (James, 15 Sep).
 */

/* Mirrored from lib/move-outs so the page needs no server import. */
const OUTCOMES = [
  { id: "moved_out", label: "Moved out", blurb: "The tenants have gone. Say the day." },
  { id: "staying", label: "Staying after all", blurb: "Notice withdrawn. The tenancy carries on." },
  { id: "other", label: "Something else", blurb: "Say what in the note." },
] as const;
type OutcomeId = (typeof OUTCOMES)[number]["id"];
const outcomeLabel = (id: string) => OUTCOMES.find((o) => o.id === id)?.label ?? "Closed";

const STEPS = [
  { id: "checkout", label: "Check-out done" },
  { id: "keys", label: "Keys back" },
  { id: "meters", label: "Meters read" },
  { id: "deposit", label: "Deposit settled" },
  { id: "relet", label: "Back on the market" },
] as const;

interface Board {
  ok: boolean;
  live: boolean;
  reason?: string;
  open: OpenMoveOut[];
  done: MoveOut[];
  summary: { open: number; overdue: number; next30: number; noDate: number; followUp: number; inProgress: number; doneThisMonth: number } | null;
  readAt?: string | null;
  bookError?: string;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" }) : "No date";

/** "at 14:05 today", or "on 30 Sep" - when the old system's list was last copied across. */
const readWhen = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const same = d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) === new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  return same ? `at ${time} today` : `on ${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })}`;
};

const todayLondon = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export default function MoveOuts() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [q, setQ] = useState("");
  const [closing, setClosing] = useState<OpenMoveOut | null>(null);

  const load = useCallback(() => {
    fetch("/api/move-outs", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setError(null); } else setError(j.error ?? "Could not read the move-outs."); })
      .catch(() => setError("Could not read the move-outs."));
  }, []);
  useEffect(load, [load]);

  const needle = q.trim().toLowerCase();
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);
  const open = useMemo(() => (data?.open ?? []).filter((d) => match(`${d.propertyName} ${d.locality} ${d.tenant} ${d.landlord} ${d.managedBy ?? ""}`)), [data, needle]);
  const done = useMemo(() => (data?.done ?? []).filter((r) => match(`${r.propertyName} ${r.tenant} ${r.landlord} ${r.doneBy}`)), [data, needle]);
  const s = data?.summary ?? null;
  const today = todayLondon();

  return (
    <>
      <PageHeader
        title="Move-outs"
        blurb="Every tenancy that is ending: the day the tenants go, and the jobs that close it off. Close a move-out here once it is done and it comes off the list."
        /* Same artwork and measurements as its neighbours in Portfolio. */
        illustration="/illustrations/to-let-row.webp"
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
            ["Moving out", s ? String(s.open) : "•", s ? (s.noDate ? `${s.noDate} with no date set` : "open now") : "reading…", "key"],
            ["Already late", s ? String(s.overdue) : "•", "past the move-out day", "clock"],
            ["In the next 30 days", s ? String(s.next30) : "•", s ? (s.followUp ? `${s.followUp} to follow up` : "nothing to follow up") : "reading…", "calendar"],
            ["Closed this month", s ? String(s.doneThisMonth) : "•", "recorded here", "checklist"],
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
            { id: "open" as const, label: `Moving out ${open.length}`, icon: <DoodleIcon name="key" size={14} /> },
            { id: "done" as const, label: `Done ${done.length}`, icon: <DoodleIcon name="checklist" size={14} /> },
          ]}
        />
        <span className="ml-auto text-[11px] text-muted">
          Copied across from the old system{data?.readAt ? ` ${readWhen(data.readAt)}` : ""}. Move-outs closed here take over from it, and a review recorded as ending lands here too.
        </span>
      </div>

      {error && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {data && !data.live && <p className="mt-4 text-[12.5px] text-muted">{data.reason}</p>}
      {data?.bookError && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{data.bookError}</p>}

      {!data && !error ? (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading the move-outs…
        </p>
      ) : !data ? null : tab === "open" ? (
        open.length === 0 ? (
          <Empty title="Nobody is moving out." blurb="No tenancy is ending, or every one has been closed off." />
        ) : (
          <section className="mt-4 rounded-[22px] border border-line/50 bg-white p-5">
            <ul className="divide-y divide-line/50">
              {open.map((d) => {
                const late = d.daysAway !== null && d.daysAway < 0;
                const chase = !!d.followUpOn && d.followUpOn <= today;
                return (
                  <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <span className="min-w-0">
                      <span className="hand block truncate text-[13.5px]">{d.propertyName}</span>
                      <span className="block truncate text-[10.5px] text-muted">{[d.locality, d.tenant].filter(Boolean).join(" · ") || "No tenant named"}</span>
                    </span>
                    <span className="col-start-1 min-w-0 text-[11.5px] md:col-start-auto">
                      <span className="block truncate">{d.landlord || "Landlord not recorded"}</span>
                      <span className="block truncate text-[10.5px] text-muted">
                        {d.progress}
                        {d.priority && !/^normal$/i.test(d.priority) ? <span className="ml-1.5 inline-block"><Pill tone="accent">{d.priority}</Pill></span> : null}
                      </span>
                    </span>
                    <span className={`col-start-1 text-[12px] md:col-start-auto ${late ? "font-semibold text-accent-dark" : "text-muted"}`}>
                      {d.daysAway === null ? "No move-out day set" : late ? `${Math.abs(d.daysAway)} day${d.daysAway === -1 ? "" : "s"} over` : d.daysAway === 0 ? "Moving out today" : `Moving out ${day(d.moveOutOn)}`}
                      {d.followUpOn ? <span className={`block text-[10.5px] ${chase ? "font-semibold text-accent-dark" : "font-normal text-muted"}`}>Follow up {day(d.followUpOn)}</span> : null}
                      {d.managedBy ? <span className="block text-[10.5px] font-normal text-muted">With {d.managedBy}</span> : null}
                    </span>
                    <PressButton onClick={() => setClosing(d)} className="row-span-2 rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold md:row-span-1">
                      Close move-out
                    </PressButton>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      ) : done.length === 0 ? (
        <Empty title="Nothing closed yet." blurb="Close a move-out from the list and it shows here, with the day they left and the jobs done." />
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
                  <Pill tone={r.outcome === "moved_out" ? "accent" : "neutral"}>{outcomeLabel(r.outcome)}</Pill>
                  {r.outcome === "moved_out" && r.movedOutOn ? <span className="ml-2 text-[11.5px]">on {day(r.movedOutOn)}</span> : null}
                  {r.outcome === "moved_out" ? (
                    <span className="mt-1 block truncate text-[10.5px] text-muted">
                      {r.steps.length === STEPS.length ? "Every job done" : `${r.steps.length} of ${STEPS.length} jobs done`}
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

      {closing && <CloseSheet item={closing} onClose={() => setClosing(null)} onSaved={() => { setClosing(null); setTab("done"); load(); }} />}
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

/** Closing a move-out: what happened, the day they left, and the jobs done. */
function CloseSheet({ item, onClose, onSaved }: { item: OpenMoveOut; onClose: () => void; onSaved: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeId | null>(null);
  const [when, setWhen] = useState(item.moveOutOn && item.moveOutOn <= todayLondon() ? item.moveOutOn : "");
  const [steps, setSteps] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const dateOk = outcome !== "moved_out" || /^\d{4}-\d{2}-\d{2}$/.test(when);
  const noteOk = outcome !== "other" || note.trim().length > 0;
  const canSave = !!outcome && dateOk && noteOk && !busy;
  const toggle = (id: string) => setSteps((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/move-outs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rexpmTaskId: item.taskId ?? null, reviewId: item.reviewId ?? null,
        osPropertyId: item.osPropertyId, rexPropertyId: item.propertyId,
        propertyName: item.propertyName, tenant: item.tenant, landlord: item.landlord, plannedOn: item.moveOutOn,
        outcome, movedOutOn: outcome === "moved_out" ? when : null, steps, note,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg(r?.error ?? "Could not close it. Try again.");
    onSaved();
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Close the move-out"
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name="key" size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] leading-tight">Close the Move-out</h3>
            <p className="mt-0.5 truncate text-[12px] text-muted">{item.propertyName}{item.tenant ? ` · ${item.tenant}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30 disabled:opacity-40">
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-panel p-3 text-[11.5px]">
            <span><span className="block text-[9.5px] font-bold uppercase tracking-wider text-muted">Move-out day</span>{item.moveOutOn ? day(item.moveOutOn) : "Not set"}</span>
            <span className="min-w-0"><span className="block text-[9.5px] font-bold uppercase tracking-wider text-muted">Landlord</span><span className="block truncate">{item.landlord || "Not recorded"}</span></span>
          </div>

          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold">What happened?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
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

          {outcome === "moved_out" && (
            <>
              <label className="text-[11.5px] font-semibold">
                The day they moved out
                <input type="date" value={when} max={todayLondon()} onChange={(e) => setWhen(e.target.value)} className="mt-1 block w-full rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px] font-normal sm:w-56" />
              </label>
              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold">Jobs done <span className="font-normal text-muted">(tick what is finished)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {STEPS.map((x) => {
                    const on = steps.includes(x.id);
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => toggle(x.id)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${on ? "border-[var(--brown)] bg-accent-soft/50 font-semibold" : "border-line/80 hover:border-ink/30"}`}
                      >
                        <DoodleIcon name={on ? "check" : "checklist"} size={12} />
                        {x.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          <label className="text-[11.5px] font-semibold">
            Note {outcome === "other" ? "" : <span className="font-normal text-muted">(optional)</span>}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything still to sort: deductions, a forwarding address, keys still out." className="mt-1 block w-full rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px] font-normal" />
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
            {busy ? "Saving…" : "Close the move-out"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40">
            Not now
          </button>
          <span className="ml-auto text-[11px] text-muted">{!outcome ? "Pick what happened." : !dateOk ? "Say the day they moved out." : !noteOk ? "Say what in the note." : "It comes off the list once saved."}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
