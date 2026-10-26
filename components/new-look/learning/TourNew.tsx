"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Emails, GuideShots, Screens } from "@/components/showroom/ShowroomView";
import { STEPS_FOR, type ShowroomSide } from "@/lib/showroom/content";
import { Arrow, Back } from "./LearningHub";
import { JOURNEYS } from "./SystemsHub";

/**
 * One journey as a tour (Tools > Learning > Systems, 26 Oct 2026). The stops
 * across the top; under them the stop itself - what happens, what they see,
 * what you press - beside the real demo screen (the Showroom's own frames, the
 * invented 8 Recreation Terrace story), then the emails that go at that stop.
 * Next and Previous float at the foot, and the arrow keys work. The stop is
 * in the address (?stop=), so a link lands on it.
 */

export default function TourNew({ side, token, start }: { side: ShowroomSide; token: string; start: string | null }) {
  const steps = STEPS_FOR[side];
  const journey = JOURNEYS.find((j) => j.side === side)!;
  const [at, setAt] = useState(() => Math.max(0, steps.findIndex((s) => s.id === start)));
  const [dir, setDir] = useState<"next" | "back">("next");
  const rail = useRef<HTMLOListElement>(null);
  const step = steps[at];
  /* Nothing on a screen and no email: the words take the whole width. */
  const solo = !step.screens.length && !step.guide && !step.emails.length;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= steps.length || to === at) return;
      setDir(to > at ? "next" : "back");
      setAt(to);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [at, steps.length]
  );

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("stop", steps[at].id);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* fine */ }
    rail.current?.querySelector<HTMLElement>(`[data-stop="${at}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [at, steps]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowRight") go(at + 1);
      if (e.key === "ArrowLeft") go(at - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, go]);

  return (
    <div data-look="new" className={`nl-page nl-lr nl-lr-tour is-${journey.tone}`}>
      <Back href="/tools/learning/systems" label="Systems" />
      <div className="nl-lr-tour-head">
        <p className="nl-eyebrow">{journey.name}</p>
        <ol ref={rail} className="nl-lr-stops" aria-label="Stops on this tour">
          {steps.map((s, i) => (
            <li key={s.id} data-stop={i}>
              <button type="button" className={`nl-lr-stop${i === at ? " is-on" : i < at ? " is-done" : ""}`} aria-current={i === at ? "step" : undefined} onClick={() => go(i)} title={s.title}>
                <b>{i + 1}</b>
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div key={step.id} className={`nl-lr-stop-body is-${dir}`}>
        <div className={`nl-lr-stop-grid${solo ? " is-solo" : ""}`}>
          <section className="nl-lr-stop-text">
            <p className="nl-lr-stop-n">
              Stop {at + 1} of {steps.length}
            </p>
            <h1 className="nl-lr-stop-title">{step.title}</h1>
            <p className="nl-lr-stop-lead">{step.lead}</p>
            {step.sees.length > 0 && (
              <>
                <h2 className="nl-lr-stop-h">What {side === "agent" ? "you see" : side === "tenant" ? "the tenant sees" : "the landlord sees"}</h2>
                <ul className="nl-lr-sees">
                  {step.sees.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="nl-lr-you">
              <h2 className="nl-lr-stop-h">What you do</h2>
              <p>{step.agent.says}</p>
              {step.agent.href && (
                <Link href={step.agent.href} className="nl-lr-open">
                  Open that screen
                </Link>
              )}
            </div>
            {step.walkthrough && (
              <Link href={`/showroom?side=backoffice&step=${step.walkthrough.step}${step.walkthrough.way ? `&way=${step.walkthrough.way}` : ""}`} className="nl-lr-walk">
                {step.walkthrough.label}
                <Arrow />
              </Link>
            )}
          </section>
          {!solo && (
            <section className="nl-lr-stop-screen">
            {step.screens.length > 0 ? (
              <Screens key={step.id} side={side} screens={step.screens} token={token} phoneOrigin={null} />
            ) : step.guide ? (
              <GuideShots guideId={step.guide} href={step.agent.href} />
            ) : step.emails.length > 0 ? (
              /* Nothing on a screen here: it happens by email, so the emails take the screen's place. */
              <Emails ids={step.emails} showTo={side === "agent"} />
            ) : null}
            </section>
          )}
        </div>
        {step.emails.length > 0 && (step.screens.length > 0 || step.guide) && (
          <section className="nl-lr-mails">
            <Emails ids={step.emails} showTo={side === "agent"} />
          </section>
        )}
      </div>

      <div className="nl-lr-nav">
        <button type="button" className="nl-lr-navbtn" disabled={at === 0} onClick={() => go(at - 1)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {at > 0 ? steps[at - 1].title : "Previous"}
        </button>
        {at < steps.length - 1 ? (
          <button type="button" className="nl-lr-navbtn is-go" onClick={() => go(at + 1)}>
            Next: {steps[at + 1].title}
            <Arrow />
          </button>
        ) : (
          <Link href="/tools/learning/systems" className="nl-lr-navbtn is-go">
            That&apos;s the tour. Back to Systems
            <Arrow />
          </Link>
        )}
      </div>
    </div>
  );
}
