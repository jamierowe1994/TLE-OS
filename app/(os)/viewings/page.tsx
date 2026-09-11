"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import Segmented from "@/components/Segmented";
import ViewingDrawer, { type Outcome } from "@/components/ViewingDrawer";
import Agenda, { ApptRow, type AgendaMode } from "@/components/viewings/Agenda";
import AppointmentDrawer from "@/components/viewings/AppointmentDrawer";
import Month from "@/components/viewings/Month";
import PrintSheet, { type PrintGroup } from "@/components/viewings/PrintSheet";
import Tiles from "@/components/viewings/Tiles";
import WeekGrid from "@/components/viewings/WeekGrid";
import { card, dateOfOffset, fmtFull, fmtShort, groupByDay, nearLabel } from "@/components/viewings/shared";
import { KIND_META, minutesOf, VIEWING_OUTCOMES, type Appt, type ApptKind } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";

/**
 * Viewings: one screen, one person's diary.
 *
 * ── The shape (James, 11 Sep 2026) ────────────────────────────────────────
 *
 * A bento, not a scroll. The five tiles sit in the calendar's column, so the
 * calendar comes up under them and the day beside it rises to the top - the
 * two columns line up and the page ends where the calendar ends. The week
 * strip and the "landlord feedback report" that used to hang underneath are
 * gone: the tiles answer the week, and the report was a promise, not a
 * feature.
 *
 * Every tile changes what the panel beside the calendar answers and never
 * changes screen. "Next 7 days" opens the calendar out into a seven-day grid
 * rather than dropping you in a list. The Diary toggle is still here for the
 * long read - that one is allowed to run past the fold.
 *
 * ── Whose diary ───────────────────────────────────────────────────────────
 *
 * An agent's book is served already scoped to their mailbox. An owner gets
 * the whole business, so this screen narrows it to THEIR OWN entries first
 * and offers colleagues by name; an owner with no calendar of their own
 * (James's test account, Susan) sees everybody, because an empty page would
 * be the wrong answer to "what's going on".
 */

const OUTCOMES: Record<string, Outcome> = VIEWING_OUTCOMES;

type TileId = "upcoming" | "today" | "week" | "due" | "in";
/** What the space beside the month is showing. `day` is a month click. */
type Panel = AgendaMode | "week";

export default function Viewings() {
  const [view, setView] = useState<"calendar" | "diary">("calendar");
  const [panel, setPanel] = useState<Panel>("day");
  const [selected, setSelected] = useState(0);
  const [monthShift, setMonthShift] = useState(0);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [fullId, setFullId] = useState<string | null>(null);
  /** undefined = not decided yet; null = everyone; a name = that person. */
  const [fAgent, setFAgent] = useState<string | null | undefined>(undefined);
  const [fKind, setFKind] = useState<ApptKind | null>(null);
  /** "apptId:label" for anything sent from a drawer this session. */
  const [sentExtra, setSentExtra] = useState<Set<string>>(new Set());

  const { appts: DIARY, loading, everything, error } = useDiary();

  /* Who is looking. The owner's own entries are the default, matched on the
     mailbox rather than the name - see Appt.agentEmail. */
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: { name?: string; email?: string } } | null) =>
        setMe({ name: j?.user?.name ?? "", email: (j?.user?.email ?? "").toLowerCase() })
      )
      .catch(() => setMe({ name: "", email: "" }));
  }, []);

  const agents = useMemo(
    () => [...new Set(DIARY.map((a) => a.agent).filter(Boolean))].sort(),
    [DIARY]
  );

  useEffect(() => {
    if (fAgent !== undefined || loading || !me) return;
    if (!everything) return setFAgent(null);
    const mine = DIARY.find(
      (a) => (me.email && (a.agentEmail ?? "").toLowerCase() === me.email) || (me.name && a.agent === me.name)
    );
    setFAgent(mine ? mine.agent : null);
  }, [fAgent, loading, me, everything, DIARY]);

  const kinds = useMemo(
    () => (Object.keys(KIND_META) as ApptKind[]).filter((k) => DIARY.some((a) => a.kind === k)),
    [DIARY]
  );

  /** The book being looked at: one person, and the kinds asked for. */
  const scoped = useMemo(
    () => DIARY.filter((a) => (!fAgent || a.agent === fAgent) && (!fKind || a.kind === fKind)),
    [DIARY, fAgent, fKind]
  );
  const byDay = useMemo(() => groupByDay(scoped), [scoped]);

  const upcoming = useMemo(
    () =>
      scoped
        .filter((a) => a.day >= 0)
        .sort((a, b) => a.day - b.day || Number(!!b.allDay) - Number(!!a.allDay) || minutesOf(a.start) - minutesOf(b.start)),
    [scoped]
  );
  /* Feedback is a viewing's business only. */
  const been = useMemo(
    () => scoped.filter((a) => a.kind === "viewing" && a.day < 0).sort((a, b) => b.day - a.day || minutesOf(b.start) - minutesOf(a.start)),
    [scoped]
  );
  const due = useMemo(() => been.filter((a) => !OUTCOMES[a.id]), [been]);
  const fedBack = useMemo(() => been.filter((a) => Boolean(OUTCOMES[a.id])), [been]);
  const today = byDay.get(0) ?? [];
  const week = upcoming.filter((a) => a.day <= 6);

  const quick = DIARY.find((a) => a.id === quickId) ?? null;
  const full = DIARY.find((a) => a.id === fullId) ?? null;

  function pickDay(offset: number) {
    setSelected(offset);
    setPanel("day");
    const d = dateOfOffset(offset);
    const t = new Date();
    setMonthShift((d.getFullYear() - t.getFullYear()) * 12 + (d.getMonth() - t.getMonth()));
  }

  function pickTile(id: TileId) {
    if (id === "today") return pickDay(0);
    setPanel(id);
  }

  const tiles = [
    { id: "upcoming" as const, label: "Upcoming", icon: "analytics", count: upcoming.length, blurb: "Everything still to happen", on: panel === "upcoming" },
    { id: "today" as const, label: "Today", icon: "clock", count: today.length, blurb: "What is on today", on: panel === "day" && selected === 0 },
    { id: "week" as const, label: "Next 7 days", icon: "calendar", count: week.length, blurb: "Today and the six days after it, hour by hour", on: panel === "week" },
    { id: "due" as const, label: "Feedback due", icon: "message", count: due.length, blurb: "Been, and nobody has written down what was said", on: panel === "due" },
    { id: "in" as const, label: "Feedback in", icon: "checklist", count: fedBack.length, blurb: "Ready for the landlord", on: panel === "in" },
  ];

  /* What the Print button prints: the day, or the seven days. */
  const printGroups: PrintGroup[] =
    panel === "day"
      ? [{ heading: fmtFull(dateOfOffset(selected)), sub: nearLabel(selected) ?? undefined, list: byDay.get(selected) ?? [] }]
      : Array.from({ length: 7 }, (_, i) => ({
          heading: fmtFull(dateOfOffset(i)),
          sub: nearLabel(i) ?? undefined,
          list: byDay.get(i) ?? [],
        }));
  const owner = fAgent ?? (everything ? "The team" : me?.name ?? "");

  /* The Diary list: the same rows, allowed to run long. */
  const listMode: AgendaMode | "week" = panel;
  const listRows =
    listMode === "day"
      ? (byDay.get(selected) ?? [])
      : listMode === "upcoming"
        ? upcoming
        : listMode === "week"
          ? week
          : listMode === "due"
            ? due
            : fedBack;
  const listTitle =
    listMode === "day"
      ? fmtFull(dateOfOffset(selected))
      : listMode === "upcoming"
        ? "Everything upcoming"
        : listMode === "week"
          ? "The next 7 days"
          : listMode === "due"
            ? "Feedback due"
            : "Feedback in";
  const listDays = [...new Set(listRows.map((a) => a.day))];

  return (
    <>
      <PageHeader
        title="Viewings"
        blurb="Your day, and the week around it. Every appointment opens into what it is, where it is, who's coming and what you need before you knock."
        illustration="/illustrations/scooter-still.webp"
        illustrationAspect={0.6486}
        backdrop="/illustrations/houses-row.webp"
        backdropWidth={620}
        lineBreak="none"
        actions={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            <Segmented
              options={[
                { id: "calendar", label: "Calendar", icon: <DoodleIcon name="calendar" size={14} /> },
                { id: "diary", label: "Diary", icon: <DoodleIcon name="list" size={14} /> },
              ]}
              value={view}
              onChange={setView}
            />
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Only an owner has a book to choose from. An agent's diary is
                  their own and arrives already scoped. */}
              {everything && agents.length > 1 && (
                <PickOne
                  label="Everyone"
                  icon="user"
                  options={agents.map((a) => ({ id: a, label: a === me?.name ? `${a} (you)` : a }))}
                  value={fAgent ?? null}
                  onChange={setFAgent}
                />
              )}
              {kinds.length > 1 && (
                <PickOne
                  label="Everything"
                  icon="grid"
                  options={kinds.map((k) => ({ id: k, label: KIND_META[k].label }))}
                  value={fKind}
                  onChange={setFKind}
                />
              )}
            </div>
          </div>
        }
      />

      {view === "calendar" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* ── Left: the questions, then the month. ── */}
          {/* min-w-0 on both columns: the tile row's five shrink-0 tiles would
              otherwise set the column's minimum width to their sum on a phone
              and push the month card off the right-hand edge. */}
          <div className="flex min-w-0 flex-col gap-4">
            <Tiles tiles={tiles} onPick={pickTile} />
            <Month byDay={byDay} selected={selected} onSelect={pickDay} monthShift={monthShift} onMonthShift={setMonthShift} />
          </div>

          {/* ── Right: the answer. Pinned to the left column's height from
                 lg up, so a long day scrolls inside its card rather than
                 pushing the page down. ── */}
          <div className="min-h-[360px] min-w-0 lg:relative">
            <div className="lg:absolute lg:inset-0">
              {panel === "week" ? (
                <WeekSummary byDay={byDay} onPickDay={pickDay} onPrint={() => window.print()} />
              ) : (
                <Agenda
                  mode={panel}
                  selected={selected}
                  byDay={byDay}
                  upcoming={upcoming}
                  due={due}
                  fedBack={fedBack}
                  outcomes={OUTCOMES}
                  loading={loading}
                  error={error}
                  sentExtra={sentExtra}
                  onOpen={(a) => setQuickId(a.id)}
                  onPrint={() => window.print()}
                  onPickDay={pickDay}
                />
              )}
            </div>
          </div>

          {/* ── The calendar, opened out. ── */}
          {panel === "week" && (
            <div className="lg:col-span-2">
              <WeekGrid appts={scoped} onOpen={(a) => setQuickId(a.id)} onPrint={() => window.print()} onPickDay={pickDay} />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 min-w-0 space-y-4">
          <Tiles tiles={tiles} onPick={pickTile} />
          <section className={`fade-up ${card} p-5`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-3 border-b border-line/60 pb-3">
              <h2 className="hand text-[17px]">
                {listTitle}
                <span className="figures ml-2 text-[14px] text-muted">{listRows.length}</span>
              </h2>
              <button type="button" onClick={() => window.print()} className="ml-auto text-[11.5px] font-semibold text-muted underline hover:text-ink">
                Print
              </button>
            </div>
            {listRows.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-muted">
                {loading ? "Reading the diary…" : listMode === "due" ? "Nothing waiting on feedback. Rare, and good." : listMode === "in" ? "No feedback recorded yet." : "Nothing booked."}
              </p>
            ) : listMode === "due" || listMode === "in" ? (
              <ul className="cascade">
                {listRows.map((a) => (
                  <ApptRow key={a.id} a={a} outcome={OUTCOMES[a.id]} showDay sentExtra={sentExtra} onOpen={(x) => setQuickId(x.id)} />
                ))}
              </ul>
            ) : (
              listDays.map((d) => {
                const list = listRows.filter((a) => a.day === d);
                const dn = nearLabel(d);
                return (
                  <div key={d} className="mb-5 last:mb-0">
                    <div className="flex items-baseline gap-3 border-b border-line/60 px-2 pb-2">
                      <h3 className={`text-[14px] ${d === 0 ? "text-accent-dark" : ""}`}>{dn ?? fmtFull(dateOfOffset(d))}</h3>
                      <span className="text-[10.5px] text-muted">{fmtShort(dateOfOffset(d))}</span>
                      <span className="ml-auto text-[10.5px] text-muted">
                        {list.length} {list.length === 1 ? "appointment" : "appointments"}
                      </span>
                    </div>
                    <ul className="cascade">
                      {list.map((a) => (
                        <ApptRow key={a.id} a={a} outcome={OUTCOMES[a.id]} sentExtra={sentExtra} onOpen={(x) => setQuickId(x.id)} />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}

      <PrintSheet owner={owner} groups={printGroups} outcomes={OUTCOMES} />

      <AppointmentDrawer
        appt={quick}
        outcome={quick ? OUTCOMES[quick.id] : undefined}
        onClose={() => setQuickId(null)}
        onOpenViewing={(a) => {
          setQuickId(null);
          setFullId(a.id);
        }}
        sentExtra={sentExtra}
        onSend={(id, label) => setSentExtra((cur) => new Set(cur).add(`${id}:${label}`))}
      />

      <ViewingDrawer
        appt={full}
        outcome={full ? OUTCOMES[full.id] : undefined}
        onClose={() => setFullId(null)}
        sentExtra={sentExtra}
        onSend={(id, label) => setSentExtra((cur) => new Set(cur).add(`${id}:${label}`))}
      />
    </>
  );
}

/**
 * Beside the month while the week grid is open: the seven days as a list,
 * each a door to that day, so the grid below and this panel agree.
 */
function WeekSummary({
  byDay,
  onPickDay,
  onPrint,
}: {
  byDay: Map<number, Appt[]>;
  onPickDay: (offset: number) => void;
  onPrint: () => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => i);
  const total = days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);
  return (
    <section className={`fade-up flex h-full flex-col ${card} p-5`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/60 pb-3">
        <h2 className="hand text-[17px] leading-tight">The week at a glance</h2>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted">{total} {total === 1 ? "appointment" : "appointments"}</span>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-2 rounded-full bg-brown px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <DoodleIcon name="doc" size={13} />
            Print
          </button>
        </span>
      </div>
      <ul className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const timed = list.filter((a) => !a.allDay);
          const first = timed[0]?.start;
          const last = timed.length ? timed[timed.length - 1].start : undefined;
          const viewings = list.filter((a) => a.kind === "viewing").length;
          const dn = nearLabel(d);
          return (
            <li key={d} className="border-b border-line/40 last:border-0">
              <button type="button" onClick={() => onPickDay(d)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-panel">
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold ${d === 0 ? "text-accent-dark" : ""}`}>
                    {dn ?? dateOfOffset(d).toLocaleDateString("en-GB", { weekday: "long" })}
                    <span className="ml-2 text-[11px] font-normal text-muted">{fmtShort(dateOfOffset(d))}</span>
                  </span>
                  <span className="block text-[11px] text-muted">
                    {list.length === 0
                      ? "Free"
                      : `${first && last ? `${first} to ${last}` : "All day"}${viewings ? ` · ${viewings} ${viewings === 1 ? "viewing" : "viewings"}` : ""}`}
                  </span>
                </span>
                <span className={`figures text-[17px] font-semibold ${list.length ? "text-ink" : "text-muted/40"}`}>{list.length}</span>
                <span className="w-3 text-right text-[13px] text-muted/70">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
