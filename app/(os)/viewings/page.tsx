"use client";

import { useState } from "react";
import DiaryCalendar from "@/components/DiaryCalendar";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import ViewingDrawer, { type Outcome } from "@/components/ViewingDrawer";
import { FlowTag, Ghost, Pill } from "@/components/Wire";
import { DIARY, minutesOf, type Appt } from "@/lib/diary";

/**
 * Viewings: the week's diary, and every row opens into the whole story —
 * when, which property, who's coming, whether the home is tenanted, and
 * whether every confirmation actually went. The rows read from the same
 * diary as the calendar and the dashboard, so there is one truth.
 */

const OUTCOMES: Record<string, Outcome> = {
  "d-past-clark": "Applying",
  "d-past-williams": "Thinking",
  "d-past-patel": "Not for them",
};

function dayName(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "long" });
}

function dayDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function Viewings() {
  const [tab, setTab] = useState<"diary" | "recent">("diary");
  const [openId, setOpenId] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  /** "apptId:label" for anything sent from the drawer this session. */
  const [sentExtra, setSentExtra] = useState<Set<string>>(new Set());

  const viewings = DIARY.filter((a) => a.kind === "viewing");
  const upcoming = viewings.filter((a) => a.day >= 0).sort(
    (a, b) => a.day - b.day || minutesOf(a.start) - minutesOf(b.start)
  );
  const recent = viewings.filter((a) => a.day < 0).sort((a, b) => b.day - a.day);
  const days = [...new Set(upcoming.map((a) => a.day))];
  const open = viewings.find((a) => a.id === openId) ?? null;

  /** The row's state at a glance: every message gone, or something missing. */
  function commState(a: Appt) {
    const missing = a.comms.filter((c) => !c.done && !sentExtra.has(`${a.id}:${c.label}`)).length;
    return missing === 0
      ? { label: "All confirmed", tone: "good" as const }
      : { label: `${missing} to send`, tone: "accent" as const };
  }

  function Row({ a, showDay }: { a: Appt; showDay?: boolean }) {
    const property = a.what.replace(/^[^—]+—\s*/, "");
    const state = commState(a);
    const outcome = OUTCOMES[a.id];
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpenId(a.id)}
          className="flex w-full items-center gap-3 border-b border-line/40 py-3 text-left transition-colors last:border-0 hover:bg-accent-soft/20"
        >
          <span className={`figures w-16 shrink-0 text-[12.5px] ${showDay ? "text-muted" : "text-accent-dark"}`}>
            {showDay ? dayDate(a.day).split(" ").slice(0, 2).join(" ") : a.start}
          </span>
          <span className="min-w-0 flex-1">
            <span className="hand block truncate text-[13px]">{a.who}</span>
            <span className="block truncate text-[10.5px] text-muted">
              {property} · {a.where}
            </span>
          </span>
          {/* Tenanted is a fact the agent needs BEFORE opening the row. */}
          {a.tenant && (
            <span className="hidden shrink-0 text-[10px] font-semibold text-accent-dark sm:block">
              TENANTED
            </span>
          )}
          <span className="hidden shrink-0 text-[11px] text-muted sm:block">{a.agent}</span>
          {a.day < 0 && outcome ? (
            <Pill tone={outcome === "Applying" ? "good" : "neutral"}>{outcome}</Pill>
          ) : (
            <Pill tone={state.tone}>{state.label}</Pill>
          )}
          <span className="text-[12px] text-muted">›</span>
        </button>
      </li>
    );
  }

  return (
    <>
      <PageHeader
        title="Viewings"
        blurb="Every viewing opens into its whole story: the property, who's coming, whether someone lives there — and whether every confirmation actually went."
        illustration="/illustrations/notioly/checking-the-calendar.svg"
        lineBreak="dip"
      />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <FlowTag from="The shared diary — 365 calendar once sign-in lands" />
        <div className="flex items-center gap-2">
          {(["diary", "recent"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`hand rounded-full px-4 py-2 text-[12.5px] transition-colors ${
                tab === t
                  ? "bg-accent-soft/60 font-medium text-accent-dark"
                  : "text-muted hover:text-ink"
              }`}
            >
              {t === "diary" ? `Diary · ${upcoming.length}` : `Feedback · ${recent.length}`}
            </button>
          ))}
        </div>
      </div>

      {tab === "diary" ? (
        <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
          {days.map((d) => {
            const list = upcoming.filter((a) => a.day === d);
            return (
              <div key={d} className="mb-5 last:mb-0">
                <div className="flex items-baseline gap-3 border-b border-line/70 pb-2">
                  <h2 className={`text-[15px] ${d === 0 ? "text-accent-dark" : ""}`}>
                    {dayName(d)}
                  </h2>
                  <span className="text-[10.5px] text-muted">{dayDate(d)}</span>
                  <span className="ml-auto text-[10.5px] text-muted">
                    {list.length} viewing{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul>
                  {list.map((a) => (
                    <Row key={a.id} a={a} />
                  ))}
                </ul>
              </div>
            );
          })}
          {!upcoming.length && (
            <p className="py-8 text-center text-[12.5px] text-muted">
              Nothing booked — the listings page is where viewings start.
            </p>
          )}
        </div>
      ) : (
        <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[15px]">Recent feedback</h2>
            <span className="text-[11px] text-muted">
              What the applicant said, ready for the landlord
            </span>
          </div>
          <ul>
            {recent.map((a) => (
              <Row key={a.id} a={a} showDay />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => setCalOpen(true)}
          className="block-pop flex items-center gap-3 rounded-2xl border border-line/80 bg-box p-5 text-left hover:border-ink"
        >
          <DoodleIcon name="calendar" size={22} className="shrink-0 text-accent-dark" />
          <span className="min-w-0">
            <span className="hand block text-[14px]">Week calendar</span>
            <span className="block text-[11px] text-muted">
              The full grid — every appointment, clickable through to its file.
            </span>
          </span>
          <span className="ml-auto text-[13px] text-muted">→</span>
        </button>
        <Ghost
          label="Landlord feedback report"
          detail="Every viewing and its outcome, per property — the thing landlords chase for."
          tag={<FlowTag to="REX" />}
        />
      </div>

      <ViewingDrawer
        appt={open}
        outcome={open ? OUTCOMES[open.id] : undefined}
        onClose={() => setOpenId(null)}
        sentExtra={sentExtra}
        onSend={(id, label) =>
          setSentExtra((cur) => new Set(cur).add(`${id}:${label}`))
        }
      />

      <DiaryCalendar open={calOpen} onClose={() => setCalOpen(false)} />
    </>
  );
}
