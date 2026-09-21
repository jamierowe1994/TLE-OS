"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { GREEN } from "@/components/compliance-desk/CheckRow";

/**
 * His own to-do list: the jobs that are for a person, not for a queue.
 *
 * The three lists above are things that ARRIVE - a certificate runs out, a
 * file is uploaded, a job finishes. These are things somebody has to go and
 * find out: is there gas at this address at all; is REX PM's "No Gas" category
 * right. They were written down on 10 Sep 2026 (docs/MICHAEL-COMPLIANCE-VIEW)
 * to be raised "the day Michael has an OS account".
 *
 * os_tasks already held tasks per person, and until this card NOTHING showed a
 * person their own: the only reader was a lead's drawer, which lists the tasks
 * on that lead. A task raised against him would have sat in the table unseen.
 * Same route the drawer uses (/api/tasks), so a tick here is the same tick.
 */
interface Task {
  id: string;
  title: string;
  detail: string;
  dueAt: string | null;
  createdBy: string;
}

export default function TodoCard() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* Six, then the rest on request: the list is long on day one and must not
     push what is coming up for renewal off the bottom of the screen. */
  const [all, setAll] = useState(false);
  const FIRST = 6;

  useEffect(() => {
    let gone = false;
    fetch("/api/tasks", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; tasks?: Task[]; error?: string }) => {
        if (gone) return;
        if (!j.ok) setError(j.error ?? "Could not read your list.");
        else setTasks(j.tasks ?? []);
      })
      .catch(() => !gone && setError("Could not read your list."));
    return () => {
      gone = true;
    };
  }, []);

  async function tick(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, done: true }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) { setTasks((t) => (t ?? []).filter((x) => x.id !== id)); setError(null); }
      else setError(j.error ?? "That did not save.");
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="fade-up rounded-[22px] border border-line/70 bg-card p-5" data-search>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="list" size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight">{tasks?.length ? `${tasks.length} on your to-do list` : "Your to-do list"}</h2>
          <p className="mt-0.5 text-[12px] text-muted">Things to find out or put right, rather than things that arrive. Tick one when it is done.</p>
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] text-[#9d4340]">{error}</p>}
      {!tasks && !error && (
        <div className="mt-4 flex items-center gap-3 text-[13px] text-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading your list.
        </div>
      )}
      {tasks && tasks.length === 0 && (
        <div className="mt-4 flex items-center gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${GREEN}`}><span className="h-2 w-2 rounded-full bg-[#56634a]" /></span>
          <p className="text-[13px] text-muted">Nothing on your list.</p>
        </div>
      )}
      {tasks && tasks.length > 0 && (
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-2">
          {(all ? tasks : tasks.slice(0, FIRST)).map((t) => (
            <li key={t.id} className="flex items-start gap-3 border-b border-line/50 py-2.5">
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => tick(t.id)}
                aria-label={`Mark done: ${t.title}`}
                title="Mark as done"
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-ink/30 transition hover:border-accent-dark hover:bg-accent-soft disabled:opacity-40"
              />
              <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="min-w-0 flex-1 text-left">
                <span className="block text-[13.5px] font-medium leading-snug">{t.title}</span>
                {open === t.id ? (
                  <span className="mt-1 block whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{t.detail || "No more detail on this one."}</span>
                ) : (
                  t.detail && <span className="block truncate text-[12px] text-muted">{t.detail}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {tasks && tasks.length > FIRST && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition hover:border-ink/40">
          {all ? "Show fewer" : `Show all ${tasks.length}`}
        </button>
      )}
    </section>
  );
}
