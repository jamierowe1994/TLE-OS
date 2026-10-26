"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/new-look/Parts";
import {
  DEFAULT_PACK_QUESTIONS, PACK_Q_LIMITS, checkQuestions, isDefaultQuestions, tidyQuestions, type PackQuestion,
} from "@/lib/pre-pack-questions";

/**
 * Profile > Pre-appraisal (26 Oct 2026 team call; lib/pre-pack-questions).
 *
 * The quick questions on the pack a landlord gets before the visit, as this
 * agent wants them: the words, two to four answers each, in their order, and
 * a switch to leave the slide out for agents who ask on the phone. One Save
 * for the lot, so a half-typed question never reaches a landlord's pack.
 * Beside it, the slide as the landlord will see it.
 */

type Got = { ok?: boolean; show?: boolean; questions?: PackQuestion[]; custom?: boolean; readOnly?: boolean; error?: string };

const copy = (qs: PackQuestion[]) => qs.map((x) => ({ q: x.q, options: [...x.options] }));

export default function PreAppraisalQuestions() {
  const [saved, setSaved] = useState<{ show: boolean; questions: PackQuestion[] } | null>(null);
  const [show, setShow] = useState(true);
  const [qs, setQs] = useState<PackQuestion[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const take = (j: Got) => {
    const s = { show: j.show !== false, questions: copy(j.questions?.length ? j.questions : DEFAULT_PACK_QUESTIONS) };
    setSaved(s);
    setShow(s.show);
    setQs(copy(s.questions));
  };
  useEffect(() => {
    fetch("/api/me/pre-appraisal-questions", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Got) => {
        if (!j.ok) throw new Error(j.error || "Couldn't read your questions.");
        setReadOnly(Boolean(j.readOnly));
        take(j);
      })
      .catch((e: Error) => {
        setErr(e.message || "Couldn't read your questions.");
        setSaved({ show: true, questions: copy(DEFAULT_PACK_QUESTIONS) });
        setQs(copy(DEFAULT_PACK_QUESTIONS));
      });
  }, []);

  const tidy = useMemo(() => tidyQuestions(qs), [qs]);
  const problems = useMemo(() => (show ? checkQuestions(tidy) : tidy.length ? checkQuestions(tidy) : []), [show, tidy]);
  const dirty = saved !== null && (show !== saved.show || JSON.stringify(tidy) !== JSON.stringify(saved.questions));
  const onDefaults = isDefaultQuestions(tidy);

  const edit = (i: number, f: (x: PackQuestion) => PackQuestion) => { setSaid(null); setQs((cur) => cur.map((x, k) => (k === i ? f({ q: x.q, options: [...x.options] }) : x))); };
  const move = (i: number, by: number) => {
    setSaid(null);
    setQs((cur) => {
      const j = i + by;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const removeQ = (i: number) => { setSaid(null); setQs((cur) => cur.filter((_, k) => k !== i)); };
  const addQ = () => { setSaid(null); setQs((cur) => (cur.length >= PACK_Q_LIMITS.maxQuestions ? cur : [...cur, { q: "", options: ["Yes", "No"] }])); };
  const reset = () => { setSaid(null); setShow(true); setQs(copy(DEFAULT_PACK_QUESTIONS)); };

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/me/pre-appraisal-questions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ show, questions: tidy.length ? tidy : DEFAULT_PACK_QUESTIONS }),
    }).catch(() => null);
    const j = ((await r?.json().catch(() => null)) ?? {}) as Got;
    setBusy(false);
    if (!j.ok) return setErr(j.error || "That didn't save. Try again.");
    take(j);
    setSaid(j.show === false ? "Saved. Your packs leave the questions out." : "Saved. Your packs ask these from now on, including ones already sent.");
  }

  if (!saved) {
    return (
      <p className="nl-meta flex items-center gap-2 py-8">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Reading your questions…
      </p>
    );
  }

  const off = readOnly || busy;
  const shown = tidy.filter((x) => x.q && x.options.length >= PACK_Q_LIMITS.minOptions);

  return (
    <div className="nl-pq">
      <div className="nl-pq-main">
        <div className="nl-listbar">
          <h3 className="nl-block-title">Pre-Appraisal Questions</h3>
          <Badge tone={!show ? "neutral" : onDefaults ? "info" : "good"}>{!show ? "Slide left out" : onDefaults ? "The standard questions" : "Your own questions"}</Badge>
        </div>
        <p className="nl-pq-blurb">
          The quick questions on the pack a landlord gets before your visit. Their answers come to you in the bell, each beside its question, so you arrive prepared.
        </p>

        <div className="nl-pq-switch">
          <button
            type="button"
            role="switch"
            aria-checked={show}
            aria-label="Show the questions slide"
            className={`nl-switch${show ? " is-on" : ""}`}
            disabled={off}
            onClick={() => { setSaid(null); setShow((s) => !s); }}
          >
            <i />
          </button>
          <div>
            <span className="nl-strong block">Show the questions slide</span>
            <span className="nl-meta block">{show ? "On: your pack has seven pages, with these questions on page five." : "Off: your pack leaves the slide out and has six pages. Handy if you ask on the phone."}</span>
          </div>
        </div>

        <ol className={`nl-pq-list${show ? "" : " is-off"}`}>
          {qs.map((x, i) => (
            <li key={i} className="nl-pq-item">
              <div className="nl-pq-head">
                <span className="nl-count">{String(i + 1).padStart(2, "0")}</span>
                <input
                  className="nl-input"
                  value={x.q}
                  maxLength={PACK_Q_LIMITS.questionChars}
                  placeholder="Is there a mortgage on it?"
                  aria-label={`Question ${i + 1}`}
                  disabled={off}
                  onChange={(e) => edit(i, (o) => ({ ...o, q: e.target.value }))}
                />
                <div className="nl-pq-tools">
                  <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label={`Move question ${i + 1} up`} title="Move up" disabled={off || i === 0} onClick={() => move(i, -1)}>
                    <Chevron up />
                  </button>
                  <button type="button" className="nl-iconbtn nl-iconbtn--sm" aria-label={`Move question ${i + 1} down`} title="Move down" disabled={off || i === qs.length - 1} onClick={() => move(i, 1)}>
                    <Chevron />
                  </button>
                  <button type="button" className="nl-link nl-pq-remove" disabled={off} onClick={() => removeQ(i)}>Remove</button>
                </div>
              </div>
              <div className="nl-pq-opts">
                <span className="nl-meta nl-pq-optlab">Answers</span>
                {x.options.map((o, k) => (
                  <span key={k} className="nl-pq-opt">
                    <input
                      value={o}
                      maxLength={PACK_Q_LIMITS.optionChars}
                      aria-label={`Question ${i + 1}, answer ${k + 1}`}
                      placeholder="An answer"
                      disabled={off}
                      size={Math.max(6, Math.min(PACK_Q_LIMITS.optionChars, o.length + 1))}
                      onChange={(e) => edit(i, (q) => ({ ...q, options: q.options.map((v, m) => (m === k ? e.target.value : v)) }))}
                    />
                    <button
                      type="button"
                      aria-label={`Remove the answer ${o || k + 1}`}
                      title="Remove this answer"
                      disabled={off || x.options.length <= PACK_Q_LIMITS.minOptions}
                      onClick={() => edit(i, (q) => ({ ...q, options: q.options.filter((_, m) => m !== k) }))}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </span>
                ))}
                {x.options.length < PACK_Q_LIMITS.maxOptions && (
                  <button type="button" className="nl-link" disabled={off} onClick={() => edit(i, (q) => ({ ...q, options: [...q.options, ""] }))}>Add an answer</button>
                )}
              </div>
            </li>
          ))}
        </ol>

        {qs.length < PACK_Q_LIMITS.maxQuestions ? (
          <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm mt-3" disabled={off} onClick={addQ}>Add a question</button>
        ) : (
          <p className="nl-meta mt-3">Six is the most a slide holds. Remove one to add another.</p>
        )}

        {problems.length > 0 && (dirty || !qs.length) && <p className="nl-pq-problem">{problems[0]}</p>}
        {err && <p className="nl-pq-problem">{err}</p>}

        <div className="nl-pq-actions">
          <button type="button" className="nl-btn nl-btn--primary" disabled={off || !dirty || problems.length > 0} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="nl-link" disabled={off || (onDefaults && show && qs.length === DEFAULT_PACK_QUESTIONS.length)} onClick={reset}>Reset to the defaults</button>
          <a className="nl-link" href="/present/sample/pack?mine=1#s5" target="_blank" rel="noreferrer">See it on a sample pack</a>
        </div>
        <p className="nl-meta mt-2">
          {readOnly
            ? "You're viewing as somebody else. Only they can change their questions."
            : said ?? (dirty ? "Not saved yet. The sample pack shows what's saved." : "A change reaches packs you've already sent, from the next time they're opened.")}
        </p>
      </div>

      {/* The slide as the landlord sees it, drawn from what's typed. */}
      <aside className="nl-pq-preview" aria-label="How the slide looks">
        <span className="nl-eyebrow">On the pack, page five</span>
        {show && shown.length ? (
          <div className="nl-pq-card">
            {shown.map((x, i) => (
              <div key={i} className="nl-pq-q">
                <b>{x.q}</b>
                <div className="nl-pq-seg">
                  {x.options.map((o, k) => <span key={k} className={k === 0 ? "is-on" : ""}>{o}</span>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="nl-pq-card is-empty">
            <p className="nl-meta">{show ? "Add a question to see it here." : "Left out. The pack goes from what to have ready straight to what you'll bring."}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={up ? { transform: "rotate(180deg)" } : undefined}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
