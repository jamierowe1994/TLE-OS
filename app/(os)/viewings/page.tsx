"use client";

import { useMemo, useState } from "react";
import DiaryCalendar from "@/components/DiaryCalendar";
import DiaryMonth from "@/components/DiaryMonth";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import Segmented from "@/components/Segmented";
import StageTabs from "@/components/StageTabs";
import ViewingDrawer, { type Outcome } from "@/components/ViewingDrawer";
import { FlowTag, Ghost, Pill } from "@/components/Wire";
import { KIND_META, minutesOf, VIEWING_OUTCOMES, type Appt, type ApptKind } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";

/**
 * Viewings: the week's diary, and every row opens into the whole story —
 * when, which property, who's coming, whether the home is tenanted, and
 * whether every confirmation actually went. The rows read from the same
 * diary as the calendar and the dashboard, so there is one truth.
 */

const OUTCOMES: Record<string, Outcome> = VIEWING_OUTCOMES;

/** What the panel calls itself, per stage. */
const STAGE_TITLE: Record<string, string> = {
  upcoming: "All upcoming",
  today: "Today",
  week: "Next 7 days",
  due: "Feedback due",
  in: "Feedback in",
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

function Legend({ past }: { past?: boolean }) {
  return (
    <div className="mb-3 hidden items-center gap-3 border-b border-line/70 pb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted/70 sm:flex">
      <span className="w-16 shrink-0">{past ? "When" : "Time"}</span>
      <span className="min-w-0 flex-1">Applicant · property</span>
      <span className="w-24 shrink-0">Occupancy</span>
      <span className="w-16 shrink-0">Agent</span>
      <span className="w-[110px] shrink-0 text-right">{past ? "Outcome" : "Messages"}</span>
      <span className="w-3" />
    </div>
  );
}

export default function Viewings() {
  /**
   * The calendar is the DEFAULT shape of this page (James, 10 Sep 2026).
   *
   * The list only ever answered "what is left today"; the question agents
   * actually arrive with is "what have I got on the 23rd", and no amount of
   * scrolling a today-first list answers that. The list is still here — it is
   * the better read once you know which day you care about — but you now
   * choose it rather than being given it.
   */
  const [view, setView] = useState<"calendar" | "diary">("calendar");
  /**
   * Which question the list is answering.
   *
   * Two hand-drawn pills, "Diary · 41" and "Feedback · 12", asked this before
   * - the same question the other three boards ask with StageTabs, drawn a
   * fourth way. Today and the next seven days are on it now because they are
   * what an agent actually arrives asking, and a today-first list never
   * answered them.
   *
   * NOT a date dropdown as well. The other boards carry one because their
   * records are not sorted by date on the screen; these are, and two controls
   * for one filter is how a screen starts to disagree with itself.
   */
  const [stage, setStage] = useState<"upcoming" | "today" | "week" | "due" | "in">("upcoming");
  const [openId, setOpenId] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  /** Narrowing, shared by both shapes so switching view keeps your place. */
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [fKind, setFKind] = useState<ApptKind | null>(null);
  /** "apptId:label" for anything sent from the drawer this session. */
  const [sentExtra, setSentExtra] = useState<Set<string>>(new Set());

  const { appts: DIARY, live, loading, everything } = useDiary();

  /** Whoever actually appears in this book, in name order. */
  const agents = useMemo(
    () => [...new Set(DIARY.map((a) => a.agent).filter(Boolean))].sort(),
    [DIARY]
  );
  /** Only the kinds that are really in the diary — an empty filter row is a
   *  promise the data cannot keep. */
  const kinds = useMemo(
    () =>
      (Object.keys(KIND_META) as ApptKind[]).filter((k) => DIARY.some((a) => a.kind === k)),
    [DIARY]
  );

  /**
   * The calendar shows the WHOLE day — viewings, appraisals, travel and the
   * private blocks in between. A calendar that draws only viewings tells an
   * agent an afternoon is free when it is nothing of the sort.
   */
  const monthAppts = useMemo(
    () => DIARY.filter((a) => (!fAgent || a.agent === fAgent) && (!fKind || a.kind === fKind)),
    [DIARY, fAgent, fKind]
  );

  const viewings = DIARY.filter((a) => a.kind === "viewing" && (!fAgent || a.agent === fAgent));
  const upcoming = viewings.filter((a) => a.day >= 0).sort(
    (a, b) => a.day - b.day || minutesOf(a.start) - minutesOf(b.start)
  );
  const recent = viewings.filter((a) => a.day < 0).sort((a, b) => b.day - a.day);
  /* One place decides what each stage holds, so the count on a tab and the
     rows under it can never disagree. "Due" is a viewing that has happened
     and nobody has written down what was said - the only one of these that is
     a job rather than a view. */
  const buckets = useMemo(() => {
    const been = recent;
    return {
      upcoming,
      today: upcoming.filter((a) => a.day === 0),
      week: upcoming.filter((a) => a.day >= 0 && a.day <= 7),
      due: been.filter((a) => !OUTCOMES[a.id]),
      in: been.filter((a) => Boolean(OUTCOMES[a.id])),
    };
  }, [upcoming, recent]);
  const rows = buckets[stage];
  const past = stage === "due" || stage === "in";
  const days = [...new Set(rows.map((a) => a.day))];
  const open = DIARY.find((a) => a.id === openId) ?? null;

  /** The row's state at a glance: every message gone, or something missing. */
  function commState(a: Appt) {
    // A REX calendar entry carries no record of what was sent. Saying
    // "all confirmed" because the list is empty would be inventing comfort.
    if (a.fromRex && !a.comms.length) {
      return { label: "Not known", tone: "neutral" as const };
    }
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
          {/* Tenanted is a fact the agent needs BEFORE opening the row —
              stated either way, never blank, and given the room to be seen. */}
          <span className="hidden w-24 shrink-0 sm:block">
            {a.tenant ? (
              <Pill tone="accent">Tenanted</Pill>
            ) : a.tenant === null ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">Vacant</span>
            ) : (
              // undefined means nobody has told us — which is not the same
              // as empty, and an agent knocking on a tenanted door deserves
              // the difference.
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/50">Not known</span>
            )}
          </span>
          <span className="hidden w-16 shrink-0 truncate text-[11px] text-muted sm:block">{a.agent}</span>
          <span className="flex w-[110px] shrink-0 justify-end">
            {a.day < 0 && outcome ? (
              <Pill tone={outcome === "Applying" ? "good" : "neutral"}>{outcome}</Pill>
            ) : (
              <Pill tone={state.tone}>{state.label}</Pill>
            )}
          </span>
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
        /* The still, not the clip. The loop keyed cleanly but the source was
           soft, and 496K of soft is worse than 34K of sharp. scooter.webp is
           still in the repo if a better capture turns up. */
        illustration="/illustrations/scooter-still.webp"
        illustrationAspect={0.6486}
        /* A street for him to be riding down, standing on the same rule he
           does. James's own artwork, trimmed to its ink — the file already
           carried alpha, so the paper it was drawn on came off cleanly and
           the ground line in the drawing IS the bottom edge of the file,
           which is what lands it on the rule rather than near it. */
        backdrop="/illustrations/houses-row.webp"
        backdropWidth={470}
        /**
         * He rides ON the rule, and stays put while he does it.
         *
         * James's own clip, keyed off its black plate. The MP4 carries no
         * alpha - h264 cannot - and the background was pure (0,0,0), so the
         * transparency is cut per frame: flood the background in from the
         * border, and ALSO take any sealed pocket of the same pure black,
         * because the gap between her leg, the stem and the deck is enclosed
         * by the drawing and a flood from the edge can never reach it. Her
         * hair, the backpack and the scooter body are all darker than most of
         * her and every one of them survives, because they are nowhere near
         * 0 - the darkest thing kept is around 25 against a background of 0.
         *
         * Cropped to the union of every frame's ink, so she does not jitter
         * inside her own box. Measured on the finished loop: the bottom of
         * the ink moves 8px across 31 frames, which is her back foot kicking
         * - the wheels stay on the ground, so it reads as riding on the spot
         * rather than drifting off the side of the page.
         *
         * `lineBreak="none"` on purpose: DROP is 0 for it, so the rule stays
         * dead flat and reads as the road he is on. A dip would have the line
         * sagging under a scooter, which is the wrong physics for the joke.
         */
        lineBreak="none"
        shadow
        /* One row of chrome, under the blurb, in the same order as Listings,
           Market Appraisals and Applications: the shape switch first because
           it changes the whole screen, then the things that only narrow what
           is already on it. It used to sit in a row of its own below the
           header, which is a fourth arrangement of the same three controls. */
        actions={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <Segmented
          options={[
            {
              id: "calendar",
              label: "Calendar",
              icon: <DoodleIcon name="calendar" size={14} />,
            },
            { id: "diary", label: "Diary", icon: <DoodleIcon name="list" size={14} /> },
          ]}
          value={view}
          onChange={setView}
        />

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Only an owner has a book to filter. Everybody else is looking at
              their own diary, so a picker offering colleagues by name would be
              offering something the server will not answer for anyway. */}
          {everything && agents.length > 1 && (
            <PickOne
              label="All agents"
              icon="user"
              options={agents.map((a) => ({ id: a, label: a }))}
              value={fAgent}
              onChange={setFAgent}
            />
          )}
          {/* Kind only narrows the calendar — the list is viewings by
              definition, and a filter that greys out its own screen is a
              trap. */}
          {view === "calendar" && kinds.length > 1 && (
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

      {/* ── The stages, and the filter for them. Same component and the same
             row as Listings, Market Appraisals and Applications. Picking one
             is a question about a LIST, so it puts you in the list - the
             calendar has only the order a calendar has, and cannot show you
             "feedback still owed" at all. ── */}
      <StageTabs
        label="Viewing stages"
        allId="upcoming"
        value={stage}
        onChange={(id) => { setStage(id); setView("diary"); }}
        flow={false}
        stages={[
          { id: "upcoming" as const, label: "All upcoming", icon: "analytics", count: buckets.upcoming.length, blurb: "Everything still to happen" },
          { id: "today" as const, label: "Today", icon: "clock", count: buckets.today.length, blurb: "What is left today" },
          { id: "week" as const, label: "Next 7 days", icon: "calendar", count: buckets.week.length, blurb: "The week ahead" },
          { id: "due" as const, label: "Feedback due", icon: "message", count: buckets.due.length, blurb: "Been, and nobody has written down what was said" },
          { id: "in" as const, label: "Feedback in", icon: "checklist", count: buckets.in.length, blurb: "Ready for the landlord" },
        ]}
      />

      {view === "calendar" ? (
        <DiaryMonth
          appts={monthAppts}
          loading={loading}
          onOpen={(a) => setOpenId(a.id)}
          onOpenWeek={() => setCalOpen(true)}
        />
      ) : (
        <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px]">
              {STAGE_TITLE[stage]}
              <span className="figures ml-1.5 text-muted">({rows.length})</span>
            </h2>
            {stage === "in" && (
              <span className="text-[11px] text-muted">
                What the applicant said, ready for the landlord
              </span>
            )}
            {stage !== "upcoming" && stage !== "in" && (
              <button
                type="button"
                onClick={() => setStage("upcoming")}
                className="text-[11.5px] text-muted underline transition-colors hover:text-ink"
              >
                Show all upcoming
              </button>
            )}
          </div>
          <Legend past={past} />
          {past ? (
            <ul>
              {rows.map((a) => (
                <Row key={a.id} a={a} showDay />
              ))}
            </ul>
          ) : (
            days.map((d) => {
              const list = rows.filter((a) => a.day === d);
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
            })
          )}
          {!rows.length && (
            <p className="py-8 text-center text-[12.5px] text-muted">
              {stage === "due"
                ? "Nothing waiting on feedback. Rare, and good."
                : stage === "in"
                  ? "No feedback recorded yet."
                  : "Nothing booked — the listings page is where viewings start."}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* In the calendar the week grid is already offered under the week
            strip, where it belongs. Two doors to the same room reads as two
            rooms. */}
        {view === "diary" && (
          <button
            type="button"
            onClick={() => setCalOpen(true)}
            className="flex items-center gap-3 rounded-2xl border border-line/80 bg-box p-5 text-left transition-colors hover:border-ink"
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
        )}
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
