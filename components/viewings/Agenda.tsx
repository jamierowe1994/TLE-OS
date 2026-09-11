"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { KIND_META, type Appt } from "@/lib/diary";
import type { Outcome } from "@/components/ViewingDrawer";
import {
  SAGE_INK,
  SAGE_WASH,
  bubble,
  card,
  dateOfOffset,
  fmtFull,
  fmtShort,
  nearLabel,
  primary,
  subOf,
  titleOf,
  toneOf,
} from "@/components/viewings/shared";

/**
 * The panel beside the calendar: the answer to whichever question was asked.
 *
 *   day       one day, in time order - the default, and what a month click opens
 *   upcoming  everything still to happen, grouped by day
 *   due       viewings that happened and nobody wrote down what was said
 *   in        viewings with feedback, ready for the landlord
 *
 * The seven-day question has its own grid (WeekGrid), not a list.
 *
 * Every row opens the appointment's quick look. Nothing on this panel is a
 * dead end, and nothing on it takes you off the page.
 */

export type AgendaMode = "day" | "upcoming" | "due" | "in";

/** How many rows are drawn before you ask for more. A real Thursday came
 *  back from REX with 32 entries on it. */
const PAGE = 8;

export function ApptRow({
  a,
  outcome,
  showDay,
  sentExtra,
  onOpen,
}: {
  a: Appt;
  outcome?: Outcome;
  /** Lead with the day rather than the time - for lists that span days. */
  showDay?: boolean;
  sentExtra?: Set<string>;
  onOpen: (a: Appt) => void;
}) {
  const meta = KIND_META[a.kind];
  const tone = toneOf(a.kind);
  const b = bubble(tone);
  const missing = a.comms.filter((c) => !c.done && !sentExtra?.has(`${a.id}:${c.label}`)).length;
  const past = a.day < 0;

  /* One pill, the fact that changes how the agent turns up or what is owed. */
  let pill: React.ReactNode = null;
  if (a.kind === "viewing" && past) {
    pill = outcome ? (
      <Pill style={{ background: SAGE_WASH, color: SAGE_INK }}>{outcome}</Pill>
    ) : (
      <Pill className="bg-accent-soft text-accent-dark">Feedback due</Pill>
    );
  } else if (a.kind === "viewing" && a.tenant) {
    pill = <Pill className="bg-accent-soft text-accent-dark">Tenanted</Pill>;
  } else if (a.comms.length && missing > 0) {
    pill = <Pill className="bg-accent-soft text-accent-dark">{missing} to send</Pill>;
  } else if (a.comms.length && missing === 0) {
    pill = <Pill style={{ background: SAGE_WASH, color: SAGE_INK }}>Confirmed</Pill>;
  } else if (a.kind !== "other") {
    pill = <Pill className="border border-line/60 text-muted">{meta.label}</Pill>;
  }

  return (
    <li className="border-b border-line/40 last:border-0">
      <button
        type="button"
        onClick={() => onOpen(a)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-panel"
      >
        <span className={`figures w-[52px] shrink-0 text-[12.5px] font-semibold ${past ? "text-muted" : "text-ink"}`}>
          {showDay ? fmtShort(dateOfOffset(a.day)).split(" ").slice(0, 2).join(" ") : a.allDay ? "All day" : a.start}
        </span>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${b.className}`} style={b.style}>
          <DoodleIcon name={meta.icon} size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-snug">{titleOf(a)}</span>
          <span className="block truncate text-[11px] text-muted">
            {showDay && !a.allDay ? `${a.start} · ` : ""}
            {subOf(a)}
          </span>
        </span>
        <span className="hidden shrink-0 md:block">{pill}</span>
        <span className="w-3 shrink-0 text-right text-[13px] text-muted/70">›</span>
      </button>
    </li>
  );
}

function Pill({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${className}`} style={style}>
      {children}
    </span>
  );
}

export default function Agenda({
  mode,
  selected,
  byDay,
  upcoming,
  due,
  fedBack,
  outcomes,
  loading,
  error,
  sentExtra,
  onOpen,
  onPrint,
  onPickDay,
}: {
  mode: AgendaMode;
  selected: number;
  byDay: Map<number, Appt[]>;
  upcoming: Appt[];
  due: Appt[];
  fedBack: Appt[];
  outcomes: Record<string, Outcome>;
  loading: boolean;
  error: string | null;
  sentExtra: Set<string>;
  onOpen: (a: Appt) => void;
  onPrint: () => void;
  onPickDay: (offset: number) => void;
}) {
  /* "See more" is a question about THIS list, so it resets with the list. */
  const [shown, setShown] = useState<{ key: string; n: number }>({ key: "", n: PAGE });
  const key = `${mode}:${selected}`;
  const n = shown.key === key ? shown.n : PAGE;
  const more = () => setShown({ key, n: n + PAGE });
  const less = () => setShown({ key, n: PAGE });

  const selDate = dateOfOffset(selected);
  const near = nearLabel(selected);

  let title: React.ReactNode;
  let count = 0;
  let body: React.ReactNode;
  let empty: string;

  const seeMore = (total: number) =>
    total > n ? (
      <button
        type="button"
        onClick={more}
        className="mt-2 w-full rounded-xl border border-line/60 py-2.5 text-center text-[12px] font-semibold transition-colors hover:border-ink"
      >
        See more · {total - n} to go
      </button>
    ) : n > PAGE ? (
      <button
        type="button"
        onClick={less}
        className="mt-2 w-full rounded-xl border border-line/60 py-2.5 text-center text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
      >
        Show less
      </button>
    ) : null;

  if (mode === "day") {
    const list = byDay.get(selected) ?? [];
    count = list.length;
    title = (
      <>
        <h2 className="hand text-[17px] leading-tight">{fmtFull(selDate)}</h2>
        {near && (
          <Pill className={selected === 0 ? "bg-accent-soft text-accent-dark" : "border border-line/60 text-muted"}>{near}</Pill>
        )}
      </>
    );
    empty = loading
      ? "Reading the diary…"
      : selected < 0
        ? "Nothing was booked that day."
        : "The day is free.";
    body = (
      <>
        <ul>
          {list.slice(0, n).map((a) => (
            <ApptRow key={a.id} a={a} outcome={outcomes[a.id]} sentExtra={sentExtra} onOpen={onOpen} />
          ))}
        </ul>
        {seeMore(list.length)}
      </>
    );
  } else if (mode === "upcoming") {
    count = upcoming.length;
    title = <h2 className="hand text-[17px] leading-tight">Everything upcoming</h2>;
    empty = loading ? "Reading the diary…" : "Nothing booked ahead.";
    const days = [...new Set(upcoming.map((a) => a.day))];
    /* Paged by DAY rather than by row, so a day is never cut in half. */
    let left = n;
    const drawn: number[] = [];
    for (const d of days) {
      if (left <= 0) break;
      drawn.push(d);
      left -= (byDay.get(d) ?? []).length;
    }
    const total = days.reduce((s, d) => s + (byDay.get(d) ?? []).length, 0);
    const shownRows = drawn.reduce((s, d) => s + (byDay.get(d) ?? []).length, 0);
    body = (
      <>
        {drawn.map((d) => {
          const list = byDay.get(d) ?? [];
          const dn = nearLabel(d);
          return (
            <div key={d} className="mb-3 last:mb-0">
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className="flex w-full items-baseline gap-2 border-b border-line/60 px-2 pb-1.5 text-left"
              >
                <span className={`text-[12.5px] font-semibold ${d === 0 ? "text-accent-dark" : ""}`}>
                  {dn ?? fmtFull(dateOfOffset(d))}
                </span>
                {dn && <span className="text-[10.5px] text-muted">{fmtShort(dateOfOffset(d))}</span>}
                <span className="ml-auto text-[10.5px] text-muted">
                  {list.length} {list.length === 1 ? "appointment" : "appointments"}
                </span>
              </button>
              <ul>
                {list.map((a) => (
                  <ApptRow key={a.id} a={a} outcome={outcomes[a.id]} sentExtra={sentExtra} onOpen={onOpen} />
                ))}
              </ul>
            </div>
          );
        })}
        {total > shownRows ? (
          <button
            type="button"
            onClick={more}
            className="mt-2 w-full rounded-xl border border-line/60 py-2.5 text-center text-[12px] font-semibold transition-colors hover:border-ink"
          >
            See more · {total - shownRows} to go
          </button>
        ) : (
          n > PAGE && (
            <button
              type="button"
              onClick={less}
              className="mt-2 w-full rounded-xl border border-line/60 py-2.5 text-center text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
            >
              Show less
            </button>
          )
        )}
      </>
    );
  } else {
    const list = mode === "due" ? due : fedBack;
    count = list.length;
    title = (
      <h2 className="hand text-[17px] leading-tight">
        {mode === "due" ? "Feedback due" : "Feedback in"}
        <span className="mt-0.5 block text-[12px] font-normal text-muted">
          {mode === "due"
            ? "Been, and nobody has written down what was said"
            : "What the applicant said, ready for the landlord"}
        </span>
      </h2>
    );
    empty = loading
      ? "Reading the diary…"
      : mode === "due"
        ? "Nothing waiting on feedback. Rare, and good."
        : "No feedback recorded yet.";
    body = (
      <>
        <ul>
          {list.slice(0, n).map((a) => (
            <ApptRow key={a.id} a={a} outcome={outcomes[a.id]} showDay sentExtra={sentExtra} onOpen={onOpen} />
          ))}
        </ul>
        {seeMore(list.length)}
      </>
    );
  }

  return (
    <section className={`fade-up flex h-full flex-col ${card} p-5`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/60 pb-3">
        {title}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {count ? `${count} ${count === 1 ? "appointment" : "appointments"}` : loading ? "" : "Nothing booked"}
          </span>
          {(mode === "day" || mode === "upcoming") && (
            <button type="button" onClick={onPrint} className={primary} title="Print this as a run sheet">
              <DoodleIcon name="doc" size={13} />
              Print
            </button>
          )}
        </span>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {error && !loading && (
          <p className="mb-2 rounded-xl border border-accent-dark/30 bg-accent-soft/40 px-3 py-2 text-[11.5px] text-accent-dark">
            {error}
          </p>
        )}
        {count ? body : <p className="py-10 text-center text-[12.5px] text-muted">{empty}</p>}
      </div>
    </section>
  );
}
