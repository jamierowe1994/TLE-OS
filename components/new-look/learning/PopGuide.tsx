"use client";

import Link from "next/link";
import type { SysFile } from "@/lib/learning/systems-types";

/**
 * The pop-out guide on an open file (Tools > Learning > Systems, 26 Oct 2026):
 * a floating card docked over the right of the file, in the floating-stage
 * look (soft rise-in, rounded, a little see-through). It steps through the
 * file's guide one beat at a time; the last beat carries what you press and
 * the button to the real screen. It shrinks to a pill and opens again. On a
 * phone it is a bottom sheet (app/new-look/systems.css).
 *
 * Controlled by the Explorer, which also steps it with the arrow keys.
 */

type Props = {
  file: SysFile;
  step: number;
  dir: "next" | "back";
  onStep: (to: number) => void;
  small: boolean;
  onSmall: (small: boolean) => void;
};

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export default function PopGuide({ file, step, dir, onStep, small, onSmall }: Props) {
  const steps = file.guide;
  const total = steps.length;
  /* No steps written: the card is just the "what you do" and the button. */
  const last = total === 0 || step >= total - 1;
  const beat = steps[Math.min(step, Math.max(0, total - 1))];

  if (small) {
    return (
      <button type="button" className="nl-sx-pill" onClick={() => onSmall(false)} aria-label="Open the guide">
        <span className="nl-sx-pill-dot" aria-hidden />
        <span className="nl-sx-pill-text">
          The Guide{total > 0 && <em>Step {step + 1} of {total}</em>}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="nl-sx-guide" aria-label={`Guide: ${file.name}`}>
      <div className="nl-sx-guide-head">
        <span className="nl-sx-guide-kicker">The Guide</span>
        {total > 1 && (
          <span className="nl-sx-dots" role="group" aria-label="Steps">
            {steps.map((s, i) => (
              <button
                key={s.title + i}
                type="button"
                className={`nl-sx-dot${i === step ? " is-on" : i < step ? " is-done" : ""}`}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => onStep(i)}
              />
            ))}
          </span>
        )}
        <button type="button" className="nl-sx-guide-min" onClick={() => onSmall(true)} aria-label="Shrink the guide" title="Shrink the guide">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
            <path d="M6 12h12" />
          </svg>
        </button>
      </div>

      <div className="nl-sx-guide-body" aria-live="polite">
        <div key={`${file.id}:${step}`} className={`nl-sx-beat is-${dir}`}>
          {beat ? (
            <>
              {total > 1 && (
                <p className="nl-sx-beat-n">
                  Step {step + 1} of {total}
                </p>
              )}
              <h3 className="nl-sx-beat-title">{beat.title}</h3>
              <p className="nl-sx-beat-says">{beat.says}</p>
            </>
          ) : (
            <>
              <h3 className="nl-sx-beat-title">{file.name}</h3>
              <p className="nl-sx-beat-says">{file.blurb}</p>
            </>
          )}

          {last && (file.you || file.opens) && (
            <div className="nl-sx-you">
              {file.you && (
                <>
                  <p className="nl-sx-you-h">What You Do</p>
                  <p className="nl-sx-you-says">{file.you.says}</p>
                  {file.you.href && !file.opens && (
                    <Link href={file.you.href} className="nl-sx-go">
                      Open it in the OS <Chevron />
                    </Link>
                  )}
                </>
              )}
              {file.opens && (
                <Link href={file.opens.href} className="nl-sx-go" title={file.opens.label}>
                  Open it in the OS <Chevron />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {total > 1 && (
        <div className="nl-sx-guide-foot">
          <button type="button" className="nl-sx-step is-back" disabled={step === 0} onClick={() => onStep(step - 1)}>
            <Chevron back /> Back
          </button>
          {!last ? (
            <button type="button" className="nl-sx-step is-next" onClick={() => onStep(step + 1)}>
              Next <Chevron />
            </button>
          ) : (
            <button type="button" className="nl-sx-step is-again" onClick={() => onStep(0)}>
              From the Start
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
