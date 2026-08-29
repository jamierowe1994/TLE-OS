"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import AssistantCharacter from "@/components/AssistantCharacter";

/**
 * The assistant's console — what people have asked, and what he can answer.
 *
 * ── Why this page is a QUESTION LIST and not a knowledge editor ───────────
 *
 * The obvious build is a box to type help articles into. That gets you a pile
 * of documents about whatever felt important on the day, and the thing an agent
 * actually got stuck on at 4pm on a Tuesday goes unwritten.
 *
 * So the console starts from the other end. Every question asked through the
 * character in the corner lands here, and that list IS the writing order: each
 * one is a guide somebody needed and could not find. Write from the top and the
 * help centre grows in the order it is wanted.
 *
 * ── What is deliberately not here yet ─────────────────────────────────────
 *
 * There is no model behind the assistant — no key, no dependency, no call — so
 * he cannot answer anything on his own. The panel in the corner says so
 * plainly rather than pretending, because a help system that confidently
 * answers wrong is worse than one that admits it is young.
 */

/* A starting shape rather than an empty box. Nobody writes a good brief from a
   blank field, and the headings are the four things James asked for. */
const BRIEF_PLACEHOLDER = `What he's here to do
e.g. Help TLE partner agents get unstuck without having to ring anyone. Most
questions will be about listings, viewings, applications, compliance and getting
paid.

How he should talk
e.g. Like a helpful colleague who has been here a while. Warm but not chatty.
Never corporate.

How he should respond
e.g. Answer the question first, then the detail. If it isn't covered, say so
plainly rather than guessing. Never invent a figure or a policy.

Language
e.g. Plain English, UK spelling. No jargon unless the agent used it first.

The process, roughly
e.g. Appraisal, then listing, then viewings, then application, then referencing,
then move-in. Propoly is where a deal lives; REX is the CRM.`;

type Line = {
  id: string;
  userEmail: string;
  thread: string;
  role: "agent" | "assistant";
  text: string;
  path: string;
  kind: string;
  createdAt: string;
};

function when(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function AssistantConsole() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [brain, setBrain] = useState<{
    live: boolean;
    spent: number;
    cap: number;
    map?: string;
    prompt?: string;
    promptBlocks?: number;
    knowledgeCount?: number;
    knowledgeReadable?: boolean;
  } | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefBy, setBriefBy] = useState<string>("");
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefFlash, setBriefFlash] = useState<string | null>(null);
  const [who, setWho] = useState<string>("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/assistant-brief")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { brief?: { body: string; updatedBy: string } } | null) => {
        setBrief(d?.brief?.body ?? "");
        setBriefBy(d?.brief?.updatedBy ?? "");
      })
      .catch(() => setBrief(""));
    fetch("/api/admin/assistant-brain")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: {
    live: boolean;
    spent: number;
    cap: number;
    map?: string;
    prompt?: string;
    promptBlocks?: number;
    knowledgeCount?: number;
    knowledgeReadable?: boolean;
  } | null) => setBrain(d))
      .catch(() => setBrain(null));
    fetch("/api/admin/assistant-log")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: { lines?: Line[] }) => setLines(d.lines ?? []))
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }

  /* The worklist: what agents actually asked, newest first. Read off the same
     log as the transcript below rather than a second store — one source, so
     the two can never disagree about what was said. */
  async function saveBrief() {
    setSavingBrief(true);
    setBriefFlash(null);
    try {
      const r = await fetch("/api/admin/assistant-brief", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: brief ?? "" }),
      });
      setBriefFlash(r.ok ? "Saved. He'll use this on the next question." : "Couldn't save that.");
    } catch {
      setBriefFlash("Couldn't save that.");
    } finally {
      setSavingBrief(false);
    }
  }

  const questions = (lines ?? []).filter((l) => l.role === "agent" && l.kind === "ask");
  /* Agents only — the assistant's own lines would swamp the picker. */
  const people = [...new Set((lines ?? []).filter((l) => l.role === "agent").map((l) => l.userEmail))].sort();
  const shown = who ? (lines ?? []).filter((l) => l.userEmail === who) : (lines ?? []);

  return (
    <>
      <PageHeader
        title="Steve"
        blurb="What people have asked Steve, and what he can answer for himself."
      />

      <section className="fade-up mt-8 flex flex-wrap items-center gap-5 rounded-2xl border border-line/70 bg-panel p-5">
        <AssistantCharacter mood="thinking" size={92} track={false} />
        <div className="min-w-[220px] flex-1">
          {brain?.live ? (
            <>
              <p className="text-[13.5px]">He&rsquo;s answering</p>
              <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-muted">
                Claude, over the operational knowledge below — and told to say when
                something isn&rsquo;t covered rather than guess at a process or a figure.
                A confident wrong answer about a landlord is worse than no answer.
              </p>
              <p className="mt-2 text-[11.5px] text-muted">
                {brain.spent.toLocaleString("en-GB")} of{" "}
                {brain.cap.toLocaleString("en-GB")} tokens used today. Over the ceiling he
                says so and passes the question on rather than stopping.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13.5px]">He can&rsquo;t answer at the moment</p>
              <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-muted">
                Either no <span className="font-semibold">ANTHROPIC_API_KEY</span> is set,
                or today&rsquo;s ceiling has been reached. Questions still land in the list
                below, and the panel says which it is rather than pretending.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="fade-up mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Questions asked</h2>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
          >
            Refresh
          </button>
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Each one is a guide somebody needed and couldn&rsquo;t find. Write from the top.
        </p>

        {lines === null ? (
          <p className="mt-4 text-[12.5px] text-muted">Loading…</p>
        ) : questions.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">
            Nobody has asked anything yet. The character sits in the bottom-right of every
            screen — questions asked through him land here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {questions.map((q) => (
              <li key={q.id} className="rounded-xl border border-line/70 bg-panel p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12px] text-muted">
                    {q.userEmail} on {q.path || "—"}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when(q.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-[13px]">{q.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------- what he already knows -------------------- */}
      <section className="fade-up mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          What he already knows
        </h2>
        <p className="mt-1 max-w-[64ch] text-[12px] leading-relaxed text-muted">
          Generated from the system itself every time he answers &mdash; the stage names,
          their order and the wording all come from the same definitions the screens
          render from. Change a process and this changes with it; nobody has to remember
          to update it. It carries no figures on purpose: a number written into his
          context is stale the moment it&rsquo;s written, so he points at the screen that
          shows it instead.
        </p>
        {/* The knowledge base's state, said out loud. Empty and unreadable look
            the same from the outside and mean completely different things. */}
        {brain && (
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            {brain.knowledgeReadable === false ? (
              <>
                <span className="font-semibold text-ink">
                  The knowledge base could not be read.
                </span>{" "}
                He still explains the platform from the map, but he has no guidance on fees
                or policy until this is fixed.
              </>
            ) : brain.knowledgeCount ? (
              <>
                <span className="font-semibold text-ink">
                  {brain.knowledgeCount} guidance{" "}
                  {brain.knowledgeCount === 1 ? "entry" : "entries"} loaded
                </span>{" "}
                alongside the map.
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">No guidance written yet.</span> He
                explains the platform fully from the map, and says a policy or fee question
                has gone to you. Writing entries below is what widens that.
              </>
            )}
          </p>
        )}

        {/* THE WHOLE PROMPT, in order. This used to show the map alone, which
            read as if it were everything — and hid the block underneath it that
            was telling him he had no material and to say so. He then refused to
            describe a system he could describe perfectly, and the page for
            diagnosing that was showing the wrong half. */}
        <details className="mt-3 rounded-xl border border-line/70 bg-panel p-4">
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-ink">
            Read it as he reads it
            {brain?.promptBlocks ? ` — all ${brain.promptBlocks} blocks` : ""}
          </summary>
          <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">
            {brain?.prompt ?? brain?.map ?? "Loading…"}
          </pre>
        </details>
      </section>

      {/* ------------------------- the brief ---------------------------- */}
      <section className="fade-up mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide">His brief</h2>
        <p className="mt-1 max-w-[64ch] text-[12px] leading-relaxed text-muted">
          Who he is and how he behaves &mdash; how to talk, how to respond, what he&rsquo;s
          here to do. Separate from the knowledge below, which is facts about the
          business. This is read first and overrides his built-in manners, so anything
          here wins.
        </p>

        <textarea
          value={brief ?? ""}
          onChange={(e) => setBrief(e.target.value)}
          rows={14}
          spellCheck
          placeholder={BRIEF_PLACEHOLDER}
          className="mt-3 w-full rounded-xl border border-line/80 bg-box p-3.5 text-[12.5px] leading-relaxed outline-none focus:border-accent"
        />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveBrief}
            disabled={savingBrief || brief === null}
            className="rounded-lg bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            {savingBrief ? "Saving…" : "Save brief"}
          </button>
          <span className="text-[11.5px] text-muted">
            {briefFlash ??
              (briefBy ? `Last saved by ${briefBy}.` : "Nothing written yet — he'll use his defaults.")}
          </span>
        </div>
      </section>

      {/* ---------------------------- the log ---------------------------- */}
      <section className="fade-up mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Conversations</h2>
          {people.length > 1 && (
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
              aria-label="Filter by person"
            >
              <option value="">Everyone</option>
              {people.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          )}
        </div>
        <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-muted">
          Everything anyone has said to him, and everything he said back. Both halves are
          kept on purpose — a question is only half an exchange, and what we replied is
          the half that might have been wrong.
        </p>

        {lines === null ? (
          <p className="mt-4 text-[12.5px] text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">
            Nothing said yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {shown.map((l) => (
              <li
                key={l.id}
                className={`rounded-xl border p-3 ${
                  l.role === "agent" ? "border-line/70 bg-panel" : "border-line/40 bg-box"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[11.5px] text-muted">
                    {l.role === "agent" ? l.userEmail : "Steve"}
                    {l.kind !== "ask" ? ` · ${l.kind.replace("onboarding-", "intro: ")}` : ""}
                    {l.path ? ` · ${l.path}` : ""}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when(l.createdAt)}</span>
                </div>
                <p className="mt-1 text-[13px]">{l.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fade-up mt-8 rounded-2xl border border-line/70 bg-panel p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">What he&rsquo;ll read from</h2>
        <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
          Two knowledge bases, deliberately separate: the operational one you write, and
          Francesca&rsquo;s marketing and brand material. One assistant over both, so an
          agent asking about a listing and an agent asking about brand tone both get an
          answer without having to know which pile it lives in.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/business"
            className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] transition-colors hover:border-ink"
          >
            Operational knowledge →
          </Link>
          <Link
            href="/admin/marketing"
            className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] transition-colors hover:border-ink"
          >
            Marketing knowledge →
          </Link>
          <span className="inline-flex items-center">
            <Pill tone="neutral">Guides not built yet</Pill>
          </span>
        </div>
      </section>
    </>
  );
}
