import Link from "next/link";
import { Arrow, CalmHead, Row, Tick } from "@/components/landlord/calm";
import Spine from "@/components/landlord/Spine";
import SpinePhone from "@/components/landlord/SpinePhone";
import { HeroAction, StepRow, pickHero } from "@/components/landlord/StepAction";
import { SHORT, TITLE } from "@/components/landlord/journey-words";
import { STAGE_COPY, fullJourney } from "@/lib/landlord-journey";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE JOURNEY PAGE, CALM (26 Nov 2026; the home is DashboardCalm). The same
 * view, words and working parts as the classic page (JourneyView); drawn when
 * the "portals" switch is on.
 *
 * Where they are now, on Dark Olive, with the real next action and why it
 * matters; beside it, what they can do now, every row a real action. Then
 * the journey as a line. Then who does what at each stop, as ONE table to
 * read across instead of seven small cards. Then what comes after the let.
 *
 * On a phone: the title, the stage in a word, the wheel - and no table, no
 * "why", no after-the-let (James, 15 Sep 2026, kept).
 */
export default function JourneyViewCalm({ view: v, homeHref }: { view: LandlordView; homeHref: string }) {
  const stops = fullJourney(v);
  const current = stops.find((s) => s.state === "current") ?? stops[stops.length - 1];
  const copy = STAGE_COPY[current.id] ?? STAGE_COPY.valuation;
  const hero = pickHero(v);
  const done = stops.filter((s) => s.state === "done").length;

  return (
    <div className="llh">
      <CalmHead v={v} title="Your letting journey" intro={<>Track where you are, what&rsquo;s next, and what we need from you.</>} />

      {/* ── where they are, and what they can do ── */}
      <div className="llp-split">
        <section className="llh-next" data-search>
          <p className="llh-label">Current stage</p>
          <h2>
            <span className="llh-phone-in">{SHORT[current.id] ?? current.label}</span>
            <span className="llh-desk-in">{TITLE[current.id] ?? current.label}</span>
          </h2>
          <p className="llh-next-sub">{copy.long}</p>
          {hero && (
            <div className="llh-next-go">
              <HeroAction s={hero} v={v} anchorBase={homeHref} />
            </div>
          )}
          <div className="llh-also llp-why">
            <p className="llh-label">Why this matters</p>
            <p>{copy.why}</p>
          </div>
        </section>

        <section className="llp-side" data-search>
          <h2>What you can do now</h2>
          {v.steps.length ? (
            <div className="llp-steps">
              {v.steps.map((s) => (
                <StepRow key={s.id} s={s} v={v} anchorBase={homeHref} />
              ))}
            </div>
          ) : (
            <p className="llh-note">Nothing needs you right now. We&rsquo;ll let you know when something does.</p>
          )}
        </section>
      </div>

      {/* ── the journey, as a line ── */}
      <Row title="Your journey at a glance" meta={`${done} of ${stops.length} done`}>
        <div className="llh-phone">
          <SpinePhone stops={stops} />
        </div>
        <div className="llh-desk">
          <Spine stops={stops} />
        </div>
      </Row>

      {/* ── who does what at each stop: one table, read across ── */}
      <Row title="Stage by stage" meta="Who does what" className="llh-desk-row">
        <div className="llp-table" role="table">
          <div className="llp-tr llp-th" role="row">
            <span role="columnheader">Stage</span>
            <span role="columnheader">Your role</span>
            <span role="columnheader">Our role</span>
            <span role="columnheader">Unlocks</span>
          </div>
          {stops.map((s) => {
            const c = STAGE_COPY[s.id];
            const isDone = s.state === "done";
            return (
              <div key={s.id} className="llp-tr" role="row" data-state={s.state}>
                <span role="cell" className="llp-stage">
                  <i aria-hidden>{isDone ? <Tick /> : null}</i>
                  <span>
                    <b>{s.label}</b>
                    {s.state === "current" && <em>Current</em>}
                    <small>{c?.what}</small>
                  </span>
                </span>
                <span role="cell">{c?.yourRole}</span>
                <span role="cell">{c?.ourRole}</span>
                <span role="cell">{isDone ? <>Completed {s.sub}</> : c?.unlocks}</span>
              </div>
            );
          })}
        </div>
      </Row>

      {/* ── after the let ── */}
      <Row title="After your property is let" className="llh-desk-row">
        <p className="llh-note">
          This portal will become your maintenance and compliance hub. You&rsquo;ll be able to report issues, view certificates and stay on top of your property, all in one place.
        </p>
        <Link href={`${homeHref}#maintenance`} className="llh-link">
          Find out more <Arrow />
        </Link>
      </Row>
    </div>
  );
}
