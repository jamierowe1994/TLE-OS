"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SteveFace from "@/components/SteveFace";
import { Ico } from "@/components/new-look/Parts";
import { minutesOf } from "@/lib/diary";
import Agenda, { useMyDay } from "./Agenda";
import Glance from "./Glance";
import LaunchSet from "./LaunchSet";
import NeedsYou from "./NeedsYou";
import QuickPills from "./QuickPills";

/**
 * The Dashboard in the new look (lib/new-look "dashboard", 23 Oct 2026), after
 * the design's Dashboard: the date, the greeting with Steve, a box to ask him
 * anything, the agent's quick links, four figures on a hairline, Today and
 * Needs You side by side, and Get Set for Launch at the foot.
 *
 * What is live and what is left out:
 *  - Steve's line under the greeting is said from their own day (the diary
 *    count and the next time, and how many things wait on them), never the
 *    design's sample sentence.
 *  - The ask box sends the question to the real Steve (HelpDock, event
 *    "os-steve-ask"), who answers in his own panel. The design's canned
 *    answers are not here; nor is its attach button (attach in his panel).
 *  - The design's four sample questions are the agent's own quick links.
 *  - The figures, Today and Needs You read exactly what the old tiles read.
 */

function steveSays(
  day: { today: { start: string; allDay?: boolean }[]; loading: boolean; error: string | null },
  needs: { n: number; more: boolean } | null
): string | null {
  if (day.loading) return null;
  const parts: string[] = [];
  if (!(day.error && day.today.length === 0)) {
    const n = day.today.length;
    if (n === 0) parts.push("Nothing in your diary today");
    else {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const next = day.today.find((a) => !a.allDay && minutesOf(a.start) >= nowMin);
      parts.push(`${n} ${n === 1 ? "thing" : "things"} in your diary today${next ? `, next at ${next.start}` : ", all behind you now"}`);
    }
  }
  if (needs) parts.push(needs.n === 0 ? "nothing waiting on you" : `${needs.n}${needs.more ? " or more" : ""} waiting on you`);
  if (!parts.length) return null;
  const line = parts.join(parts.length === 2 && parts[0].includes(",") ? ", and " : " and ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

export default function DashboardNew({ title }: { title: string }) {
  const day = useMyDay();
  const [needs, setNeeds] = useState<{ n: number; more: boolean } | null>(null);
  const onNeeds = useCallback((n: number | null, more: boolean) => setNeeds(n == null ? null : { n, more }), []);
  const [q, setQ] = useState("");
  const [sent, setSent] = useState(false);
  const sentTimer = useRef<number | null>(null);
  useEffect(() => () => { if (sentTimer.current) window.clearTimeout(sentTimer.current); }, []);

  const ask = () => {
    const text = q.trim();
    if (!text) return;
    window.dispatchEvent(new CustomEvent("os-steve-ask", { detail: text }));
    setQ("");
    setSent(true);
    if (sentTimer.current) window.clearTimeout(sentTimer.current);
    sentTimer.current = window.setTimeout(() => setSent(false), 2400);
  };

  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const says = steveSays(day, needs);

  return (
    <div data-look="new" className="nl-page nl-dash">
      <section className="nl-dash-hello">
        <div className="nl-dash-date">{date}</div>
        <h1 className="nl-dash-title">
          <SteveFace size={52} track mood={sent ? "thinking" : undefined} className="nl-dash-face" />
          <span>{title}</span>
        </h1>
        <p className="nl-dash-says" aria-live="polite">
          <b>Steve</b> {says ?? "Having a look at your day…"}
        </p>

        <form
          className="nl-dash-ask"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <textarea
            rows={2}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter is a new line - as in Steve's own box. */
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="How can Steve help today?"
            aria-label="Ask Steve"
          />
          <div className="nl-dash-ask-bar">
            <span className="nl-dash-ask-who">{sent ? "Over to Steve - his answer opens beside you" : "Steve · knows your book"}</span>
            <button type="submit" className={`nl-dash-ask-send${q.trim() ? "" : " is-idle"}`} aria-label="Send to Steve" disabled={!q.trim()}>
              <Ico name="arrow" size={16} />
            </button>
          </div>
        </form>

        <QuickPills />
      </section>

      <Glance />

      <div className="nl-dash-cols">
        <Agenda />
        <NeedsYou onCount={onNeeds} />
      </div>

      <LaunchSet />
    </div>
  );
}
