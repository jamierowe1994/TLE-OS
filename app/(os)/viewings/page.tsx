"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import { FlowTag, Ghost, Pill } from "@/components/Wire";

/**
 * Viewings: the week's diary. Book from a lead in two taps; the outcome is
 * the point — a viewing with no feedback is a viewing that taught nobody
 * anything, which is why the outcome column leads rather than trails.
 */

type Viewing = {
  id: string;
  time: string;
  applicant: string;
  property: string;
  locality: string;
  image: string | null;
  agent: string;
  outcome: "Booked" | "Confirm" | "Applying" | "Thinking" | "Not for them";
};

const DAYS: { label: string; date: string; today?: boolean; viewings: Viewing[] }[] = [
  {
    label: "Today",
    date: "Thu 6 Aug",
    today: true,
    viewings: [
      { id: "v1", time: "10:15", applicant: "Priya Shah", property: "12 Elm Gardens", locality: "Didsbury M20", image: null, agent: "Michael", outcome: "Booked" },
      { id: "v2", time: "13:00", applicant: "New landlord", property: "9 Granby Road", locality: "Salford M7", image: null, agent: "Kirstie", outcome: "Booked" },
      { id: "v3", time: "15:30", applicant: "Marcus Bell", property: "41 Harewood Road", locality: "Luton LU1", image: null, agent: "Kirstie", outcome: "Booked" },
      { id: "v4", time: "17:00", applicant: "Sophie Turner", property: "Flat 2, Mercer Street", locality: "Manchester M4", image: null, agent: "Kirstie", outcome: "Confirm" },
    ],
  },
  {
    label: "Tomorrow",
    date: "Fri 7 Aug",
    viewings: [
      { id: "v5", time: "09:30", applicant: "Daniel Okafor", property: "228a Chapter Road", locality: "London NW2", image: null, agent: "Michael", outcome: "Booked" },
      { id: "v6", time: "14:00", applicant: "Chloe Adams", property: "108 Cherry Tree Drive", locality: "Coventry CV4", image: null, agent: "Kirstie", outcome: "Confirm" },
    ],
  },
  {
    label: "Saturday",
    date: "Sat 8 Aug",
    viewings: [
      { id: "v7", time: "11:00", applicant: "Ryan Whitfield", property: "Flat A, 41 Milton Road", locality: "Luton LU1", image: null, agent: "Michael", outcome: "Booked" },
    ],
  },
];

const RECENT: Viewing[] = [
  { id: "r1", time: "Yesterday", applicant: "Olivia Clark", property: "2, 10 Cardiff Grove", locality: "Luton LU1", image: null, agent: "Kirstie", outcome: "Applying" },
  { id: "r2", time: "Yesterday", applicant: "Tom Williams", property: "8 Recreation Terrace", locality: "Nottingham NG9", image: null, agent: "Kirstie", outcome: "Thinking" },
  { id: "r3", time: "2 days ago", applicant: "James Patel", property: "183 Walesby Lane", locality: "Newark NG22", image: null, agent: "Michael", outcome: "Not for them" },
];

const TONE: Record<Viewing["outcome"], "accent" | "neutral" | "good"> = {
  Booked: "neutral",
  Confirm: "accent",
  Applying: "good",
  Thinking: "neutral",
  "Not for them": "neutral",
};

function Row({ v, showDate }: { v: Viewing; showDate?: boolean }) {
  return (
    <li className="flex items-center gap-3 border-b border-line/40 py-3 last:border-0">
      <span
        className={`figures w-16 shrink-0 text-[12.5px] ${showDate ? "text-muted" : "text-accent-dark"}`}
      >
        {v.time}
      </span>
      <PropertyPhoto src={v.image} className="h-9 w-11 shrink-0 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="hand block truncate text-[13px]">{v.applicant}</span>
        <span className="block truncate text-[10.5px] text-muted">
          {v.property} · {v.locality}
        </span>
      </span>
      <span className="hidden shrink-0 text-[11px] text-muted sm:block">{v.agent}</span>
      <Pill tone={TONE[v.outcome]}>{v.outcome}</Pill>
    </li>
  );
}

export default function Viewings() {
  const [tab, setTab] = useState<"diary" | "recent">("diary");
  const total = DAYS.reduce((n, d) => n + d.viewings.length, 0);

  return (
    <>
      <PageHeader
        title="Viewings"
        blurb="The week's diary. Book straight from a lead, then capture what the applicant actually thought — that feedback is what the landlord is waiting for."
        illustration="/illustrations/notioly/checking-the-calendar.svg"
        illustrationRight={430}
      />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <FlowTag to="REX (service TBC)" />
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
              {t === "diary" ? `Diary · ${total}` : `Feedback · ${RECENT.length}`}
            </button>
          ))}
        </div>
      </div>

      {tab === "diary" ? (
        // One full-width list with day headers, not three narrow columns —
        // at a third of the width every applicant name truncated, which is
        // the one thing a diary must never do.
        <div className="fade-up mt-4 rounded-2xl border border-line/80 p-5">
          {DAYS.map((d) => (
            <div key={d.label} className="mb-5 last:mb-0">
              <div className="flex items-baseline gap-3 border-b border-line/70 pb-2">
                <h2 className={`text-[15px] ${d.today ? "text-accent-dark" : ""}`}>
                  {d.label}
                </h2>
                <span className="text-[10.5px] text-muted">{d.date}</span>
                <span className="ml-auto text-[10.5px] text-muted">
                  {d.viewings.length} viewing{d.viewings.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul>
                {d.viewings.map((v) => (
                  <Row key={v.id} v={v} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="fade-up mt-4 rounded-2xl border border-line/80 p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[15px]">Recent feedback</h2>
            <span className="text-[11px] text-muted">
              What the applicant said, ready for the landlord
            </span>
          </div>
          <ul>
            {RECENT.map((v) => (
              <Row key={v.id} v={v} showDate />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Ghost
          label="Week calendar"
          detail="Drag to rebook, colour by negotiator, and see the gaps worth filling."
        />
        <Ghost
          label="Landlord feedback report"
          detail="Every viewing and its outcome, per property — the thing landlords chase for."
          tag={<FlowTag to="REX" />}
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        <span className="font-semibold">Which REX service holds appointments is still
        unconfirmed</span> — flagged rather than assumed, and worth settling before this
        page is wired, since every booking here has to land somewhere real.
      </p>
    </>
  );
}
