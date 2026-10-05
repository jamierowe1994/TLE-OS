"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile, { toneFor } from "@/components/StatTile";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import { PressButton } from "@/components/Bits";
import { STEPS, stepOf, type StepId } from "@/lib/inspection-steps";
import type { DueVisit, Finding, Inspection, InspectionEvent, InspectionRules } from "@/lib/inspections";
import ReportSheet from "@/components/inspections/ReportSheet";
import BookForm, { type Person } from "@/components/inspections/BookForm";
import RecordVisit from "@/components/inspections/RecordVisit";
import { asChecks, checkLines, checksDone, CHECKS } from "@/lib/inspection-checks";
import { REPAIR_CATEGORIES, URGENCIES } from "@/lib/works-catalogue";
import SaveChip, { SaveScopeProvider, useSaveReporter, useSaveScope } from "@/components/SaveChip";

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
/** "at 14:05 today", or "on 30 Sep" - when the old system's tasks were last copied across. */
const readWhen = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const same = d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) === new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  return same ? `at ${time} today` : `on ${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })}`;
};
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const forInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** What the row says to do next. The visit's next thing, not its status. */
function nextFor(i: Inspection): { text: string; hot: boolean } {
  const late = i.dueAt ? new Date(i.dueAt).getTime() < Date.now() : false;
  switch (i.step ?? stepOf({ ...i, openActions: i.openActions ?? 0 })) {
    case "ask_access": return { text: `Book it in · due ${day(i.dueAt)}`, hot: late };
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
  /** "rex-pm" while the due list is the tasks copied across (lib/rexpm-tasks). */
  source?: "rex-pm" | "os";
  readAt?: string | null;
  /** Who is looking, and who can be sent on a visit (3 Oct 2026). */
  me?: Person;
  team?: Person[];
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
        tenancyStart: d.tenancyStart, dueAt: d.dueAt, osPropertyId: d.osPropertyId ?? null, rexpmTaskId: d.taskId ?? null,
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
        blurb="Every visit we owe the managed book, and the permission that lets us in. A home is due because the cadence says so, not because somebody remembered, and nobody has agreed to a visit unless they said so on their own link."
        /* The last black-and-white sketch in the Portfolio group. The row of
           homes is a stand-in, borrowed from Viewings, until James paints one
           for inspections - but a line drawing sitting beside four painted
           mastheads reads as a page nobody finished. */
        illustration="/illustrations/houses-row.webp"
        /* Measured at 390px on 14 Sep 2026: the artwork landed on the blurb.
           The masthead's phone reserve is one measured guess and it does not
           hold here, so on a phone the drawing goes and the words keep the
           width. Nine other pages were checked and keep theirs. */
        hideArtOnPhone
        /* 1200x257, so 4.67 - the number has to be the picture's own, because
           PageHeader reserves the text column from height x aspect. Borrowing
           Portfolio's 3.11 reserved 435px for something that drew 654px, and
           the extra 219 landed on top of the blurb below 1200px wide. */
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
            ["Due now", s ? String(s.due) : "•", s?.overdue ? `${s.overdue} already late` : "inside the lead window", "calendar"],
            ["Waiting on a tenant", s ? String(s.awaitingTenant) : "•", "asked, not answered", "user"],
            ["Booked in", s ? String(s.booked) : "•", "dates agreed", "clock"],
            ["To write up or raise", s ? String(s.toWriteUp + s.openActions) : "•", "visits done, work outstanding", "checklist"],
          ] as const
        ).map(([k, v, hint, icon]) => (
          /* Portfolio's tile; Due now is the one that matters - pink while any
             visit is due, green when the book is all visited. */
          <StatTile key={k} label={k} value={v} hint={hint} icon={icon} tone={k === "Due now" ? toneFor(s?.due) : undefined} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {/* The same sliding, brown-marked control as Properties, Listings,
            Leads and Viewings. This screen was drawing its own black pills,
            which is the one place in the OS that colour appears. */}
        <Segmented
          className="w-full sm:w-auto sm:min-w-[340px]"
          value={tab}
          onChange={setTab}
          options={[
            { id: "due" as const, label: `Due ${due.length}`, icon: <DoodleIcon name="calendar" size={14} /> },
            { id: "hand" as const, label: `In hand ${inHand.length}`, icon: <DoodleIcon name="clock" size={14} /> },
            { id: "done" as const, label: `Done ${done.length}`, icon: <DoodleIcon name="checklist" size={14} /> },
          ]}
        />
        {data?.source === "rex-pm" ? (
          /* The due list is the old system's open tasks for now (1 Oct 2026).
             Agent copy never names the system - see lib/rexpm-tasks. */
          <span className="ml-auto text-[11px] text-muted">
            Copied across from the old system{data.readAt ? ` ${readWhen(data.readAt)}` : ""}. Visits booked here take over from it.
          </span>
        ) : data?.rules ? (
          <span className="ml-auto text-[11px] text-muted">
            First visit {data.rules.firstAfterMonths} months in, then every {data.rules.thenEveryMonths}. HMOs every {data.rules.hmoEveryMonths}.
          </span>
        ) : null}
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
          <section className="mt-4 rounded-[22px] border border-line/50 bg-white p-5">
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
                    {d.daysAway < 0 ? `${Math.abs(d.daysAway)} day${d.daysAway === -1 ? "" : "s"} over` : d.daysAway === 0 ? "Due today" : `Due ${day(d.dueAt)}`} · {d.why}
                    {d.managedBy ? <span className="block text-[10.5px] font-normal text-muted">With {d.managedBy}</span> : null}
                  </span>
                  {/* Raises it and opens it on the booking form (3 Oct 2026). */}
                  <PressButton onClick={() => void raise(d)} className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-page">
                    Book it
                  </PressButton>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : (
        <List rows={tab === "hand" ? inHand : done} onOpen={setOpenId} empty={tab === "hand" ? "Nothing in hand." : "Nothing finished yet."} />
      )}

      {openId && <Sheet id={openId} team={data?.team ?? []} me={data?.me ?? null} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

function Empty({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mt-6 rounded-[22px] border border-dashed border-line/60 bg-white p-8 text-center">
      <p className="hand text-[20px]">{title}</p>
      <p className="mt-1 text-[12.5px] text-muted">{blurb}</p>
    </div>
  );
}

function List({ rows, onOpen, empty }: { rows: Inspection[]; onOpen: (id: string) => void; empty: string }) {
  if (rows.length === 0) return <Empty title={empty} blurb="Raise one from the Due list, and it will run through from here." />;
  return (
    <section className="mt-4 rounded-[22px] border border-line/50 bg-white p-5">
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

/** One save on the visit. Answers whether it landed, so a form clears only then. */
type Move = (body: unknown, label?: string) => Promise<boolean>;

function Sheet({ id, team, me, onClose, onChanged }: { id: string; team: Person[]; me: Person | null; onClose: () => void; onChanged: () => void }) {
  const [held, setHeld] = useState<{ inspection: Inspection; findings: Finding[]; events: InspectionEvent[] } | null>(null);
  const [busy, setBusy] = useState(false);
  /* The full-screen visit record, and where it opens. */
  const [recording, setRecording] = useState<null | "checks" | "rooms" | "writeup">(null);
  const [err, setErr] = useState<string | null>(null);
  /* The Auto save chip in the header (components/SaveChip), 23 Sep 2026:
     every step, finding, photo and note on the visit says whether it landed. */
  const saves = useSaveScope(id);
  const reporter = saves.reporter;

  const read = useCallback(() => {
    fetch(`/api/inspections/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setHeld(j) : setErr(j.error ?? "Could not open it.")))
      .catch(() => setErr("Could not open it."));
  }, [id]);
  useEffect(read, [read]);

  const move: Move = async (body, label = "Inspection") => {
    setBusy(true);
    const settle = reporter.begin(label);
    const r = await fetch(`/api/inspections/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "That didn't work.";
      setErr(problem);
      settle({ ok: false, problem });
      return false;
    }
    setErr(null);
    setHeld(r);
    onChanged();
    settle({ ok: true });
    return true;
  };

  const i = held?.inspection;
  const step: StepId | null = i ? i.step ?? stepOf({ ...i, openActions: i.openActions ?? 0 }) : null;

  return (
    <SaveScopeProvider scope={saves}>
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-page p-6 shadow-xl md:p-8" onClick={(e) => e.stopPropagation()}>
        {!i ? (
          <p className="text-[12.5px] text-muted">{err ?? "Opening…"}</p>
        ) : (
          <>
            {/* Buttons above the title on a phone, so the chip is never squeezed. */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{kindLabel(i.kind)} · #{i.ref}</p>
                <h2 className="hand mt-1 truncate text-[22px]">{i.propertyName}</h2>
                <p className="text-[11.5px] text-muted">{i.locality}{i.tenant ? ` · ${i.tenant}` : ""}{i.landlord ? ` · landlord ${i.landlord}` : ""}</p>
                {/* Only once it has been written up. Printing a visit that has
                    not happened produces a sheet saying "Not recorded" under
                    every heading, which looks like a broken report rather than
                    an early one. Under the title, not beside it: up there it
                    squeezed the address to "14 Preview …". */}
                {i.reportedAt && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="Print this visit report for the landlord, or save it as a PDF"
                    className="mt-2 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
                  >
                    Print the report
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 sm:shrink-0">
                <SaveChip scope={saves} />
                <button type="button" onClick={onClose} className="text-[12px] text-muted underline">Close</button>
              </div>
            </div>

            {/* On paper, hidden on screen - see components/inspections/ReportSheet. */}
            <ReportSheet
              inspection={i}
              findings={held?.findings ?? []}
              kindText={kindLabel(i.kind)}
              actionLabel={(id) => ACTIONS.find((a) => a.id === id)?.label ?? ""}
            />

            {err && <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12px]">{err}</p>}

            {/* ── Now: the one thing this visit needs. ── */}
            <section className="mt-6 rounded-[22px] border border-line/50 bg-white p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Now</p>
              <h3 className="hand mt-1 text-[18px]">{STEPS.find((x) => x.id === step)?.label}</h3>
              <p className="mt-1 text-[12px] text-muted">{STEPS.find((x) => x.id === step)?.blurb}</p>
              <div className="mt-4">
                <Now key={`${step}-${i.bookedAt ?? ""}`} step={step!} inspection={i} team={team} me={me} busy={busy} onMove={move} onRecord={setRecording} />
              </div>
            </section>

            {/* ── The permission, kept in full. ── */}
            <section className="mt-5 rounded-[22px] border border-line/50 bg-white p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Access</p>
              <dl className="mt-2 space-y-1 text-[12px]">
                {i.bookedAt && <Row k="Booked" v={`${stamp(i.bookedAt)} · ${i.visitMins} minutes${i.inspector ? ` · ${i.inspector}` : ""}`} />}
                {i.bookedAt && (
                  <Row
                    k="Tenant confirmed"
                    v={
                      i.tenantAckAt
                        ? `yes, on their link ${stamp(i.tenantAckAt)}${i.tenantAckNote ? ` - "${i.tenantAckNote}"` : ""}`
                        : !i.tenantConfirmedAt
                          ? "not sent yet"
                          : i.tenantEmail
                            ? `emailed ${stamp(i.tenantConfirmedAt)}, not answered yet`
                            : `told by phone, marked ${stamp(i.tenantConfirmedAt)}`
                    }
                  />
                )}
                {/* Booked straight away there was no ask and no answer, so those rows would only say "nothing". */}
                {!(i.bookedAt && i.offered.length === 0 && !i.accessReply) && (
                  <>
                    <Row k="Asked" v={i.accessAskedAt ? `${stamp(i.accessAskedAt)} · ${i.noticeHours} hours notice` : "not yet"} />
                    {i.offered.length > 0 && <Row k="Dates offered" v={i.offered.map((o) => stamp(o)).join(" · ")} />}
                    <Row
                      k="Tenant said"
                      v={i.accessReply === "yes" ? `yes, ${stamp(i.accessRepliedAt)}` : i.accessReply === "other_time" ? `asked for another time, ${stamp(i.accessRepliedAt)}` : i.accessReply === "no" ? `no, ${stamp(i.accessRepliedAt)}` : "nothing yet"}
                    />
                  </>
                )}
                {i.appointmentId && <Row k="Diary" v="In the inspector's diary" />}
                {i.accessNote && <Row k="In their words" v={`"${i.accessNote}"`} />}
                {i.noAccessAt && <Row k="No access" v={`${stamp(i.noAccessAt)} · ${i.noAccessReason}`} />}
              </dl>
              {i.accessToken && (
                <p className="mt-3 break-all text-[10.5px] text-muted">Their link: /visit/{i.accessToken}</p>
              )}
            </section>

            {/* ── What was found. ── */}
            <Findings inspection={i} findings={held.findings} busy={busy} onMove={move} onRecord={setRecording} />

            {/* ── The timeline. ── */}
            <section className="mt-5 rounded-[22px] border border-line/50 bg-white p-5">
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
              <NoteBox busy={busy} onSend={(text) => move({ action: "note", text }, "Note")} />
            </section>
          </>
        )}
      </aside>
    </div>
    {i && held && recording && (
      <RecordVisit
        inspection={i}
        findings={held.findings}
        busy={busy}
        onMove={move}
        onClose={() => setRecording(null)}
        startAt={recording === "rooms" ? undefined : recording}
      />
    )}
    </SaveScopeProvider>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3">
    <dt className="w-32 shrink-0 text-muted">{k}</dt>
    <dd className="min-w-0">{v}</dd>
  </div>
);

/**
 * The one card. Everything else on the sheet is a record; this is the doing.
 *
 * Book, confirm, record (James, 3 Oct 2026). Booking straight away is the
 * usual road now: pick the time, the tenant gets it in writing with a button
 * to say it works. Offering a few dates and letting them choose is still
 * there for the tenant who is hard to pin down.
 */
function Now({
  step,
  inspection,
  team,
  me,
  busy,
  onMove,
  onRecord,
}: {
  step: StepId;
  inspection: Inspection;
  team: Person[];
  me: Person | null;
  busy: boolean;
  onMove: Move;
  onRecord: (at: "checks" | "rooms" | "writeup") => void;
}) {
  const soon = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return forInput(d); };
  const [slots, setSlots] = useState<string[]>([soon(3, 10), soon(4, 14), soon(5, 9)]);
  const [mode, setMode] = useState<"book" | "ask">("book");
  const [moving, setMoving] = useState(false);
  const [reason, setReason] = useState("");
  const [noAccess, setNoAccess] = useState(false);
  const btn = "rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page";
  const ghost = "rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold";
  const first = (inspection.tenant || "the tenant").split(/\s+/)[0];
  const book = (label?: string) => <BookForm inspection={inspection} team={team} me={me} busy={busy} onMove={onMove} onDone={() => setMoving(false)} submitLabel={label} />;

  /* Moving a booked visit: the same form, the same diary entry moved. */
  if (moving) {
    return (
      <>
        <p className="mb-3 text-[12px] text-muted">Moves the diary entry too. Tick the email so {first} has the new time in writing.</p>
        {book()}
        <button type="button" onClick={() => setMoving(false)} className="mt-3 text-[11.5px] text-muted underline">Keep {stamp(inspection.bookedAt)}</button>
      </>
    );
  }

  switch (step) {
    case "ask_access":
    case "rearrange":
      return (
        <>
          {step === "rearrange" && (
            <p className="mb-3 rounded-xl bg-accent-soft/40 px-3 py-2 text-[12px]">
              {inspection.noAccessAt ? `Couldn't get in on ${day(inspection.noAccessAt)}: ${inspection.noAccessReason}` : `${first} asked for another time${inspection.accessNote ? `: "${inspection.accessNote}"` : "."}`}
            </p>
          )}
          <div className="mb-4 inline-flex rounded-full border border-line/80 p-0.5 text-[12px] font-semibold">
            {(
              [
                ["book", "Book a time"],
                ["ask", `Let ${first} choose`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-full px-3.5 py-1.5 ${mode === id ? "bg-ink text-page" : "text-muted"}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === "book" ? (
            book()
          ) : (
            <>
              <p className="text-[12px] text-muted">
                {inspection.tenantEmail ? `Goes to ${inspection.tenantEmail}, with a link to pick one.` : "No email address for the tenant, so this records the ask without sending anything - ring them."}
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
                  {busy ? "Sending…" : `Send ${first} the dates`}
                </PressButton>
              </div>
            </>
          )}
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
          <button type="button" onClick={() => setMoving(true)} className="mt-3 text-[11.5px] text-muted underline">Book a time instead</button>
        </>
      );
    case "book":
      return book();
    case "confirm":
      return (
        <>
          <p className="text-[12px] text-muted">
            Booked {stamp(inspection.bookedAt)} with {inspection.inspector || "the team"}.{" "}
            {inspection.tenantEmail ? `Confirming emails ${first} the time with a button to say it works. That email is the notice.` : `No email for ${first}: ring them, then mark it confirmed.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PressButton disabled={busy} onClick={() => onMove({ action: "confirm" }, "Confirmation")} className={btn}>
              {inspection.tenantEmail ? `Email ${first} the confirmation` : "Mark it confirmed"}
            </PressButton>
            {!inspection.landlordToldAt && <PressButton disabled={busy} onClick={() => onMove({ action: "tell_landlord" })} className={ghost}>Tell the landlord too</PressButton>}
            <button type="button" onClick={() => setMoving(true)} className="text-[12px] text-muted underline">Change the time</button>
          </div>
        </>
      );
    case "visit": {
      /* Told on the phone counts as confirmed: there was no link to press. */
      const acked = Boolean(inspection.tenantAckAt) || !inspection.tenantEmail;
      return (
        <>
          <p className="text-[13px] font-semibold">
            {stamp(inspection.bookedAt)} · {inspection.visitMins} minutes{inspection.inspector ? ` · ${inspection.inspector}` : ""}
          </p>
          <p className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${acked ? "text-[#2f7a48]" : "text-accent-dark"}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: acked ? "#2f7a48" : "currentColor" }} />
            {!inspection.tenantAckAt && !inspection.tenantEmail
              ? `${first} was told by phone.`
              : acked
              ? `${first} confirmed the time works${inspection.tenantAckNote ? `: "${inspection.tenantAckNote}"` : "."}`
              : `${first} hasn't pressed "That time works" yet. Worth a ring the day before.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <PressButton
              disabled={busy}
              onClick={async () => {
                if (await onMove({ action: "visited", inspector: inspection.inspector || me?.name || "" }, "Visit")) onRecord("checks");
              }}
              className={btn}
            >
              Record the visit
            </PressButton>
            <PressButton disabled={busy} onClick={() => setNoAccess((x) => !x)} className={ghost}>Couldn&apos;t get in</PressButton>
          </div>
          {noAccess && (
            <div className="mt-3">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nobody in, turned away…" className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
              <PressButton disabled={busy || !reason.trim()} onClick={() => onMove({ action: "no_access", reason })} className={`${ghost} mt-2`}>Record no access</PressButton>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => setMoving(true)} className="text-[11.5px] text-muted underline">Change the time</button>
            {inspection.tenantEmail && !acked && (
              <button type="button" disabled={busy} onClick={() => void onMove({ action: "confirm" }, "Confirmation")} className="text-[11.5px] text-muted underline">
                Send {first} the confirmation again
              </button>
            )}
          </div>
        </>
      );
    }
    case "report":
      return (
        <>
          <p className="text-[12px] text-muted">Visited {day(inspection.visitedAt)}. Go through the checks and each room, then write it up for the landlord.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PressButton disabled={busy} onClick={() => onRecord("checks")} className={btn}>Carry on recording</PressButton>
            <PressButton disabled={busy} onClick={() => onRecord("writeup")} className={ghost}>Write it up</PressButton>
          </div>
        </>
      );
    case "send_report":
      return (
        <>
          <p className="text-[12px] text-muted">{inspection.landlordEmail ? `Goes to ${inspection.landlordEmail} with the findings and the checks on it.` : "No email address for the landlord - add one on their record first."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PressButton disabled={busy} onClick={() => onMove({ action: "report_sent" })} className={btn}>Send the report</PressButton>
            <PressButton disabled={busy} onClick={() => onRecord("writeup")} className={ghost}>Change the write-up</PressButton>
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

/**
 * PHOTOGRAPHS ON A FINDING.
 *
 * "No photographs on a finding yet" was the last line of the Inspections
 * caveat, and it is the one that costs money: a deposit is argued over what a
 * room looked like, and "the extractor had heavy grease on it" is a sentence
 * against a photograph.
 *
 * Nothing new was needed to store them. `photos` has been on the finding since
 * the table was written, and /api/r2/upload already takes a scope and a ref
 * and hands back a key - the same route the listing photos and the compliance
 * certificates go through, which means the server decides what may be stored
 * rather than the browser. They are filed under the INSPECTION's ref, so every
 * picture from one visit sits under one prefix.
 */
function FindingPhotos({ finding, busy, onMove }: { finding: Finding; busy: boolean; onMove: Move }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reporter = useSaveReporter();
  const photos = finding.photos ?? [];

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      const added: { key: string; name: string }[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set("scope", "photo");
        body.set("ref", `inspection-${finding.inspectionId}`);
        body.set("file", file);
        const j = await fetch("/api/r2/upload", { method: "POST", body }).then((r) => r.json());
        if (!j.ok) throw new Error(j.error ?? "That picture would not upload.");
        added.push({ key: j.key, name: file.name });
      }
      /* Saved through the finding's own save, so one picture cannot end up in
         storage with nothing on the record pointing at it. */
      void onMove({ finding: { ...finding, photos: [...photos, ...added] } }, "Photo");
    } catch (e) {
      const problem = e instanceof Error ? e.message : "That picture would not upload.";
      setErr(problem);
      reporter.begin("Photo")({ ok: false, problem });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-1.5">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((p) => (
            <a key={p.key} href={`/api/r2/file?key=${encodeURIComponent(p.key)}`} target="_blank" rel="noreferrer" title={p.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/r2/file?key=${encodeURIComponent(p.key)}`} alt={p.name} className="h-14 w-14 rounded-lg border border-line/60 object-cover" />
            </a>
          ))}
        </div>
      )}
      <label className={`mt-1.5 inline-block text-[11px] ${busy || uploading ? "text-muted" : "cursor-pointer text-accent-dark underline"}`}>
        {uploading ? "Uploading…" : photos.length ? "Add another photo" : "Add a photo"}
        <input type="file" accept="image/*" multiple disabled={busy || uploading} onChange={(e) => void add(e.target.files)} className="hidden" />
      </label>
      {err && <p className="mt-1 text-[11px] text-accent-dark">{err}</p>}
    </div>
  );
}

/**
 * The one control that turns a finding into a job.
 *
 * The screen used to say "Raise it on Maintenance and it carries from there",
 * which meant retyping the room, the item and what was seen into a second
 * screen - and every time somebody did not, a finding marked "raise a works
 * order" quietly never became one. `works_order_id` has been on the finding
 * since the table was written; nothing filled it in.
 *
 * The trade and the urgency are ASKED FOR rather than guessed. Neither is on
 * the finding: "window catch does not hold shut" is a locksmith or a joiner
 * depending on the window, and how fast it matters is a judgement made
 * standing in front of it. Defaulting them would put a wrong trade on a real
 * job and make somebody's diary wrong.
 */
function RaiseWorksOrder({ finding, busy, onMove }: { finding: Finding; busy: boolean; onMove: Move }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(REPAIR_CATEGORIES[0]);
  const [urgency, setUrgency] = useState<string>("routine");

  if (finding.worksOrderId) {
    return (
      <p className="mt-1.5 text-[11px] text-muted">
        Raised as a works order. It carries on{" "}
        <Link href={`/maintenance?open=${encodeURIComponent(finding.worksOrderId)}`} className="underline">
          Maintenance
        </Link>
        .
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-[11px] font-semibold text-accent-dark underline">
        Raise the works order
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-line/80 bg-page px-2.5 py-1.5 text-[12px]">
        {REPAIR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="rounded-xl border border-line/80 bg-page px-2.5 py-1.5 text-[12px]">
        {URGENCIES.map((u) => <option key={u.id} value={u.id}>{u.label} · {u.within}</option>)}
      </select>
      <PressButton
        disabled={busy}
        onClick={() => void onMove({ raiseWorksOrder: { findingId: finding.id, category, urgency } }, "Works order")}
        className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page"
      >
        Raise it
      </PressButton>
      <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-muted underline">Cancel</button>
    </div>
  );
}

function Findings({ inspection, findings, busy, onMove, onRecord }: { inspection: Inspection; findings: Finding[]; busy: boolean; onMove: Move; onRecord: (at: "checks" | "rooms" | "writeup") => void }) {
  const checks = asChecks(inspection.checks);
  /* On screen only what needs reading: a plain yes is counted, not listed.
     The landlord's email and the printout carry every line. */
  const allLines = checkLines(checks);
  const lines = allLines.filter((l) => !/: yes$/.test(l));
  const fine = allLines.length - lines.length;
  const [room, setRoom] = useState(ROOMS[0]);
  const [item, setItem] = useState("");
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState<"good" | "fair" | "poor">("good");
  const [action, setAction] = useState("none");
  const canAdd = Boolean(inspection.visitedAt);

  return (
    <section className="mt-5 rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">What we found</p>
        {canAdd && (
          <button type="button" onClick={() => onRecord("rooms")} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold">
            Open the visit record
          </button>
        )}
      </div>
      {/* The checks on the day, the ones that failed first. */}
      {canAdd && (
        <div className="mt-3 rounded-xl bg-accent-soft/30 px-3 py-2.5 text-[12px]">
          <p className="font-semibold">
            Safety &amp; checks · {checksDone(checks)} of {CHECKS.length} answered
          </p>
          {allLines.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-muted">
              {lines.map((l) => (
                <li key={l} className={/: NO/.test(l) ? "text-accent-dark" : ""}>{l}</li>
              ))}
              {fine > 0 && <li>{fine === allLines.length ? "All" : fine} answered yes - all fine.</li>}
            </ul>
          ) : (
            <button type="button" onClick={() => onRecord("checks")} className="mt-0.5 text-[11.5px] text-accent-dark underline">
              Answer the checks
            </button>
          )}
        </div>
      )}
      <ul className="mt-3 divide-y divide-line/50">
        {findings.map((f) => (
          <li key={f.id} className="py-2.5 text-[12px]">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{[f.room, f.item === "Overall" ? "" : f.item].filter(Boolean).join(" · ")}</span>
                {f.note && <span className="block text-muted">{f.note}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Pill tone={f.condition === "poor" ? "accent" : "neutral"}>{f.condition}</Pill>
                <span className="text-[11px] text-muted">{ACTIONS.find((a) => a.id === f.action)?.label}</span>
              </span>
            </div>
            {/* What it looked like. */}
            <FindingPhotos finding={f} busy={busy} onMove={onMove} />
            {/* A finding that asked for work, and the job it became - or the
                one control that makes it one. */}
            {f.action === "works_order" && <RaiseWorksOrder finding={f} busy={busy} onMove={onMove} />}
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
              onClick={async () => {
                /* Cleared once it has landed, not before - a refused finding
                   used to take what was typed with it. */
                if (!(await onMove({ finding: { room, item, note, condition, action } }, "Finding"))) return;
                setItem(""); setNote(""); setAction("none"); setCondition("good");
              }}
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

function NoteBox({ busy, onSend }: { busy: boolean; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-4 flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="min-w-0 flex-1 rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
      {/* The box empties once the note has landed; refused, the words stay. */}
      <PressButton disabled={busy || !text.trim()} onClick={async () => { if (await onSend(text.trim())) setText(""); }} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold">
        Add
      </PressButton>
    </div>
  );
}
