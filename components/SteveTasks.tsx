"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Your tasks, in Steve's panel (James, 2 Oct 2026: Steve makes "tasks and
 * lists for the guys to follow" - so they need somewhere to be followed and
 * ticked). The same /api/tasks the lead drawer and Michael's to-do card use,
 * so a tick here is the same tick everywhere.
 */
type Task = { id: string; title: string; detail: string; dueAt: string | null; createdBy: string; listingId: string | null; leadId: string | null };

const due = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  return days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

function TaskList() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    fetch("/api/tasks", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; tasks?: Task[]; error?: string }) => {
        if (gone) return;
        if (!j.ok) setError(j.error ?? "Could not read your tasks.");
        else setTasks(j.tasks ?? []);
      })
      .catch(() => !gone && setError("Could not read your tasks."));
    return () => {
      gone = true;
    };
  }, []);

  async function tick(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, done: true }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) setTasks((t) => (t ?? []).filter((x) => x.id !== id));
      else setError(j.error ?? "That did not save.");
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="py-3 text-[12.5px] text-accent-dark">{error}</p>;
  if (!tasks) return <p className="py-3 text-[12.5px] text-muted">Reading your tasks…</p>;
  if (!tasks.length)
    return <p className="py-3 text-[12.5px] leading-relaxed text-muted">Nothing on your list. Ask me to make one - &ldquo;give me a list for my take-on on Friday&rdquo;.</p>;

  return (
    <ul className="divide-y divide-line/50">
      {tasks.map((t) => {
        const when = due(t.dueAt);
        const href = t.leadId ? `/leads?open=${encodeURIComponent(t.leadId)}` : t.listingId ? `/listings?open=${encodeURIComponent(t.listingId)}` : null;
        return (
          <li key={t.id} className="flex items-start gap-2.5 py-2.5">
            <button
              type="button"
              disabled={busy === t.id}
              onClick={() => tick(t.id)}
              aria-label={`Mark done: ${t.title}`}
              title="Mark as done"
              className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-md border border-ink/30 transition hover:border-accent-dark hover:bg-accent-soft disabled:opacity-40"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold leading-snug">{t.title}</span>
              {t.detail && <span className="block text-[11.5px] leading-snug text-muted">{t.detail}</span>}
              <span className="mt-0.5 flex flex-wrap gap-x-2 text-[10.5px] text-muted">
                {when && <span className={when === "Overdue" ? "font-semibold text-accent-dark" : ""}>{when}</span>}
                {t.createdBy && <span>from {t.createdBy}</span>}
                {href && (
                  <Link href={href} className="text-accent-dark underline underline-offset-2">
                    Open it
                  </Link>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Steve's tasks tab: their list, then the standing jobs he runs for them
 * (lib/steve-jobs, 2 Oct 2026), each with what it last found.
 */
export default function SteveTasks() {
  return (
    <div className="max-h-[56vh] overflow-y-auto pr-1">
      <TaskList />
      <StandingJobs />
    </div>
  );
}

type Job = { id: string; title: string; when: string; nextAt: string | null; paused: boolean };
type Run = { id: string; jobId: string; at: string; text: string; ok: boolean };

function StandingJobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/assistant/jobs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j: { jobs?: Job[]; runs?: Run[] }) => {
        setJobs(j.jobs ?? []);
        setRuns(j.runs ?? []);
      })
      .catch(() => setError("Could not read your standing jobs."));
  useEffect(() => {
    void load();
  }, []);

  async function change(id: string, what: "pause" | "resume" | "delete") {
    setBusy(id);
    const ok = await fetch("/api/assistant/jobs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, change: what }) })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ok) setError("That did not save.");
    await load();
    setBusy(null);
  }

  return (
    <section className="mt-4 border-t border-line/60 pt-3">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Standing jobs</p>
      {error ? (
        <p className="py-2 text-[12px] text-accent-dark">{error}</p>
      ) : !jobs ? (
        <p className="py-2 text-[12px] text-muted">Reading your jobs…</p>
      ) : !jobs.length ? (
        <p className="py-2 text-[12px] leading-relaxed text-muted">
          None yet. Ask me for one - &ldquo;every Monday at nine, tell me which of my listings have no photos&rdquo;.
        </p>
      ) : (
        <ul className="divide-y divide-line/50">
          {jobs.map((j) => {
            const last = runs.find((r) => r.jobId === j.id);
            return (
              <li key={j.id} className="py-2.5">
                <span className="block text-[12.5px] font-semibold leading-snug">{j.title}</span>
                <span className="block text-[11px] text-muted">
                  {j.when}
                  {j.paused ? " · paused" : j.nextAt ? ` · next ${new Date(j.nextAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : " · finished"}
                </span>
                {last && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-muted hover:text-ink">
                      Last found, {new Date(last.at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink/80">{last.text}</p>
                  </details>
                )}
                <span className="mt-1 flex gap-3 text-[11px]">
                  <button type="button" disabled={busy === j.id} onClick={() => change(j.id, j.paused ? "resume" : "pause")} className="text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40">
                    {j.paused ? "Carry on" : "Pause"}
                  </button>
                  <button type="button" disabled={busy === j.id} onClick={() => change(j.id, "delete")} className="text-muted underline-offset-2 hover:text-accent-dark hover:underline disabled:opacity-40">
                    Stop
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
