"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The works order on the last screen of Report a repair / Plan a
 * certificate, shown as the email itself and written in place (James, 8 Nov
 * 2026: "I'd rather just display the email ... they should be able to click
 * into the email and edit it ... say 'add tenant number' and that will just
 * add where the tenant's number was").
 *
 * The subject and the middle of the email (greeting through access notes)
 * are typed into directly. The details the job holds sit underneath as
 * buttons; one press drops the detail in where the cursor was. The heading,
 * the button to the job page, the invoice line and the sign-off are fixed and
 * are added as always. "See it as they'll get it" draws the real email with
 * the changes in.
 */

export type MailWords = { subject: string; body: string };
export type MailField = { label: string; value: string };

export default function WorksOrderEmail({
  contractor, heading, state, words, onWords, dirtyDetails, onReset, renderAs,
}: {
  contractor: { name: string; email: string };
  /** "Works order #1001", fixed above the words. */
  heading: string;
  state: { kind: "loading" } | { kind: "error"; error: string } | { kind: "ready"; original: MailWords | null; fields: MailField[]; html: string };
  /** The words as they stand: the agent's, or the original until they type. */
  words: MailWords | null;
  onWords: (w: MailWords) => void;
  /** The job's details changed after the agent rewrote the email. */
  dirtyDetails: boolean;
  onReset: () => void;
  /** The real email with the words in, for "See it as they'll get it". */
  renderAs: (w: MailWords | null) => Promise<string | null>;
}) {
  const body = useRef<HTMLTextAreaElement | null>(null);
  const caret = useRef<number | null>(null);
  const [asSent, setAsSent] = useState<string | "loading" | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  /* Grows with what's in it, so the whole email reads without a scroll box. */
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    /* Again when the width changes (a phone turned, the window narrowed), or lines would hide. */
    let w = el.clientWidth;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [words?.body, state.kind]);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(null), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  if (state.kind === "loading") {
    return (
      <div className="nl-wo-mail is-wait">
        <span className="nl-dash-spin" aria-hidden /> Writing the works order…
      </div>
    );
  }
  if (state.kind === "error") return <p className="nl-wo-mail is-wait is-err">{state.error}</p>;

  const w = words ?? state.original;
  const edited = !!words && !!state.original && (words.body !== state.original.body || words.subject !== state.original.subject);

  /* The builder's version has lost the part we let people change: show it as it goes. */
  if (!w) {
    return (
      <div className="nl-wo-mail">
        <div className="nl-wo-head">
          <p><span>To</span><b>{contractor.name}</b><em>{contractor.email}</em></p>
        </div>
        <iframe title="The works order" srcDoc={state.html} sandbox="" className="nl-wo-frame" />
      </div>
    );
  }

  const insert = (f: MailField) => {
    const text = w.body;
    const at = caret.current ?? text.length;
    const before = text.slice(0, at);
    const after = text.slice(at);
    const pad = before && !/[\s(]$/.test(before) ? " " : "";
    const tail = after && !/^[\s.,;:)]/.test(after) ? " " : "";
    const next = `${before}${pad}${f.value}${tail}${after}`;
    onWords({ subject: w.subject, body: next });
    const end = before.length + pad.length + f.value.length;
    caret.current = end;
    setAdded(f.label);
    requestAnimationFrame(() => {
      const el = body.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(end, end);
    });
  };
  const keep = () => { caret.current = body.current?.selectionStart ?? null; };

  const openAsSent = async () => {
    setAsSent("loading");
    const html = await renderAs(edited ? w : null);
    setAsSent(html ?? null);
  };

  return (
    <div className="nl-wo-mail">
      <div className="nl-wo-head">
        <p><span>To</span><b>{contractor.name}</b><em>{contractor.email}</em></p>
        <label>
          <span>Subject</span>
          <input value={w.subject} onChange={(e) => onWords({ subject: e.target.value, body: w.body })} maxLength={200} aria-label="Subject" />
        </label>
      </div>

      <div className="nl-wo-letter">
        <p className="nl-wo-h">{heading}</p>
        <textarea
          ref={body}
          value={w.body}
          onChange={(e) => { caret.current = e.target.selectionStart; onWords({ subject: w.subject, body: e.target.value }); }}
          onSelect={keep}
          onKeyUp={keep}
          onClick={keep}
          onBlur={keep}
          maxLength={6000}
          spellCheck
          aria-label="The email"
          className="nl-wo-body"
        />
        <p className="nl-wo-fixed">Then, as always: the button to tell us the date and time, the line about quoting the works order number on the invoice, and your name and number.</p>
      </div>

      {state.fields.length > 0 && (
        <div className="nl-wo-add">
          <p className="nl-wo-k">Add to the email <em>Goes in where your cursor is</em></p>
          <div className="nl-wo-chips">
            {state.fields.map((f) => (
              <button key={f.label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(f)} title={f.value} className={added === f.label ? "is-added" : undefined}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="nl-wo-foot">
        {dirtyDetails && edited && <p className="nl-wo-warn">You changed the job after rewording this, so the email still has the old details. Put back the original to pick them up.</p>}
        <div className="nl-wo-links">
          <button type="button" className="nl-link" onClick={() => void openAsSent()}>See it as {contractor.name} will get it</button>
          {edited && <button type="button" className="nl-link" onClick={onReset}>Put back the original</button>}
        </div>
      </div>

      {asSent && (
        <div className="nl-wo-sent" role="dialog" aria-label={`The email as ${contractor.name} will get it`}>
          <div className="nl-wo-sent-bar">
            <span>As {contractor.name} will get it</span>
            <button type="button" className="nl-link" onClick={() => setAsSent(null)}>Back to editing</button>
          </div>
          {asSent === "loading" ? (
            <div className="nl-wo-mail is-wait"><span className="nl-dash-spin" aria-hidden /> Drawing it…</div>
          ) : (
            <iframe title="The works order as it will go" srcDoc={asSent} sandbox="" className="nl-wo-frame" />
          )}
        </div>
      )}
    </div>
  );
}
