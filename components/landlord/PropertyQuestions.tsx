"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import UploadDoc from "@/components/landlord/UploadDoc";
import {
  PROPERTY_QUESTIONS,
  allDone,
  asked,
  firstUnfinished,
  progress,
  stepDone,
  type Answers,
  type Question,
} from "@/lib/property-questions";

/**
 * THE QUESTIONS, ONE SUBJECT AT A TIME.
 *
 * James, 15 Sep 2026: "we're going to need to make sure that we're taking as
 * much data as possible without it being overwhelming. The formatting of this
 * is going to be super important."
 *
 * So the whole of the design is the pacing:
 *
 *   - ONE SUBJECT A SCREEN, three or four questions. Twenty-four questions on
 *     one page is a tax return; three questions about keys is a conversation.
 *   - CHOICES ARE BUTTONS, not dropdowns. A select on a phone is a modal, a
 *     scroll and a squint; a row of pills is one thumb press, and it also
 *     shows every option at once - which is how a landlord discovers that
 *     "there's no gas at the property" was an option all along.
 *   - IT SAVES AS THEY GO, on every answer. Nobody should lose six screens to
 *     a phone call, and "come back later" has to be true or the progress bar
 *     is a lie.
 *   - NOTHING IS TRAPPED. Every screen can be left; optional questions say so.
 *
 * The step count is the unit they experience, so progress is counted in steps
 * rather than in fields - "3 of 7" is a promise a person can hold.
 */

const PILL =
  "rounded-full border px-4 py-2.5 text-left text-[13px] leading-snug transition-colors";
const FIELD =
  "w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ink/40";

export default function PropertyQuestions({
  appraisalId,
  firstName,
  demo = false,
  onProgress,
}: {
  /** Null on the sample: answers stay in this tab and nothing is written. */
  appraisalId: string | null;
  firstName?: string | null;
  demo?: boolean;
  onProgress?: (p: { done: number; of: number }) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [at, setAt] = useState(0);
  const [loaded, setLoaded] = useState(demo || !appraisalId);
  const [saving, setSaving] = useState(false);
  const [fresh, setFresh] = useState(true);

  /* What they said last time, and where to drop them back in. */
  useEffect(() => {
    if (demo || !appraisalId) return;
    let gone = false;
    void (async () => {
      try {
        const r = await fetch(`/api/landlord/property-answers?appraisalId=${encodeURIComponent(appraisalId)}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as { answers?: Answers };
        if (gone) return;
        const got = j.answers ?? {};
        setAnswers(got);
        setAt(firstUnfinished(got));
        setFresh(Object.keys(got).length === 0);
      } catch {
        /* Unreadable is not unusable: they can still answer, and the save
           will tell them if that fails too. */
      } finally {
        if (!gone) setLoaded(true);
      }
    })();
    return () => {
      gone = true;
    };
  }, [appraisalId, demo]);

  const pending = useRef<Answers>({});
  const timer = useRef<number | null>(null);

  /* Batched by a beat rather than fired per keystroke - a long answer should
     not be twenty round trips - but never left unsent for longer than that. */
  const flush = useCallback(async () => {
    if (demo || !appraisalId) return;
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setSaving(true);
    try {
      await fetch("/api/landlord/property-answers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appraisalId, answers: patch }),
      });
    } catch {
      /* Put them back so the next flush tries again. */
      pending.current = { ...patch, ...pending.current };
    } finally {
      setSaving(false);
    }
  }, [appraisalId, demo]);

  const set = (id: string, value: string | string[]) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    pending.current[id] = value;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  };

  useEffect(() => () => void flush(), [flush]);
  useEffect(() => {
    const p = progress(answers);
    onProgress?.({ done: p.done, of: p.of });
  }, [answers, onProgress]);

  /* What is still to answer, said out loud once they press That's everything
     with screens skipped. The button used to do nothing at all (Howard,
     1 Oct 2026: "I skipped pages, but now it won't let me complete it"). */
  const [missing, setMissing] = useState<string[] | null>(null);
  /* "Finish for now": what they gave is saved, and the rest can wait. */
  const [parked, setParked] = useState(false);

  const go = (to: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    void flush();
    setAt(Math.max(0, Math.min(PROPERTY_QUESTIONS.length - 1, to)));
    setParked(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* The last screen's button. Everything answered: the thank-you shows on its
     own. Anything skipped: straight to the first gap, with the gaps named. */
  const finish = () => {
    const gaps = PROPERTY_QUESTIONS.filter((s) => !stepDone(s, answers)).map((s) => s.title);
    if (!gaps.length) return go(at);
    setMissing(gaps);
    go(firstUnfinished(answers));
  };

  if (!loaded) return <p className="px-1 py-10 text-[13px] text-muted">Getting your answers…</p>;

  const done = allDone(answers);
  const step = PROPERTY_QUESTIONS[at];
  const p = progress(answers);
  const ready = stepDone(step, answers);
  const last = at === PROPERTY_QUESTIONS.length - 1;
  const gapsNow = PROPERTY_QUESTIONS.filter((s) => !stepDone(s, answers));

  if (parked && !done) {
    return (
      <div className="rounded-[22px] border border-line/60 bg-white p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="shield" size={22} />
        </span>
        <h2 className="mt-4 text-[24px] leading-tight">Thank you, that&rsquo;s saved.</h2>
        <p className="mx-auto mt-2.5 max-w-md text-[14px] leading-relaxed text-muted">
          {gapsNow.length === 1 ? "One screen still has" : `${gapsNow.length} screens still have`} a question or two. Come back
          to {gapsNow.length === 1 ? "it" : "them"} whenever suits - or now, if you have a minute.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {gapsNow.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(PROPERTY_QUESTIONS.indexOf(s))}
              className="rounded-full border border-line/70 bg-white px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-[22px] border border-line/60 bg-white p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="shield" size={22} />
        </span>
        <h2 className="mt-4 text-[24px] leading-tight">That&rsquo;s everything, thank you.</h2>
        <p className="mx-auto mt-2.5 max-w-md text-[14px] leading-relaxed text-muted">
          It all goes on your file. If something changes - a new boiler, a different bin day - come back and
          change it any time.
        </p>
        <button
          type="button"
          onClick={() => go(0)}
          className="mt-5 text-[12.5px] text-muted underline underline-offset-4 transition hover:text-ink"
        >
          Go back over my answers
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]">
      {/* The moment they arrive - and it stays for the whole of the first
          screen rather than vanishing the instant they touch a button. Being
          thanked and then having the thanks whipped away mid-sentence reads as
          a glitch. */}
      {fresh && at === 0 && (
        <div className="mb-6 rounded-[22px] bg-accent-soft/80 px-7 py-6">
          <h2 className="text-[26px] leading-tight">
            That&rsquo;s signed{firstName ? `, ${firstName}` : ""}. Thank you.
          </h2>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted">
            Now the bit only you can do: a few things about the property itself, so we can market it, let it and
            look after it without ringing you about the stopcock. Seven short screens, and it saves as you go.
          </p>
        </div>
      )}

      {/* Where they are. Counted in screens, because that is what they feel. */}
      {/* Each bar is a way back to its screen. They always were buttons, but
          six pixels tall nobody could find or hit them - so the press area is
          the full height of the row and the bar is drawn inside it. */}
      <div className="mb-1 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-1.5">
          {PROPERTY_QUESTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`${s.title}${stepDone(s, answers) ? ", done" : ", still to do"}`}
              aria-current={i === at ? "step" : undefined}
              title={s.title}
              className="group flex-1 cursor-pointer py-2.5"
            >
              <span
                className="block h-1.5 rounded-full transition-[background-color,transform] group-hover:scale-y-150"
                style={{
                  background:
                    stepDone(s, answers) ? "#56423e" : i === at ? "rgba(86,66,62,0.45)" : "rgba(86,66,62,0.14)",
                }}
              />
            </button>
          ))}
        </div>
        <p className="shrink-0 text-[11.5px] text-muted">
          {p.done} of {p.of} done
        </p>
      </div>
      <p className="mb-4 text-[11.5px] text-muted">
        Screen {at + 1} of {PROPERTY_QUESTIONS.length}: {step.title}. Tap a bar to jump to any screen.
      </p>

      {missing && !done && gapsNow.length > 0 && (
        <div className="mb-4 rounded-[18px] bg-accent-soft/80 px-5 py-4" role="status">
          <p className="text-[13.5px] font-semibold leading-snug">
            Nearly there. {listWords(gapsNow.map((s) => s.title))} {gapsNow.length === 1 ? "still has" : "still have"} a question or two.
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {gapsNow.some((s) => s.id === step.id) ? `We've brought you to ${step.title}. ` : ""}
            Answer what you can, or finish for now and come back to the rest.
          </p>
          <button
            type="button"
            onClick={() => {
              if (timer.current) window.clearTimeout(timer.current);
              void flush();
              setMissing(null);
              setParked(true);
              if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="mt-3 rounded-full border border-line/70 bg-white px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
          >
            Finish for now
          </button>
        </div>
      )}

      <section className="rounded-[22px] border border-line/60 bg-white p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name={step.icon} size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[21px] leading-tight">{step.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.blurb}</p>
          </div>
        </div>

        <div className="mt-7 space-y-7">
          {step.questions.filter((qn) => asked(qn, answers)).map((qn) => (
            <Field
              key={qn.id}
              q={qn}
              value={answers[qn.id]}
              onChange={(v) => set(qn.id, v)}
              appraisalId={appraisalId}
              sample={demo || !appraisalId}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-5">
          <button
            type="button"
            onClick={() => go(at - 1)}
            disabled={at === 0}
            className="text-[12.5px] text-muted underline underline-offset-4 transition hover:text-ink disabled:opacity-0"
          >
            Back
          </button>
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-muted">{saving ? "Saving…" : demo ? "" : "Saved"}</span>
            <button
              type="button"
              onClick={() => (last ? finish() : go(at + 1))}
              className="rounded-full bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {last ? "That's everything" : ready ? "Next" : "Skip for now"} <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </section>

      <p className="mt-4 text-center text-[11.5px] text-muted">
        Everything is kept as you type it. You can close this and come back whenever suits.
      </p>
    </div>
  );
}

/** "A", "A and B", "A, B and C". */
function listWords(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function Field({
  q,
  value,
  onChange,
  appraisalId,
  sample,
}: {
  q: Question;
  value: Answers[string];
  onChange: (v: string | string[]) => void;
  appraisalId: string | null;
  sample: boolean;
}) {
  const chosen = typeof value === "string" ? value : "";
  const offerUpload = Boolean(q.upload && q.upload.when.includes(chosen));
  return (
    <div>
      <label className="block text-[14px] font-semibold leading-snug">
        {q.label}
        {q.optional && <span className="ml-2 text-[11px] font-normal text-muted">optional</span>}
      </label>
      {q.help && <p className="mt-1 text-[12px] leading-relaxed text-muted">{q.help}</p>}

      <div className="mt-3">
        {q.kind === "choice" && (
          <div className="flex flex-wrap gap-2">
            {(q.options ?? []).map((o) => {
              const on = chosen === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChange(o.id)}
                  className={PILL}
                  style={
                    on
                      ? { background: "#56423e", borderColor: "#56423e", color: "#fff" }
                      : { borderColor: "rgba(86,66,62,0.22)", background: "#fff" }
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}

        {/* They have it: send it now, while it is in their hand. The same
            upload as the Documents page, filed under the same kind, so the
            ask comes off their list there too. */}
        {offerUpload && q.upload && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/60 bg-page/60 px-4 py-3">
            <p className="text-[12.5px] leading-snug text-muted">
              {q.upload.kind === "other"
                ? "Have it to hand? Upload it here and it goes straight on your file."
                : chosen === "expired"
                  ? "Upload the old one anyway - it tells us when it was last done."
                  : "Upload a copy here and it goes straight on your file."}
            </p>
            <UploadDoc kind={q.upload.kind} appraisalId={appraisalId} sample={sample} title={q.upload.title} label="Upload it" tone="light" />
          </div>
        )}

        {q.kind === "text" && (
          <input
            type="text"
            value={chosen}
            placeholder={q.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={FIELD}
          />
        )}

        {q.kind === "long" && (
          <textarea
            rows={3}
            value={chosen}
            placeholder={q.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`${FIELD} resize-y`}
          />
        )}

        {/* The usual answers, one tap each. A chip fills the box (or adds to
            it, where several things are listed) and the box stays theirs to
            edit. */}
        {(q.kind === "text" || q.kind === "long") && q.suggestions?.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {q.suggestions.map((sug) => {
              const has = chosen.toLowerCase().includes(sug.toLowerCase());
              return (
                <button
                  key={sug}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!q.addsUp) return onChange(sug);
                    if (has) return;
                    const base = chosen.trim().replace(/[,\s]+$/, "");
                    onChange(base ? `${base}, ${sug.charAt(0).toLowerCase()}${sug.slice(1)}` : sug);
                  }}
                  className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                  style={
                    has
                      ? { background: "#56423e", borderColor: "#56423e", color: "#fff" }
                      : { borderColor: "rgba(86,66,62,0.22)", background: "#fff", color: "#56423e" }
                  }
                >
                  {sug}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
