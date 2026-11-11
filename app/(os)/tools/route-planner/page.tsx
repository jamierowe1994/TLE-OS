"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, Guide, ToolShell } from "@/components/new-look/tools/ToolBits";
import { refreshDiary, useMyDiary } from "@/lib/diary-store";
import type { Appt, ApptKind } from "@/lib/diary";
import { usePref } from "@/lib/prefs-store";

/**
 * TOOLS > ROUTE PLANNER (James, 10 Nov 2026: "Build top three"). Your own
 * visits for a day, the real drive between each and whether the gap covers it,
 * and one other order if it is honestly less driving. Reads the diary and the
 * routing service; writes nothing. No estimates: a journey that cannot be
 * worked out says why.
 */

type Problem = { code: string; says: string };
type Leg = { from: string; to: string; ok: true; minutes: number; miles: number } | { from: string; to: string; ok: false; problem: Problem };
type Total = { minutes: number; miles: number };
type Plan = {
  ok: true;
  start: { ok: boolean; label: string | null; precise: boolean; problem?: Problem } | null;
  stops: { id: string; ok: boolean; tidied: string | null; precise: boolean; matched: string | null; problem: Problem | null }[];
  booked: { legs: Leg[]; total: Total | null };
  best: { order: string[]; legs: Leg[]; total: Total; saves: number } | null;
  compared: boolean;
};
type BaseProfile = { base?: string; baseLat?: number | null; baseLng?: number | null };

const VISITS: ApptKind[] = ["viewing", "appraisal", "takeon", "movein", "inspection", "slot"];
const KIND: Record<string, string> = { viewing: "Viewing", appraisal: "Appraisal", takeon: "Take-on visit", movein: "Move in", inspection: "Inspection", slot: "Viewing slot" };
const MAX = 10;
const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
const span = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`);
/** The routing service's own wording names its supplier and its settings. Agents get plain words. */
const PLACE = new Set(["too_short", "not_found", "partial", "vague"]);
function plain(p: Problem | null | undefined): string {
  if (!p) return "The journey could not be worked out.";
  if (p.code === "no_address") return "This appointment has no address on it.";
  if (PLACE.has(p.code)) return "This address could not be found on the map.";
  if (p.code === "no_route") return "No driving route was found between these two.";
  if (p.code === "no_coords") return "One of these places could not be put on the map.";
  return "Drive times are not available right now. Tell the office if it carries on.";
}
/** The drive plus parking, rounded up to five: the same allowance the booker uses. */
const allow = (m: number) => Math.ceil((m + 5) / 5) * 5;

export default function RoutePlanner() {
  const diary = useMyDiary();
  const [profile, , prefsReady] = usePref<BaseProfile | null>("tle-profile-v1", null);
  const [today, setToday] = useState<Date | null>(null);
  const [day, setDay] = useState(0);
  const [from, setFrom] = useState("");
  const [touched, setTouched] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => { const d = new Date(); d.setHours(0, 0, 0, 0); setToday(d); }, []);
  useEffect(() => { if (prefsReady && !touched && profile?.base) setFrom(profile.base); }, [prefsReady, profile, touched]);
  useEffect(() => { setPlan(null); setFailed(null); }, [day, from]);

  const ready = !diary.loading && diary.live && !diary.error;
  const all = useMemo(() => (ready ? diary.appts.filter((a) => a.day === day && VISITS.includes(a.kind)).sort((a, b) => mins(a.start) - mins(b.start)) : []), [ready, diary.appts, day]);
  const visits = all.slice(0, MAX);
  const byId = useMemo(() => new Map(visits.map((a) => [a.id, a])), [visits]);
  const days = today ? Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const n = ready ? diary.appts.filter((a) => a.day === i && VISITS.includes(a.kind)).length : null;
    return { i, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }), n };
  }) : [];

  async function work() {
    if (!today || !visits.length) return;
    setBusy(true); setFailed(null); setPlan(null);
    const at = (a: Appt) => { const d = new Date(today); d.setDate(d.getDate() + day); d.setHours(0, mins(a.start), 0, 0); return d.toISOString(); };
    const usesBase = profile?.base && from.trim() === profile.base.trim() && profile.baseLat != null && profile.baseLng != null;
    const start = !from.trim() ? undefined : usesBase ? { address: from.trim(), lat: profile!.baseLat, lng: profile!.baseLng } : { address: from.trim() };
    try {
      const r = await fetch("/api/tools/route-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, stops: visits.map((a) => ({ id: a.id, where: a.where, at: at(a) })) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) setFailed(j?.error ?? "The route could not be worked out.");
      else setPlan(j as Plan);
    } catch { setFailed("The route could not be worked out. Check the connection and try again."); }
    setBusy(false);
  }

  /* When every journey failed for the same reason, say it once, not on every row. */
  const legs = plan?.booked.legs ?? [];
  const sameFault = legs.length > 0 && legs.every((l) => !l.ok && l.problem.code === (legs[0] as Extract<Leg, { ok: false }>).problem.code) ? (legs[0] as Extract<Leg, { ok: false }>).problem : null;
  const stopFault = plan && plan.stops.length > 0 && plan.stops.every((s) => !s.ok && s.problem?.code !== "no_address") ? plan.stops[0].problem : null;
  const fault = failed ?? (sameFault ? plain(sameFault) : stopFault ? plain(stopFault) : null);
  const legTo = (id: string) => legs.find((l) => l.to === id) ?? null;
  const info = (id: string) => plan?.stops.find((s) => s.id === id) ?? null;

  return (
    <ToolShell eyebrow="Day to day" title="Route Planner" blurb="Your visits for the day, the real drive between each one, and whether the gaps leave enough time.">
      <div className="nl-at-days" role="radiogroup" aria-label="Which day">
        {days.map((d) => (
          <button key={d.i} type="button" role="radio" aria-checked={day === d.i} className={day === d.i ? "is-on" : ""} onClick={() => setDay(d.i)}>
            <b>{d.label}</b>
            <span>{d.n === null ? (diary.loading ? "…" : "Not loaded") : d.n === 0 ? "No visits" : `${d.n} visit${d.n === 1 ? "" : "s"}`}</span>
          </button>
        ))}
      </div>

      {diary.loading || !today ? (
        <div className="nl-fc-card nl-fc-wait"><span className="nl-fc-spin" aria-hidden /> Reading your diary…</div>
      ) : !ready ? (
        <div className="nl-fc-card nl-fc-off" role="alert">
          <p className="nl-fc-off-line">Your diary did not load, so there is nothing to plan. Nothing is shown rather than an old copy.</p>
          <button type="button" className="nl-btn nl-btn--secondary" onClick={() => void refreshDiary()}>Try again</button>
        </div>
      ) : (
        <div className="nl-at-split nl-at-route">
          <section className="nl-fc-card nl-at-form" aria-label="The day">
            <Field label="Setting Off From" hint="Your base from your profile. Change it for today, or clear it to start at the first visit.">
              <input value={from} placeholder="An address or postcode" onChange={(e) => { setTouched(true); setFrom(e.target.value); }} />
            </Field>
            {visits.length === 0 ? (
              <p className="nl-at-none">No visits in your diary for this day.</p>
            ) : (
              <ol className="nl-at-stops">
                {plan?.start && from.trim() && (
                  <li className="is-base">
                    <span className="nl-at-when">Start</span>
                    <span><b>{plan.start.label ?? from}</b>{plan.start.problem && <small className="is-bad">{plain(plan.start.problem)}</small>}</span>
                  </li>
                )}
                {visits.map((a, k) => {
                  const leg = plan ? legTo(a.id) : null;
                  const s = info(a.id);
                  /* The gap is measured from the visit the drive starts at, which is
                     not always the row above: a visit with no usable address is skipped. */
                  const prev = leg && leg.from !== "start" ? byId.get(leg.from) ?? null : null;
                  const gap = prev ? mins(a.start) - (mins(prev.start) + prev.mins) : null;
                  const same = !!leg?.ok && leg.minutes <= 1;
                  const tone = !leg?.ok ? "" : same ? "is-fine" : gap === null ? "" : gap < leg.minutes ? "is-short" : gap < allow(leg.minutes) ? "is-tight" : "is-fine";
                  return (
                    <li key={a.id}>
                      {leg && (
                        <p className={`nl-at-leg ${leg.ok ? tone : "is-bad"}`}>
                          {!leg.ok ? (sameFault ? "No drive time" : plain(leg.problem)) : same ? <b>Same place as the visit before</b> : (
                            <>
                              <b>{span(leg.minutes)}</b> drive, {leg.miles} miles
                              {gap === null ? <em>Leave by {clock(mins(a.start) - allow(leg.minutes))}</em>
                                : gap < 0 ? <em>Overlaps the visit before</em>
                                : gap < leg.minutes ? <em>{span(leg.minutes - gap)} short: the gap is {span(gap)}</em>
                                : gap < allow(leg.minutes) ? <em>Tight: {span(gap)} between visits</em>
                                : <em>{span(gap)} between visits</em>}
                            </>
                          )}
                        </p>
                      )}
                      <span className="nl-at-when">{a.start}</span>
                      <span>
                        <b>{a.what || KIND[a.kind]}</b>
                        <small>{KIND[a.kind]}, {span(a.mins)}{a.who ? `, ${a.who}` : ""}</small>
                        <small>{s?.tidied ?? a.where ?? ""}</small>
                        {s && !s.ok && s.problem && !stopFault && <small className="is-bad">{plain(s.problem)}</small>}
                        {s?.ok && !s.precise && <small className="is-warn">Area only{s.matched ? ` (${s.matched})` : ""}: the drive is to the middle of it, not the door.</small>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {all.length > MAX && <p className="nl-fc-note">Only the first {MAX} visits of the day are planned.</p>}
            {visits.length > 0 && (
              <button type="button" className="nl-btn nl-btn--primary nl-at-go" disabled={busy || (visits.length < 2 && !from.trim())} onClick={() => void work()}>
                {busy ? "Working It Out…" : plan ? "Work It Out Again" : "Work Out the Drive"}
              </button>
            )}
          </section>

          <section className="nl-at-result" aria-live="polite">
            {busy ? (
              <div className="nl-fc-card nl-fc-wait"><span className="nl-fc-spin" aria-hidden /> Asking for the drive times…</div>
            ) : fault ? (
              <div className="nl-fc-card nl-fc-off" role="alert">
                <p className="nl-fc-off-line">{fault}</p>
                <button type="button" className="nl-btn nl-btn--secondary" onClick={() => void work()}>Try again</button>
              </div>
            ) : !plan ? (
              <div className="nl-fc-card nl-at-empty">{visits.length < 2 && !from.trim() ? "Add where you are setting off from, or pick a day with two or more visits." : "Press Work Out the Drive for the real journey times."}</div>
            ) : (
              <>
                {plan.booked.total ? (
                  <div className="nl-at-hero">
                    <p className="nl-fc-k">Driving on the Day</p>
                    <p className="nl-at-date">{span(plan.booked.total.minutes)}</p>
                    <p className="nl-at-away">{plan.booked.total.miles} miles across {legs.length} journey{legs.length === 1 ? "" : "s"}, with traffic at those times</p>
                  </div>
                ) : (
                  <div className="nl-fc-card nl-at-ask"><p>Some journeys could not be worked out, so there is no total. The rows on the left say which and why.</p></div>
                )}
                {plan.best ? (
                  <div className="nl-fc-card nl-at-better">
                    <p className="nl-fc-k">A Shorter Order</p>
                    <p className="nl-at-save">Saves {span(plan.best.saves)} of driving</p>
                    <ol>
                      {plan.best.order.map((id, k) => (
                        <li key={id}><span className="nl-at-when">{visits.filter((v) => info(v.id)?.ok)[k]?.start}</span><span>{byId.get(id)?.what || KIND[byId.get(id)?.kind ?? "viewing"]}<small>{info(id)?.tidied}</small></span></li>
                      ))}
                    </ol>
                    <p className="nl-fc-note">The same time slots with the visits swapped: {span(plan.best.total.minutes)}, {plan.best.total.miles} miles. Nothing has been moved. Every swap means rebooking with the people involved.</p>
                  </div>
                ) : plan.compared ? (
                  <p className="nl-at-fine">The order as booked is the shortest drive, or within 5 minutes of it.</p>
                ) : null}
              </>
            )}
            <Guide>Drive times come from live routing for the time of each visit. Nothing in your diary is changed by this page.</Guide>
          </section>
        </div>
      )}
    </ToolShell>
  );
}
