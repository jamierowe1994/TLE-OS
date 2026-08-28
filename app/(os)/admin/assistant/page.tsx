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

type Bug = {
  id: string;
  reporterEmail: string;
  body: string;
  path: string;
  kind: string;
  state: string;
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
  const [bugs, setBugs] = useState<Bug[] | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/pilot")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: { bugs?: Bug[] }) => setBugs(d.bugs ?? []))
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

  const questions = (bugs ?? []).filter((b) => b.kind === "question");

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

        {bugs === null ? (
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
                    {q.reporterEmail} on {q.path || "—"}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when(q.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-[13px]">{q.body}</p>
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
