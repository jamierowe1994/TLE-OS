"use client";

import { useCallback, useEffect, useState } from "react";
import { minutesOf } from "@/lib/diary";
import { sumRange } from "@/lib/front-dash";
import Agenda, { useMyDay } from "./Agenda";
import FrontFigures, { useRange } from "./FrontFigures";
import LaunchSet from "./LaunchSet";
import NeedsYou from "./NeedsYou";
import QuickPills, { type SteveAsk } from "./QuickPills";
import { useFront } from "./useFront";
import { AskPill, DashThread, useDashChat } from "./DashChat";

/**
 * The Dashboard in the new look (lib/new-look "dashboard", 23 Oct 2026), after
 * the design's front office (24 Oct 2026): the date, the greeting with Steve, a
 * box to ask him anything, his quick questions and the agent's quick links,
 * then the range switch, five figures, leads per day and the pipeline
 * (FrontFigures), Today and Needs You side by side, and Get Set for Launch at
 * the foot. The design's back office is its own page (PM Dashboard, /overview).
 *
 * What is live and what is left out:
 *  - Steve's line under the greeting is said from their own day (the diary
 *    count and the next time, and how many things wait on them), never the
 *    design's sample sentence.
 *  - The ask box is one line (25 Oct 2026). Asking turns the page into the
 *    conversation (./DashChat): the figures drop away, the question shows as
 *    text, his dots, then his answer from the real Steve, with the box risen
 *    to the foot. "Back to your day" brings the figures back.
 *  - The design's sample questions are Steve's chips only where the day has
 *    something for them: calling first while leads wait, a chase while terms
 *    are out, and the prep for the next appraisal in their own diary today, at
 *    its real time. Then the agent's own quick links.
 *  - Today and Needs You read exactly what the old tiles read.
 *
 * WHAT IT DOWNLOADS (25 Oct 2026, "the loading speed on that is pretty slow"):
 * the three figure reads (./useFront: about 16 KB together, before compression), the diary, the bell's
 * twelve and the launch checklist. Nothing here reads a whole board: the
 * appraisals are counted on the server now rather than from /api/appraisals,
 * and the lead, listing and application boards (~2 MB together) were only
 * ever pulled by the old dashboard flashing up first from a stale "off" kept
 * in this browser - the page now waits for the switch's answer before drawing
 * the old board (lib/use-new-look, waitForOff).
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
  const chat = useDashChat();
  /* home -> leaving (the figures dropping away) -> chat; and back again. */
  const [phase, setPhase] = useState<"home" | "leaving" | "chat">("home");
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => setPhase("chat"), 420);
    return () => window.clearTimeout(t);
  }, [phase]);

  const front = useFront();
  const [range, setRange] = useRange();

  const send = (raw: string) => {
    if (!raw.trim()) return;
    if (phase === "home") {
      setPhase("leaving");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    void chat.send(raw);
  };
  const back = () => {
    chat.reset();
    setPhase("home");
    window.scrollTo({ top: 0 });
  };

  /* Steve's chips, where the day gives them something to answer. */
  const asks: SteveAsk[] = [];
  const fresh = front.leads.data ? sumRange(front.leads.data.fresh, 7) : null;
  if (fresh == null || fresh > 0) asks.push({ label: "Who should I call first?", ask: "Who should I call first?" });
  if (front.terms.data && front.terms.data.rows.length > 0) {
    asks.push({ label: "Draft a chase for unsigned terms", ask: "Draft a chase for my unsigned terms of business" });
  }
  const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const nextAppraisal = day.loading ? null : day.today.find((a) => a.kind === "appraisal" && !a.allDay && minutesOf(a.start) >= minutesOf(london));
  if (nextAppraisal) {
    asks.push({
      label: `Prep me for the ${nextAppraisal.start} appraisal`,
      ask: `Prep me for my ${nextAppraisal.start} appraisal today${nextAppraisal.where ? ` at ${nextAppraisal.where}` : ""}`,
    });
  }

  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const says = steveSays(day, needs);

  const away = phase !== "home";
  return (
    <div data-look="new" className={`nl-page nl-dash${away ? " is-asking" : ""}${phase === "chat" ? " is-chat" : ""}`}>
      {phase !== "chat" && (
        <section className="nl-dash-hello">
          <div className="nl-dash-date">{date}</div>
          <h1 className="nl-dash-title">{title}</h1>
          <p className="nl-dash-says" aria-live="polite">
            <b>Steve</b> {says ?? "Having a look at your day…"}
          </p>
          <div className="nl-dash-askwrap">
            <AskPill onSend={send} busy={chat.busy} />
          </div>
          <QuickPills asks={asks} onAsk={send} />
        </section>
      )}

      {phase === "chat" && <DashThread talk={chat.talk} busy={chat.busy} screens={chat.screens} onSend={send} onBack={back} />}

      {/* Kept mounted while Steve has the page, so the way back is instant. */}
      <div className="nl-dash-rest" hidden={phase === "chat"}>
        <FrontFigures range={range} setRange={setRange} front={front} />

        {/* Today across the page on white, the way the Diary draws a day (25 Oct 2026); Needs You under it. */}
        <Agenda />
        <div className="nl-dash-needs">
          <NeedsYou onCount={onNeeds} />
        </div>

        <LaunchSet />
      </div>
    </div>
  );
}
