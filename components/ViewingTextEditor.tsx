"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "@/components/Wire";
import {
  MAX_PARTS, TEXT_TAGS, checkTemplate, fillTemplate, smsParts, tidyTemplate, type TextVars,
} from "@/lib/viewing-text-template";

/**
 * Profile > Custom > Viewing text (10 Oct 2026): the text a viewer gets about
 * an hour before a viewing in your diary, in your own words. The standard text
 * shows until you change it; every rule lives in lib/viewing-text-template and
 * is checked again on save and again on send.
 *
 * Owners see everybody's below their own, with Back to standard on each.
 */

type Loaded = {
  template: string | null;
  updatedAt: string | null;
  standard: string;
  preview: TextVars & { real: boolean };
  readOnly: boolean;
};
type Person = { userId: string; name: string; template: string; updatedAt: string | null; ok: boolean };

const PENCE_PER_TEXT = 4.2;

function cost(parts: number) {
  return `${parts} ${parts === 1 ? "text" : "texts"}, about ${Math.round(parts * PENCE_PER_TEXT)}p`;
}

export default function ViewingTextEditor() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let gone = false;
    fetch("/api/me/viewing-text")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (gone) return;
        if (!r.ok || !j.ok) return setFailed(j.error ?? "Your text couldn't be loaded just now. Try again in a minute.");
        setData(j);
        setDraft(j.template ?? j.standard);
      })
      .catch(() => !gone && setFailed("Your text couldn't be loaded just now. Try again in a minute."));
    loadPeople();
    return () => { gone = true; };
  }, []);

  /* Owners only; anybody else gets a 403 and the list simply isn't shown.
     Read again after their own save, since they are on it too. */
  function loadPeople() {
    fetch("/api/me/viewing-text?all=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.ok && setPeople(j.people))
      .catch(() => undefined);
  }

  const check = useMemo(() => checkTemplate(draft), [draft]);
  const filled = useMemo(() => (data ? fillTemplate(tidyTemplate(draft), data.preview) : ""), [draft, data]);
  const parts = smsParts(filled).parts;
  const saved = data ? data.template ?? data.standard : "";
  const isStandard = data ? tidyTemplate(draft) === data.standard : true;
  const changed = data ? tidyTemplate(draft) !== tidyTemplate(saved) : false;

  function insert(tag: string) {
    const el = box.current;
    if (!el || data?.readOnly) return;
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + tag + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    setFlash(null);
    const r = await fetch("/api/me/viewing-text", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template: draft }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok || !j.ok) return setFlash({ tone: "bad", text: j.error ?? "That didn't save. Try again in a minute." });
    setData({ ...data, template: j.template, updatedAt: j.updatedAt ?? null });
    setDraft(j.template ?? data.standard);
    setFlash({ tone: "good", text: j.template ? "Saved. Your next viewing reminders will use it." : "Saved. You're on the standard text." });
    if (people) loadPeople();
  }

  async function backToStandard(userId?: string) {
    if (!data) return;
    if (userId) {
      const r = await fetch(`/api/me/viewing-text?user=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
      if (r?.ok) setPeople((p) => (p ?? []).filter((x) => x.userId !== userId));
      return;
    }
    if (!data.template) {
      setDraft(data.standard);
      return;
    }
    setBusy(true);
    const r = await fetch("/api/me/viewing-text", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setFlash({ tone: "bad", text: "That didn't work. Try again in a minute." });
    setData({ ...data, template: null, updatedAt: null });
    setDraft(data.standard);
    setFlash({ tone: "good", text: "Back on the standard text." });
    if (people) loadPeople();
  }

  return (
    <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px]">Viewing Reminder Text</h2>
        {data && <Pill tone={data.template ? "accent" : "neutral"}>{data.template ? "Your own text" : "Standard text"}</Pill>}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
        The text a viewer gets about an hour before a viewing in your diary. Change the words if you like - the tags
        fill in the details for each viewing.
      </p>

      {failed ? (
        <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{failed}</p>
      ) : !data ? (
        <div className="mt-5 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Loading your text…
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
            <div className="min-w-0">
              <label htmlFor="viewing-text" className="block text-[9.5px] uppercase tracking-wide text-muted">Your text</label>
              <textarea
                id="viewing-text"
                ref={box}
                value={draft}
                readOnly={data.readOnly}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setFlash(null);
                }}
                rows={6}
                className="mt-1 w-full resize-y rounded-xl border border-line/80 bg-box px-3 py-2.5 text-[13px] leading-relaxed"
              />
              <p className="mt-2 text-[9.5px] uppercase tracking-wide text-muted">Tap a tag to add it</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TEXT_TAGS.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    title={t.what}
                    disabled={data.readOnly}
                    onClick={() => insert(t.tag)}
                    className="rounded-full border border-line/80 bg-box px-2.5 py-1 text-[11.5px] hover:border-accent-dark/50 disabled:opacity-40"
                  >
                    {t.tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-[9.5px] uppercase tracking-wide text-muted">
                {data.preview.real ? "How your next viewer sees it" : "How it looks, with example details"}
              </p>
              <div className="mt-1 rounded-2xl bg-page p-3">
                <div className="max-w-full rounded-2xl rounded-bl-md bg-[#e9e9eb] px-3 py-2 text-[13px] leading-snug text-[#1c1c1e] [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {filled || " "}
                </div>
                <p className="mt-1.5 pl-1 text-[10.5px] text-muted">From +44 7861 904771</p>
              </div>
              <p className="mt-2 text-[11.5px] text-muted">
                This one: <span className="text-ink">{cost(parts)}</span>
                {check.worstParts > parts && <> · with a long address: {cost(check.worstParts)}</>}
              </p>
            </div>
          </div>

          {(check.errors.length > 0 || check.warnings.length > 0) && (
            <ul className="mt-4 space-y-1.5 text-[12px]">
              {check.errors.map((e) => (
                <li key={e} className="rounded-lg border border-accent-dark/40 bg-accent-soft/40 px-3 py-2">{e}</li>
              ))}
              {check.warnings.map((w) => (
                <li key={w} className="rounded-lg border border-line/80 bg-box px-3 py-2 text-muted">{w}</li>
              ))}
            </ul>
          )}

          {flash && (
            <p className={`mt-3 rounded-xl p-3 text-[12.5px] ${flash.tone === "good" ? "bg-[#e8f5ec] text-[#1e7a3c]" : "border border-accent-dark/40 bg-accent-soft/40"}`}>
              {flash.text}
            </p>
          )}

          {data.readOnly ? (
            <p className="mt-4 text-[12px] text-muted">You're viewing as somebody. Their text is theirs to change.</p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy || !changed || !check.ok}
                className="rounded-lg bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              {!isStandard && (
                <button
                  type="button"
                  onClick={() => backToStandard()}
                  disabled={busy}
                  className="rounded-lg border border-line/80 px-4 py-2 text-[12.5px] disabled:opacity-40"
                >
                  Back to standard
                </button>
              )}
              {changed && (
                <button type="button" onClick={() => setDraft(saved)} className="px-2 py-2 text-[12px] text-muted underline-offset-2 hover:underline">
                  Undo changes
                </button>
              )}
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
            It must say {"{time}"} and {"{address}"}, can be up to {MAX_PARTS} texts long, and can't contain links. Unaccompanied
            viewings always get the standard text, because it tells the viewer nobody from us will be there.
          </p>

          {people && people.length > 0 && (
            <div className="mt-5 border-t border-line/70 pt-4">
              <h3 className="text-[13px]">Everybody&apos;s Own Texts</h3>
              <p className="mt-1 text-[11.5px] text-muted">Only owners see this. Anyone not listed is on the standard text.</p>
              <ul className="mt-3 space-y-2.5">
                {people.map((p) => (
                  <li key={p.userId} className="rounded-xl border border-line/70 bg-box p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] text-ink">{p.name}</span>
                      <div className="flex items-center gap-2">
                        {!p.ok && <Pill tone="accent">Breaks a rule, sending the standard</Pill>}
                        <button type="button" onClick={() => backToStandard(p.userId)} className="rounded-lg border border-line/80 px-2.5 py-1 text-[11.5px]">
                          Back to standard
                        </button>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted [overflow-wrap:anywhere]">{p.template}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
