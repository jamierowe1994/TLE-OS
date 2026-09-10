"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import { STEPS, stepOf, type StepId } from "@/lib/inspection-steps";
import type { DueVisit, Finding, Inspection, InspectionEvent, InspectionRules } from "@/lib/inspections";

/**
 * Inspections: the visits we owe the book, and the permission that lets us in.
 *
 * Three lists, in the order the work runs (James, 10 Sep 2026 - "track,
 * record, ask for permissions for access to the tenant, and log when all of
 * these things need to be done"):
 *
 *   DUE      worked out from the cadence against the clock right now, not a
 *            stored schedule. A home appears here because it is time, and
 *            leaves it the moment somebody raises the visit.
 *   IN HAND  raised, and each row says the one thing it needs next.
 *   DONE     visited and reported, kept for the record.
 *
 * The sheet is a workflow rather than a form, the same as a works order: one
 * card, one thing to do, and every answer written on the timeline under the
 * person's name. The tenant's yes is the one that matters, and it is never
 * typed on their behalf - it comes back from their own link.
 */

/* Client-side copies of the constants typed in lib/inspections (server-only). */
const KINDS: { id: string; label: string }[] = [
  { id: "check_in", label: "Check-in" },
  { id: "interim", label: "Property visit" },
  { id: "hmo", label: "HMO check" },
  { id: "void", label: "Empty property check" },
  { id: "check_out", label: "Check-out" },
  { id: "follow_up", label: "Re-visit" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? "Visit";
const ROOMS = ["Outside", "Hallway", "Living room", "Kitchen", "Dining room", "Bedroom 1", "Bedroom 2", "Bedroom 3", "Bathroom", "En-suite", "WC", "Loft", "Garage", "Garden", "Communal areas", "Meters & alarms"];
const ACTIONS: { id: string; label: string }[] = [
  { id: "none", label: "Nothing needed" },
  { id: "monitor", label: "Watch it next time" },
  { id: "works_order", label: "Raise a works order" },
  { id: "tenant", label: "The tenant to put right" },
  { id: "landlord", label: "The landlord to put right" },
];

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const forInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** What the row says to do next. The visit's next thing, not its status. */
function nextFor(i: Inspection): { text: string; hot: boolean } {
  const late = i.dueAt ? new Date(i.dueAt).getTime() < Date.now() : false;
  switch (i.step ?? stepOf({ ...i, openActions: i.openActions ?? 0 })) {
    case "ask_access": return { text: `Ask the tenant · due ${day(i.dueAt)}`, hot: late };
    case "await_access": return { text: `Asked ${day(i.accessAskedAt)} · waiting on the tenant`, hot: late };
    case "rearrange": return { text: i.noAccessAt ? `No access ${day(i.noAccessAt)} · arrange again` : "Tenant asked for another time", hot: true };
    case "book": return { text: "Permission given · put a date in", hot: late };
    case "confirm": return { text: `Booked ${stamp(i.bookedAt)} · confirm it in writing`, hot: false };
    case "visit": return { text: `${i.inspector || "Somebody"} is going ${stamp(i.bookedAt)}`, hot: false };
    case "report": return { text: `Visited ${day(i.visitedAt)} · write it up`, hot: false };
    case "send_report": return { text: "Written up · send it to the landlord", hot: false };
    case "actions": return { text: `${i.openActions} thing${i.openActions === 1 ? "" : "s"} to raise`, hot: true };
    case "closed": return { text: i.status === "cancelled" ? i.cancelledReason || "Cancelled" : `Closed ${day(i.closedAt ?? i.reportSentAt)}`, hot: false };
  }
}

type Board = {
  inspections: Inspection[];
  due: DueVisit[];
  rules: InspectionRules | null;
  summary: { due: number; overdue: number; awaitingTenant: number; booked: number; toWriteUp: number; openActions: number } | null;
  live: boolean;
  reason?: string;
  bookError?: string;
};

export default function Inspections() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"due" | "hand" | "done">("due");
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    fetch("/api/inspections", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setError(null); } else setError(j.error ?? "Could not read the inspections."); })
      .catch(() => setError("Could not read the inspections."));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    try {
      const open = new URLSearchParams(window.location.search).get("open");
      if (open) { setOpenId(open); setTab("hand"); }
    } catch { /* fine */ }
  }, []);

  const all = data?.inspections ?? [];
  const needle = q.trim().toLowerCase();
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);

  const inHand = useMemo(() => all.filter((i) => !["closed", "cancelled"].includes(i.status) && match(`${i.propertyName} ${i.locality} ${i.tenant} ${i.landlord} ${i.ref}`)), [all, needle]);
  const done = useMemo(() => all.filter((i) => ["closed", "cancelled"].includes(i.status) && match(`${i.propertyName} ${i.locality} ${i.tenant} ${i.landlord} ${i.ref}`)), [all, needle]);
  const due = useMemo(() => (data?.due ?? []).filter((d) => match(`${d.propertyName} ${d.locality} ${d.tenant} ${d.landlord}`)), [data, needle]);
  const s = data?.summary ?? null;

  async function raise(d: DueVisit) {
    const r = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: d.kind, propertyName: d.propertyName, locality: d.locality, propertyId: d.propertyId, listingId: d.listingId,
        landlord: d.landlord, landlordEmail: d.landlordEmail, tenant: d.tenant, tenantEmail: d.tenantEmail, tenantPhone: d.tenantPhone,
        tenancyStart: d.tenancyStart, dueAt: d.dueAt,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return setError(r?.error ?? "Could not raise it.");
    load();
    setTab("hand");
    setOpenId(r.inspection.id);
  }

  return (
    <>
      <PageHeader
        title="Inspections"
        blurb="Every visit we owe the managed book, and the permission that lets us in. A home appears as due because the cadence says so, not because somebody remembered - and nobody is recorded as agreeing to a visit unless they said so themselves, on their own link."
        illustration="/illustrations/notioly/looking-out-the-window.svg"
        lineBreak="none"
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search addresses, tenants, landlords…"
      />

      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {(
          [
            ["Due now", s ? String(s.due) : "•", s?.overdue ? `${s.overdue} already late` : "inside the lead window", "calendar"],
            ["Waiting on a tenant", s ? String(s.awaitingTenant) : "•", "asked, not answered", "user"],
            ["Booked in", s ? String(s.booked) : "•", "dates agreed", "clock"],
            ["To write up or raise", s ? String(s.toWriteUp + s.openActions) : "•", "visits done, work outstanding", "checklist"],
          ] as const
        ).map(([k, v, hint, icon]) => (
          <div key={k} className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              <DoodleIcon name={icon} size={14} className="text-accent-dark" />
              {k}
            </p>
            <p className="figures mt-1.5 text-[26px] leading-none">{v}</p>
            <p className="mt-1.5 truncate text-[11px] text-accent-dark">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {([["due", "Due", due.length], ["hand", "In hand", inHand.length], ["done", "Done", done.length]] as const).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors ${tab === key ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`}
          >
            {label}
            <span className="ml-1.5 opacity-70">{n}</span>
          </button>
        ))}
        {data?.rules && (
          <span className="ml-auto text-[11px] text-muted">
            First visit {data.rules.firstAfterMonths} months in, then every {data.rules.thenEveryMonths}. HMOs every {data.rules.hmoEveryMonths}.
          </span>
        )}
      </div>

      {error && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {data && !data.live && <p className="mt-4 text-[12.5px] text-muted">{data.reason}</p>}
      {data?.bookError && <p className="mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{data.bookError}</p>}

      {!data ? (
        <p className="mt-6 text-[12.5px] text-muted">Reading the book…</p>
      ) : tab === "due" ? (
        due.length === 0 ? (
          <Empty title="Nothing due." blurb="Every managed home has been visited inside the cadence, or is already in hand." />
        ) : (
          <section className="mt-4 rounded-2xl border border-line/80 bg-panel p-5">
            <ul className="divide-y divide-line/50">
              {due.map((d) => (
                <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <span className="min-w-0">
                    <span className="hand block truncate text-[13.5px]">{d.propertyName}</span>
                    <span className="block truncate text-[10.5px] text-muted">{d.locality}{d.tenant ? ` · ${d.tenant}` : " · no tenant on the listing"}</span>
                  </span>
                  <span className="col-start-1 flex items-center gap-1.5 md:col-start-auto">
                    <Pill tone="neutral">{kindLabel(d.kind)}</Pill>
                  </span>
                  <span className={`col-start-1 text-[12px] md:col-start-auto ${d.daysAway < 0 ? "font-semibold text-accent-dark" : "text-muted"}`}>
                    {d.daysAway < 0 ? `${Math.abs(d.daysAway)} days over` : `Due ${day(d.dueAt)}`} · {d.why}
                  </span>
                  <PressButton onClick={() => void raise(d)} className="rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold">
                    Raise it
                  </PressButton>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : (
        <List rows={tab === "hand" ? inHand : done} onOpen={setOpenId} empty={tab === "hand" ? "Nothing in hand." : "Nothing finished yet."} />
      )}

      {openId && <Sheet id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

function Empty({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line/80 bg-panel p-8 text-center">
      <p className="hand text-[20px]">{title}</p>
      <p className="mt-1 text-[12.5px] text-muted">{blurb}</p>
    </div>
  );
}

function List({ rows, onOpen, empty }: { rows: Inspection[]; onOpen: (id: string) => void; empty: string }) {
  if (rows.length === 0) return <Empty title={empty} blurb="Raise one from the Due list, and it will run through from here." />;
  return (
    <section className="mt-4 rounded-2xl border border-line/80 bg-panel p-5">
      <ul className="divide-y divide-line/50">
        {rows.map((i) => {
          const next = nextFor(i);
          return (
            <li key={i.id}>
              <button type="button" onClick={() => onOpen(i.id)} className="grid w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-3 text-left transition-colors hover:bg-accent-soft/20 md:grid-cols-[52px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                <span className="figures text-[13px] text-muted">#{i.ref}</span>
                <span className="min-w-0">
                  <span className="hand block truncate text-[13.5px]">{i.propertyName}</span>
                  <span className="block truncate text-[10.5px] text-muted">{i.locality}{i.tenant ? ` · ${i.tenant}` : ""}</span>
                </span>
                <span className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto">
                  <Pill tone={i.kind === "hmo" ? "accent" : "neutral"}>{kindLabel(i.kind)}</Pill>
                </span>
                <span className={`col-start-2 text-[12px] md:col-start-auto ${next.hot ? "font-semibold text-accent-dark" : "text-muted"}`}>{next.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── one inspection ──────────────────────────────────────────────────────── */

function Sheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [held, setHeld] = useState<{ inspection: Inspection; findings: Finding[]; events: InspectionEvent[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const read = useCallback(() => {
    fetch(`/api/inspections/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setHeld(j) : setErr(j.error ?? "Could not open it.")))
      .catch(() => setErr("Could not open it."));
  }, [id]);
  useEffect(read, [read]);

  async function move(body: unknown) {
    setBusy(true);
    const r = await fetch(`/api/inspections/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't work.");
    setErr(null);
    setHeld(r);
    onChanged();
  }

  const i = held?.inspection;
  const step: StepId | null = i ? i.step ?? stepOf({ ...i, openActions: i.openActions ?? 0 }) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-page p-6 shadow-xl md:p-8" onClick={(e) => e.stopPropagation()}>
        {!i ? (
          <p className="text-[12.5px] text-muted">{err ?? "Opening…"}</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{kindLabel(i.kind)} · #{i.ref}</p>
                <h2 className="hand mt-1 truncate text-[22px]">{i.propertyName}</h2>
                <p className="text-[11.5px] text-muted">{i.locality}{i.tenant ? ` · ${i.tenant}` : ""}{i.landlord ? ` · landlord ${i.landlord}` : ""}</p>
              </div>
              <button type="button" onClick={onClose} className="text-[12px] text-muted underline">Close</button>
            </div>

            {err && <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px]">{err}</p>}

            {/* ── Now: the one thing this visit needs. ── */}
            <section className="mt-6 rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Now</p>
              <h3 className="hand mt-1 text-[18px]">{STEPS.find((x) => x.id === step)?.label}</h3>
              <p className="mt-1 text-[12px] text-muted">{STEPS.find((x) => x.id === step)?.blurb}</p>
              <div className="mt-4">
                <Now step={step!} inspection={i} busy={busy} onMove={move} />
              </div>
            </section>

            {/* ── The permission, kept in full. ── */}
            <section className="mt-5 rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Access</p>
              <dl className="mt-2 space-y-1 text-[12px]">
                <Row k="Asked" v={i.accessAskedAt ? `${stamp(i.accessAskedAt)} · ${i.noticeHours} hours notice` : "not yet"} />
                <Row k="Dates offered" v={i.offered.length ? i.offered.map((o) => stamp(o)).join(" · ") : "none"} />
                <Row
                  k="Tenant said"
                  v={i.accessReply === "yes" ? `yes, ${stamp(i.accessRepliedAt)}` : i.accessReply === "other_time" ? `asked for another time, ${stamp(i.accessRepliedAt)}` : i.accessReply === "no" ? `no, ${stamp(i.accessRepliedAt)}` : "nothing yet"}
                />
                {i.accessNote && <Row k="In their words" v={`"${i.accessNote}"`} />}
                {i.noAccessAt && <Row k="No access" v={`${stamp(i.noAccessAt)} · ${i.noAccessReason}`} />}
              </dl>
              {i.accessToken && (
                <p className="mt-3 break-all text-[10.5px] text-muted">Their link: /visit/{i.accessToken}</p>
              )}
            </section>

            {/* ── What was found. ── */}
            <Findings inspection={i} findings={held.findings} busy={busy} onMove={move} />

            {/* ── The timeline. ── */}
            <section className="mt-5 rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Timeline</p>
              <ul className="mt-3 space-y-2.5">
                {held.events.map((e) => (
                  <li key={e.id} className="text-[12px]">
                    <span className="text-muted">{stamp(e.at)} · {e.by}</span>
                    <br />
                    {e.text}
                  </li>
                ))}
                {held.events.length === 0 && <li className="text-[12px] text-muted">Nothing yet.</li>}
              </ul>
              <NoteBox busy={busy} onSend={(text) => move({ action: "note", text })} />
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3">
    <dt className="w-32 shrink-0 text-muted">{k}</dt>
    <dd className="min-w-0">{v}</dd>
  </div>
);

/** The one card. Everything else on the sheet is a record; this is the doing. */
function Now({ step, inspection, busy, onMove }: { step: StepId; inspection: Inspection; busy: boolean; onMove: (b: unknown) => void }) {
  const soon = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return forInput(d); };
  const [slots, setSlots] = useState<string[]>([soon(3, 10), soon(4, 14), soon(5, 9)]);
  const [at, setAt] = useState(soon(3, 10));
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState<"good" | "fair" | "poor">("good");
  const [summary, setSummary] = useState("");
  const btn = "rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page";
  const ghost = "rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold";

  switch (step) {
    case "ask_access":
    case "rearrange":
      return (
        <>
          <p className="text-[12px] text-muted">
            {inspection.tenantEmail ? `Goes to ${inspection.tenantEmail}.` : "No email address for the tenant, so this records the ask without sending anything - ring them."}
          </p>
          {slots.map((sl, n) => (
            <input
              key={n}
              type="datetime-local"
              value={sl}
              onChange={(e) => setSlots((cur) => cur.map((c, x) => (x === n ? e.target.value : c)))}
              className="mt-2 w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]"
            />
          ))}
          <button type="button" onClick={() => setSlots((c) => [...c, soon(7, 10)])} className="mt-2 text-[11.5px] text-muted underline">Offer another time</button>
          <div className="mt-4">
            <PressButton disabled={busy} onClick={() => onMove({ action: "ask_access", offered: slots.map((sl) => new Date(sl).toISOString()) })} className={btn}>
              {busy ? "Sending…" : "Ask the tenant"}
            </PressButton>
          </div>
        </>
      );
    case "await_access":
      return (
        <>
          <p className="text-[12px] text-muted">They have their own link and their answer lands here. Record it yourself only if they ring or reply by email.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PressButton disabled={busy} onClick={() => onMove({ action: "access_reply", reply: "yes", at: new Date(inspection.offered[0] ?? Date.now()).toISOString(), note: "Agreed on the phone." })} className={ghost}>They said yes on the phone</PressButton>
            <PressButton disabled={busy} onClick={() => onMove({ action: "access_reply", reply: "other_time", note: "Asked for another time on the phone." })} className={ghost}>They want another time</PressButton>
          </div>
        </>
      );
    case "book":
      return (
        <>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
          <div className="mt-4">
            <PressButton disabled={busy} onClick={() => onMove({ action: "book", at: new Date(at).toISOString() })} className={btn}>Book it</PressButton>
          </div>
        </>
      );
    case "confirm":
      return (
        <>
          <p className="text-[12px] text-muted">Confirms {stamp(inspection.bookedAt)} to the tenant in writing. That email is the notice.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PressButton disabled={busy} onClick={() => onMove({ action: "confirm" })} className={btn}>Confirm it</PressButton>
            <PressButton disabled={busy} onClick={() => onMove({ action: "tell_landlord" })} className={ghost}>Tell the landlord too</PressButton>
          </div>
        </>
      );
    case "visit":
      return (
        <>
          <p className="text-[12px] text-muted">{stamp(inspection.bookedAt)}{inspection.inspector ? ` · ${inspection.inspector}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PressButton disabled={busy} onClick={() => onMove({ action: "visited" })} className={btn}>We&apos;ve been</PressButton>
          </div>
          <div className="mt-4">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nobody in, turned away…" className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
            <PressButton disabled={busy || !reason.trim()} onClick={() => onMove({ action: "no_access", reason })} className={`${ghost} mt-2`}>Couldn&apos;t get in</PressButton>
          </div>
        </>
      );
    case "report":
      return (
        <>
          <div className="flex flex-wrap gap-2">
            {(["good", "fair", "poor"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCondition(c)} className={`rounded-full px-4 py-2 text-[12.5px] font-semibold ${condition === c ? "bg-ink text-page" : "border border-line/80 text-muted"}`}>
                {c === "good" ? "In good order" : c === "fair" ? "Reasonable" : "Not being kept"}
              </button>
            ))}
          </div>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="How the property is being kept, in a few lines for the landlord." className="mt-3 w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
          <div className="mt-3">
            <PressButton disabled={busy || !summary.trim()} onClick={() => onMove({ action: "report", condition, summary })} className={btn}>Write it up</PressButton>
          </div>
        </>
      );
    case "send_report":
      return (
        <>
          <p className="text-[12px] text-muted">{inspection.landlordEmail ? `Goes to ${inspection.landlordEmail} with the findings on it.` : "No email address for the landlord - add one on their record first."}</p>
          <div className="mt-3">
            <PressButton disabled={busy} onClick={() => onMove({ action: "report_sent" })} className={btn}>Send the report</PressButton>
          </div>
        </>
      );
    case "actions":
      return <p className="text-[12px] text-muted">Raise each one from the findings below. A works order carries it from there.</p>;
    case "closed":
      return (
        <div className="flex flex-wrap gap-2">
          <PressButton disabled={busy} onClick={() => onMove({ action: "reopen" })} className={ghost}>Reopen it</PressButton>
        </div>
      );
    default:
      return null;
  }
}

function Findings({ inspection, findings, busy, onMove }: { inspection: Inspection; findings: Finding[]; busy: boolean; onMove: (b: unknown) => void }) {
  const [room, setRoom] = useState(ROOMS[0]);
  const [item, setItem] = useState("");
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState<"good" | "fair" | "poor">("good");
  const [action, setAction] = useState("none");
  const canAdd = Boolean(inspection.visitedAt);

  return (
    <section className="mt-5 rounded-2xl border border-line/80 bg-panel p-5">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">What we found</p>
      <ul className="mt-3 divide-y divide-line/50">
        {findings.map((f) => (
          <li key={f.id} className="flex items-start justify-between gap-3 py-2.5 text-[12px]">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{[f.room, f.item].filter(Boolean).join(" · ")}</span>
              {f.note && <span className="block text-muted">{f.note}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Pill tone={f.condition === "poor" ? "accent" : "neutral"}>{f.condition}</Pill>
              <span className="text-[11px] text-muted">{ACTIONS.find((a) => a.id === f.action)?.label}</span>
            </span>
          </li>
        ))}
        {findings.length === 0 && <li className="py-2 text-[12px] text-muted">{canAdd ? "Nothing recorded yet." : "Recorded after the visit."}</li>}
      </ul>

      {canAdd && (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <select value={room} onChange={(e) => setRoom(e.target.value)} className="w-1/2 rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]">
              {ROOMS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="What - extractor fan, sealant…" className="w-1/2 rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What you saw." className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
          <div className="flex flex-wrap gap-2">
            <select value={condition} onChange={(e) => setCondition(e.target.value as "good" | "fair" | "poor")} className="rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]">
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]">
              {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <PressButton
              disabled={busy || !room}
              onClick={() => { onMove({ finding: { room, item, note, condition, action } }); setItem(""); setNote(""); setAction("none"); setCondition("good"); }}
              className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold"
            >
              Add it
            </PressButton>
          </div>
        </div>
      )}
    </section>
  );
}

function NoteBox({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-4 flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="min-w-0 flex-1 rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
      <PressButton disabled={busy || !text.trim()} onClick={() => { onSend(text.trim()); setText(""); }} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold">
        Add
      </PressButton>
    </div>
  );
}
