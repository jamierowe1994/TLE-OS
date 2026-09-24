"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";

/**
 * AUTO SAVE, BY THE CLOSE BUTTON - on every record an agent edits.
 *
 * James, 23 Sep 2026, from Howard's list: everything saves as it changes, but
 * nothing said so, so a change looked lost. "It's not the auto save that's
 * the issue. It's the notification of the save." Then: the same on every
 * file - leads, listings, applications, everything.
 *
 * ── The chip ──────────────────────────────────────────────────────────────
 *
 *   Auto save on       nothing saved yet this visit
 *   Saving…            a save is on its way
 *   Saved 7:30pm       the last one landed
 *   Not saved          the last one was refused - Try again sends it again
 *
 * and Save, for anybody who wants to press something before they leave: it
 * commits a field still being typed in (a blur), sends anything waiting, and
 * otherwise says everything is saved. Each save is also said in a toast
 * (lib/toast), which outlives the drawer - the save that matters most is the
 * one sent as it closes.
 *
 * ── The scope ─────────────────────────────────────────────────────────────
 *
 * A file is a tree of components, and the saves happen all over it: the
 * access panel, the step track, the checklist, the drawer's own fields. So
 * the record screen makes a scope (useSaveScope), wraps its body in
 * <SaveScopeProvider>, and puts <SaveChip scope={...}> by its close button.
 * Anything inside reports its saves with useSaveReporter() - useCaseState
 * already does - and the chip hears all of them. A save outside any scope
 * still gets its toast.
 */

export interface SaveStatus {
  busy: boolean;
  /** Why the last save was refused, in words for the agent. */
  problem: string | null;
  /** The refused save can be sent again from the chip. */
  canRetry: boolean;
  savedAt: Date | null;
}

export type SaveOutcome = { ok: true } | { ok: false; problem: string; retry?: () => void };

export interface SaveReporter {
  /** A save is on its way. Call what comes back once, when it settles. */
  begin(label: string): (outcome: SaveOutcome) => void;
  /**
   * Something waiting to be sent (a debounce). Save sends it now. The function
   * answers whether it had anything to send. Returns the unregister.
   */
  waiting(flush: () => boolean): () => void;
}

/** Outside a scope: no chip to tell, so the toast is the whole of it. */
const LONE: SaveReporter = {
  begin: (label) => (o) => {
    if (o.ok) toast(`${label} saved`);
    else toast(`${label} not saved - ${o.problem}`, "bad");
  },
  waiting: () => () => {},
};

const Ctx = createContext<SaveReporter | null>(null);

export function useSaveReporter(): SaveReporter {
  return useContext(Ctx) ?? LONE;
}

export interface SaveScope {
  status: SaveStatus;
  reporter: SaveReporter;
  /** The chip's button: send what waits, else retry what failed, else say all is saved. */
  save: () => void;
}

export function useSaveScope(resetKey?: string | number | null): SaveScope {
  const [status, setStatus] = useState<SaveStatus>({ busy: false, problem: null, canRetry: false, savedAt: null });
  const problemRef = useRef<string | null>(null);
  const inFlight = useRef(0);
  const retryRef = useRef<(() => void) | null>(null);
  const flushers = useRef(new Set<() => boolean>());
  /* Bumped when the record changes: a save still settling for the one
     before must not land on this record's chip (23 Sep 2026 review). */
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = 0;
    retryRef.current = null;
    problemRef.current = null;
    setStatus({ busy: false, problem: null, canRetry: false, savedAt: null });
  }, [resetKey]);

  const reporter = useMemo<SaveReporter>(
    () => ({
      begin(label) {
        const gen = generation.current;
        inFlight.current += 1;
        setStatus((s) => ({ ...s, busy: true }));
        let settled = false;
        return (o) => {
          if (settled) return;
          settled = true;
          /* The record changed since: its toast still says how it went, but
             this chip belongs to the new record now. */
          if (gen !== generation.current) {
            if (o.ok) toast(`${label} saved`);
            else toast(`${label} not saved - ${o.problem}`, "bad");
            return;
          }
          inFlight.current = Math.max(0, inFlight.current - 1);
          const busy = inFlight.current > 0;
          if (o.ok) {
            retryRef.current = null;
            problemRef.current = null;
            setStatus({ busy, problem: null, canRetry: false, savedAt: new Date() });
            toast(`${label} saved`);
          } else {
            retryRef.current = o.retry ?? null;
            problemRef.current = o.problem;
            setStatus((s) => ({ ...s, busy, problem: o.problem, canRetry: Boolean(o.retry) }));
            toast(`${label} not saved - ${o.problem}`, "bad");
          }
        };
      },
      waiting(flush) {
        flushers.current.add(flush);
        return () => void flushers.current.delete(flush);
      },
    }),
    []
  );

  const save = useCallback(() => {
    /* A field still being typed in commits on blur, and saves itself. */
    (document.activeElement as HTMLElement | null)?.blur?.();
    /* After the blur's own save has had its turn to start. */
    window.setTimeout(() => {
      let sent = false;
      for (const f of flushers.current) sent = f() || sent;
      if (sent || inFlight.current > 0) return;
      const again = retryRef.current;
      if (again) {
        again();
        return;
      }
      /* Refused, and only the field itself can send it again. */
      if (problemRef.current) {
        toast(`Not saved - ${problemRef.current} Change it again to send it.`, "bad");
        return;
      }
      toast("Everything on this file is saved");
    }, 0);
  }, []);

  return { status, reporter, save };
}

export function SaveScopeProvider({ scope, children }: { scope: SaveScope; children: ReactNode }) {
  return <Ctx.Provider value={scope.reporter}>{children}</Ctx.Provider>;
}

/**
 * One save by fetch, reported. Reads the answer the way OS routes write it:
 * not ok, `{ ok: false }` or an `error` is a refusal. Try again sends it again
 * - so pass `{ retry: false }` for anything that CREATES something or tells
 * somebody, where a save that landed but whose answer was lost would be sent
 * twice.
 */
export async function trackSave<T = unknown>(
  reporter: SaveReporter,
  label: string,
  send: () => Promise<Response>,
  opts: { retry?: boolean } = {}
): Promise<{ ok: boolean; body: T | null }> {
  const settle = reporter.begin(label);
  let problem: string | null = null;
  let body: T | null = null;
  try {
    const r = await send();
    body = (await r.json().catch(() => null)) as T | null;
    const b = body as { ok?: boolean; error?: string } | null;
    if (!r.ok || b?.ok === false) problem = b?.error ?? "That didn't save.";
  } catch {
    problem = "That didn't save - the connection dropped.";
  }
  if (problem) settle({ ok: false, problem, retry: opts.retry === false ? undefined : () => void trackSave(reporter, label, send, opts) });
  else settle({ ok: true });
  return { ok: !problem, body };
}

export function savedTimeOf(at: Date): string {
  return at
    .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();
}

export default function SaveChip({ scope, className = "" }: { scope: SaveScope; className?: string }) {
  const { busy, problem, canRetry, savedAt } = scope.status;
  return (
    <div
      data-save-chip
      className={`flex h-9 min-w-0 shrink items-center gap-2 rounded-full border pl-3 pr-1 text-[12px] ${
        problem ? "border-accent-dark/40 text-accent-dark" : "border-line/80 text-muted"
      } ${className}`}
      aria-live="polite"
      title={problem ?? "Changes on this file save as you make them"}
    >
      {busy ? (
        <span aria-hidden className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
      ) : problem ? (
        <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path d="M8 4v5M8 11.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none" className={`shrink-0 ${savedAt ? "text-[#1e7a3c]" : ""}`}>
          <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="truncate whitespace-nowrap">
        {busy ? "Saving…" : problem ? "Not saved" : savedAt ? `Saved ${savedTimeOf(savedAt)}` : "Auto save on"}
      </span>
      <button
        type="button"
        onClick={scope.save}
        disabled={busy}
        className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
          problem && canRetry ? "bg-accent-dark text-white hover:opacity-90" : "bg-panel text-ink hover:bg-line/60"
        }`}
      >
        {problem && canRetry ? "Try again" : "Save"}
      </button>
    </div>
  );
}
