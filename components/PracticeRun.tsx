"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PlcWizard from "@/components/PlcWizard";
import { ComplianceSide, Note } from "@/components/PlcReview";
import { captureScreen } from "@/lib/screenshot";
import { DEMO_PREFILL } from "@/lib/plc-demo";
import { usePlcSandbox } from "@/lib/plc-sandbox";
import type { RigScript, RigStep } from "@/lib/rig-scripts";

/**
 * A practice run: the script down one side, the real screens under it.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * Somebody sits down, presses the buttons, and says after each step whether
 * what happened is what the step said would happen. Two outcomes and both are
 * useful: they learn the process, and we learn where it lies.
 *
 * ── Saying no is the point ────────────────────────────────────────────────
 *
 * "That is not what I saw" is the most valuable button on this page, so it is
 * the same size as the other one and sits next to it rather than hiding
 * behind a link. It sends what they typed, the step they were on and a
 * picture of the screen straight down the feedback pipe, which means the
 * report arrives with the evidence already attached instead of starting a
 * conversation that begins "can you send me a screenshot".
 *
 * ── Nothing here is real ──────────────────────────────────────────────────
 *
 * The screens are the product's own, driven by lib/plc-sandbox: no case is
 * created, no document uploaded, no decision recorded, no email sent. Say so
 * on the page, in those words, because a person who is not certain of that
 * will not press Approve, and pressing Approve is the exercise.
 */

const GREEN = "bg-[#f1f4ec] text-[#56634a]";
const RED = "bg-[#fdefec] text-[#9d4340]";

type Mark = { result: "ok" | "not-ok"; note?: string; at: string };
type Marks = Record<string, Mark>;

const storeKey = (id: string) => `tle-os:practice:${id}`;

export default function PracticeRun({
  script,
  /** Where "Back" goes. Each side of the house has its own home. */
  backHref,
  backLabel,
}: {
  script: RigScript;
  backHref: string;
  backLabel: string;
}) {
  const sandbox = usePlcSandbox();
  const { setSide } = sandbox;
  const [at, setAt] = useState(0);
  const [marks, setMarks] = useState<Marks>({});
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Drawn after mount. Progress comes out of the browser, which the server
     cannot know, and a page that renders one thing then immediately another
     is a page that flickers on every arrival. */
  const [ready, setReady] = useState(false);

  const step: RigStep | undefined = script.steps[at];
  const done = at >= script.steps.length;

  /* ── the marks, kept in this browser ── */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storeKey(script.id));
      if (raw) setMarks(JSON.parse(raw) as Marks);
    } catch {
      /* A browser with storage switched off still gets to practise; it just
         does not remember. Never let this be the thing that breaks the page. */
    }
    setReady(true);
  }, [script.id]);

  const remember = useCallback(
    (next: Marks) => {
      setMarks(next);
      try {
        window.localStorage.setItem(storeKey(script.id), JSON.stringify(next));
      } catch {
        /* as above */
      }
    },
    [script.id]
  );

  /* ── the screens follow the script ──
     A step that happens on the other side of the handover switches to it, so
     nobody is ever asked to press a button on a panel they cannot see. */
  useEffect(() => {
    if (step) setSide(step.side);
  }, [step, setSide]);

  const jump = (i: number) => {
    setAt(i);
    setFlagging(false);
    setNote("");
    setSaid(null);
  };

  const tick = () => {
    if (!step) return;
    remember({ ...marks, [step.id]: { result: "ok", at: new Date().toISOString() } });
    jump(at + 1);
  };

  /** Send the flag, with the step and a picture of the screen on it. */
  const flag = async () => {
    if (!step || !note.trim()) return;
    setSending(true);
    /* Awaited, not fired alongside: the point is the screen as it is NOW.
       Returns null on any failure and the report goes anyway - somebody
       telling us about a bug must not hit a second one doing it. */
    const shot = await captureScreen();
    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: `Practice run "${script.title}", step ${at + 1} of ${script.steps.length} (${step.title}).\n\nShould have seen: ${step.see}\n\nWhat happened instead: ${note.trim()}`,
          path: window.location.pathname,
          kind: "bug",
          shot,
          context: {
            practice: script.id,
            step: step.id,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          },
        }),
      });
      if (!res.ok) throw new Error();
      remember({ ...marks, [step.id]: { result: "not-ok", note: note.trim(), at: new Date().toISOString() } });
      setSaid("Sent to James, with a picture of this screen.");
      setNote("");
      setFlagging(false);
      setTimeout(() => jump(at + 1), 1200);
    } catch {
      setSaid("That did not send. Tell James directly, and carry on.");
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    remember({});
    sandbox.restart();
    jump(0);
  };

  const flagged = useMemo(
    () => script.steps.filter((s) => marks[s.id]?.result === "not-ok"),
    [script.steps, marks]
  );

  if (!ready) return null;

  return (
    <div className="space-y-5 pb-10">
      {/* ── the script ──
          Sticky, because the instruction has to stay readable while the thing
          it is about is being pressed. Held above the screens rather than
          beside them: the wizard brings its own column width and squeezing it
          into half a page is how a rehearsal teaches a layout nobody has. */}
      <div className="sticky top-2 z-30" data-hide-from-shot>
        <div className="rounded-[22px] border border-line/70 bg-card/95 p-4 shadow-[0_16px_40px_-28px_rgba(40,25,20,0.5)] backdrop-blur sm:p-5">
          {/* The title takes the whole first line on a phone and the counter
              and the way out drop under it: at 375px they were being laid
              beside a two-line title and landing on top of it. `w-full` on
              the pair is what forces the break, and it goes away at sm. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name={script.icon} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Practice run</p>
              <p className="text-[15px] font-bold leading-tight">{script.title}</p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="rounded-full bg-page px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                {done ? `${script.steps.length} of ${script.steps.length}` : `Step ${at + 1} of ${script.steps.length}`}
              </span>
              <Link href={backHref} className="ml-auto rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] transition hover:border-ink/40 sm:ml-0">
                {backLabel}
              </Link>
            </div>
          </div>

          {/* One dot per step: where you are, and what you have said so far. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {script.steps.map((s, i) => {
              const m = marks[s.id];
              const tone =
                i === at && !done
                  ? "bg-accent-dark"
                  : m?.result === "ok"
                    ? "bg-[#8aa07a]"
                    : m?.result === "not-ok"
                      ? "bg-[#c98b84]"
                      : "bg-line";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(i)}
                  title={`${i + 1}. ${s.title}`}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  className={`h-2 flex-1 min-w-[10px] rounded-full transition ${tone}`}
                />
              );
            })}
          </div>

          {done ? (
            <Finished script={script} flagged={flagged} onAgain={startOver} backHref={backHref} backLabel={backLabel} />
          ) : step ? (
            <div className="mt-4">
              <h2 className="text-[19px] font-bold leading-tight">{step.title}</h2>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-page p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Do this</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed">{step.act}</p>
                </div>
                <div className="rounded-2xl bg-accent-soft p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-dark">You should see</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed">{step.see}</p>
                </div>
              </div>

              {step.why ? (
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
                  <span className="font-semibold text-ink">Why it matters. </span>
                  {step.why}
                </p>
              ) : null}

              {said ? <p className="mt-3 rounded-xl bg-page px-3.5 py-2.5 text-[12.5px]">{said}</p> : null}

              {flagging ? (
                <div className="mt-3 rounded-2xl border border-line/70 bg-page p-3.5">
                  <label className="text-[12.5px] font-semibold" htmlFor="practice-note">
                    What did you see instead?
                  </label>
                  <textarea
                    id="practice-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="It is fine to be blunt. A picture of this screen goes with it."
                    className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-[13px] outline-none transition focus:border-black/30"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={flag}
                      disabled={sending || !note.trim()}
                      className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                    >
                      {sending ? "Sending…" : "Send it to James"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlagging(false)}
                      className="rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={tick}
                    className="btn-press rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white"
                  >
                    That is what I saw
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlagging(true)}
                    className={`btn-press rounded-full px-4 py-2.5 text-[12.5px] font-semibold ${RED}`}
                  >
                    That is not what I saw
                  </button>
                  {at > 0 ? (
                    <button type="button" onClick={() => jump(at - 1)} className="text-[12px] text-muted underline transition hover:text-ink">
                      Back a step
                    </button>
                  ) : null}
                  <button type="button" onClick={startOver} className="ml-auto text-[12px] text-muted underline transition hover:text-ink">
                    Start the whole thing again
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── the promise ──
          Said plainly and near the top, because somebody who is not sure this
          is safe will not press Approve, and pressing Approve is the point. */}
      <p className="rounded-xl border border-line/80 bg-box px-3.5 py-2.5 text-[12.5px] leading-relaxed">
        <span className="font-semibold">Nothing here is real and nothing is saved.</span> The property, the people and
        the documents are invented. No pack is created, no email is sent and no decision is recorded. Press everything.
      </p>

      {/* ── the screens themselves ── */}
      <div>
        {sandbox.side === "agent" ? (
          /* Mounted bare: the wizard supplies its own mx-auto max-w-3xl px-4,
             and wrapping it in a second padded column double-pads it and runs
             it off the side of a phone. */
          <PlcWizard
            key={`agent-${sandbox.run}`}
            demo={{
              prefill: DEMO_PREFILL,
              onSeeCompliance: () => setSide("compliance"),
              onRestart: startOver,
              /* The loop closes here: what the agent sends is what compliance
                 read, and what compliance send back is what the agent opens. */
              existing: sandbox.agentCase,
              onSubmitted: sandbox.handIn,
              onReopen: sandbox.reopen,
            }}
          />
        ) : (
          <div className="mx-auto max-w-4xl">
            {error ? (
              <div className="mb-4">
                <Note>{error}</Note>
              </div>
            ) : null}
            {sandbox.scanning ? (
              <p className="mb-4 rounded-xl border border-line/80 bg-box p-3.5 text-[12.5px]">Reading the pack…</p>
            ) : null}
            <ComplianceSide
              data={sandbox.loaded}
              perform={sandbox.perform}
              reload={async () => {}}
              onDecided={() => {}}
              say={setError}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── the ending ─────────────────────────────── */

function Finished({
  script,
  flagged,
  onAgain,
  backHref,
  backLabel,
}: {
  script: RigScript;
  flagged: RigStep[];
  onAgain: () => void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}>✓</span>
        <p className="flex-1 text-[14px] font-semibold">
          That is the whole of it. You have walked all {script.steps.length} steps.
        </p>
      </div>

      {flagged.length ? (
        <div className="mt-3 rounded-2xl border border-line/70 bg-page p-3.5">
          <p className="text-[12.5px] font-semibold">
            {flagged.length === 1 ? "One step did not do what it said." : `${flagged.length} steps did not do what they said.`}{" "}
            Each one is already with James.
          </p>
          <ul className="mt-2 space-y-1.5">
            {flagged.map((s) => (
              <li key={s.id} className="text-[12.5px] text-muted">
                <span className="font-semibold text-ink">{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Nothing flagged. Worth running once more in a week: the screens are still being built, and a run that passed
          in September is not a promise about October.
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button type="button" onClick={onAgain} className="btn-press rounded-full bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white">
          Walk it again
        </button>
        <Link href={backHref} className="btn-press rounded-full border border-line/80 bg-card px-4 py-2.5 text-[12.5px] font-semibold">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
