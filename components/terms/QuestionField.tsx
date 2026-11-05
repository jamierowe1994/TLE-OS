"use client";

import { KEPT, asked, cardAsked, cardKey, type Answers, type Question } from "@/lib/property-questions";

/**
 * ONE QUESTION ABOUT THE HOME, as the landlord's "before you sign" screens
 * (components/terms/BeforeYouSign) and the agent's check before sending
 * (components/terms/TermsSendScreen) both draw it. Styled by app/terms-
 * questions.css (.tq), which takes its colours from whichever page it sits in.
 *
 *   choice   a row of buttons, one press
 *   text     a box with the usual answers as one-tap chips under it (James,
 *            5 Nov 2026: "offer quick suggestions rather than them having to
 *            type it in"); a chip fills the box, or adds to it where several
 *            things are listed, and the box stays theirs to edit
 *   card     a meter also asks whether it is a card or key meter
 *   secret   a code: once saved it shows as kept, never as itself
 */

export default function QuestionField({
  q,
  answers,
  onChange,
  locked = null,
  by = null,
}: {
  q: Question;
  answers: Answers;
  onChange: (id: string, v: string) => void;
  /** Shown instead of the inputs: "The landlord answers this". */
  locked?: string | null;
  /** Who gave the answer already there, said under it ("From your agent"). */
  by?: string | null;
}) {
  if (!asked(q, answers)) return null;
  const raw = answers[q.id];
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(", ") : "";
  const id = `tq-${q.id}`;
  const kept = q.secret && value === KEPT;

  return (
    <div className="tq-q">
      <label className="tq-l" htmlFor={q.kind === "choice" ? undefined : id}>
        {q.label}
        {q.optional ? <span className="tq-opt">Optional</span> : null}
      </label>
      {q.help ? <p className="tq-help">{q.help}</p> : null}

      {locked ? (
        <p className="tq-locked">{locked}</p>
      ) : q.kind === "choice" ? (
        <div className="tq-opts" role="radiogroup" aria-label={q.label}>
          {(q.options ?? []).map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(q.id, o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      ) : kept ? (
        <div className="tq-kept">
          <span>Saved and kept locked away</span>
          <button type="button" onClick={() => onChange(q.id, "")}>Change it</button>
        </div>
      ) : q.kind === "long" ? (
        <textarea id={id} rows={3} value={value} placeholder={q.placeholder} onChange={(e) => onChange(q.id, e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} placeholder={q.placeholder} autoComplete="off" spellCheck={!q.secret} onChange={(e) => onChange(q.id, e.target.value)} />
      )}

      {!locked && !kept && q.kind !== "choice" && q.suggestions?.length ? (
        <div className="tq-chips">
          {q.suggestions.map((sug) => {
            const has = q.addsUp ? value.toLowerCase().includes(sug.toLowerCase()) : value === sug;
            return (
              <button
                key={sug}
                type="button"
                className={has ? "on" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!q.addsUp) return onChange(q.id, sug);
                  if (has) return;
                  const base = value.trim().replace(/[,\s]+$/, "");
                  /* "None" stands alone; anything else replaces it. */
                  if (sug === "None" || !base || base === "None") return onChange(q.id, sug);
                  onChange(q.id, `${base}, ${sug.charAt(0).toLowerCase()}${sug.slice(1)}`);
                }}
              >
                {sug}
              </button>
            );
          })}
        </div>
      ) : null}

      {!locked && cardAsked(q, answers) ? (
        <div className="tq-card">
          <span>Is it a card or key meter?</span>
          <div className="tq-opts sm" role="radiogroup" aria-label="Is it a card or key meter?">
            {(["yes", "no"] as const).map((v) => {
              const on = answers[cardKey(q.id)] === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => onChange(cardKey(q.id), v)}>
                  {v === "yes" ? "Yes" : "No"}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {by && !locked ? <p className="tq-by">{by}</p> : null}
    </div>
  );
}
