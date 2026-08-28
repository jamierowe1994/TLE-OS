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
  const [who, setWho] = useState<string>("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(() => {
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
  const questions = (lines ?? []).filter((l) => l.role === "agent" && l.kind === "ask");
  /* Agents only — the assistant's own lines would swamp the picker. */
  const people = [...new Set((lines ?? []).filter((l) => l.role === "agent").map((l) => l.userEmail))].sort();
  const shown = who ? (lines ?? []).filter((l) => l.userEmail === who) : (lines ?? []);

  return (
    <>
      <PageHeader
        title="Assistant"
        blurb="What people have asked him, and what he can answer for himself."
      />

      <section className="fade-up mt-8 flex flex-wrap items-center gap-5 rounded-2xl border border-line/70 bg-panel p-5">
        <AssistantCharacter mood="thinking" size={92} track={false} />
        <div className="min-w-[220px] flex-1">
          <p className="text-[13.5px]">He can&rsquo;t answer anything yet</p>
          <p className="mt-1 max-w-[52ch] text-[12px] leading-relaxed text-muted">
            There is no model behind him — no key, no cost, no calls. The panel in the
            corner says so rather than guessing, because a help system that answers
            confidently and wrongly is worse than one that admits it is young. Questions
            go into the list below instead.
          </p>
          <p className="mt-2 text-[11.5px] text-muted">
            Needs an <span className="font-semibold">ANTHROPIC_API_KEY</span> and a spend
            ceiling before it goes near the pilot.
          </p>
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
                    {l.role === "agent" ? l.userEmail : "Assistant"}
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
