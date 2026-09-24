"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSaveReporter } from "@/components/SaveChip";

export type CaseKind = "appraisal" | "tenancy-link" | "access" | "listing-step" | "required-docs" | "viewing";

export type CaseStatus = "loading" | "ready" | "saving" | "saved" | "offline" | "error";

/** What each kind is called in a toast and on the Auto save chip. */
const SAID: Record<CaseKind, string> = {
  appraisal: "Appraisal",
  "tenancy-link": "Tenancy link",
  access: "Access details",
  "listing-step": "Progress",
  "required-docs": "Documents checklist",
  viewing: "Viewing notes",
};

/**
 * Load and save a record's OS-side state.
 *
 * Three things this exists to get right:
 *
 * 1. NEVER SAVE WHAT YOU JUST LOADED. A naive effect writes the value straight
 *    back on mount, which at best is a pointless round trip and at worst
 *    stamps a fresh empty case over a real one when the load is slow.
 *
 * 2. NEVER SAVE THE PREVIOUS RECORD'S STATE. Opening one record after another
 *    changes both the id and the value, and if a debounced save is still in
 *    flight it lands under the new id. The id travels WITH the save.
 *
 * 3. Say when it can't. With no database the API answers politely rather than
 *    failing, so the screen has to notice and tell the truth instead of
 *    showing a tick it hasn't earned.
 */
export function useCaseState<T>(
  kind: CaseKind,
  recordId: string | null,
  fallback: T
): [T, (next: T) => void, CaseStatus] {
  const [value, setValue] = useState<T>(fallback);
  const [status, setStatus] = useState<CaseStatus>("loading");
  /** The id whose value is currently in state — the guard for (1) and (2). */
  const loadedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The save still waiting out its 600ms, so closing the file or pressing
     Save sends it now rather than dropping it (23 Sep 2026: an unmount used
     to cancel it, and the last change before closing was lost). */
  const waitingSave = useRef<{ id: string; payload: T } | null>(null);
  const reporter = useSaveReporter();
  /* The read failed, so what is on screen is the empty default, not the
     record: a save now would write that over the real one (23 Sep 2026
     review - one note added after a failed load wiped a viewing's notes).
     Edits stay on screen and are refused, out loud, once per record. */
  const loadFailed = useRef<{ id: string; told: boolean } | null>(null);

  useEffect(() => {
    if (!recordId) return;
    let gone = false;
    loadedFor.current = null;
    loadFailed.current = null;
    setStatus("loading");
    setValue(fallback);
    fetch(`/api/case-state?kind=${kind}&id=${encodeURIComponent(recordId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        /* Under the fallback, not over it. A row written before a field
           existed comes back without it, and the screen then reads
           `undefined` where the type promised `null` — the same shape trap
           that makes a fix look like it never landed. Merging keeps old rows
           readable as the current shape. Non-objects (tenancy-link can be
           null) take the stored value as-is. */
        if (j.payload != null) {
          const stored = j.payload as T;
          const mergeable =
            typeof stored === "object" &&
            !Array.isArray(stored) &&
            typeof fallback === "object" &&
            fallback !== null &&
            !Array.isArray(fallback);
          setValue(mergeable ? ({ ...(fallback as object), ...(stored as object) } as T) : stored);
        }
        if (j.stored === false) {
          /* No database answered the read: it may hold a real record. */
          loadFailed.current = { id: recordId, told: false };
          setStatus("offline");
          return;
        }
        loadedFor.current = recordId;
        setStatus("ready");
      })
      .catch(() => {
        if (gone) return;
        loadFailed.current = { id: recordId, told: false };
        setStatus("offline");
      });
    return () => {
      gone = true;
    };
    // `fallback` is deliberately not a dependency: callers pass a literal, and
    // depending on it would reload the record on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, recordId]);

  const send = useCallback(
    async (id: string, payload: T, keepalive = false) => {
      const settle = reporter.begin(SAID[kind]);
      setStatus("saving");
      const body = JSON.stringify({ kind, id, payload });
      try {
        const res = await fetch("/api/case-state", {
          method: "POST",
          /* Browsers refuse a keepalive request over 64KB outright; a big
             case goes as an ordinary request and takes its chances. */
          keepalive: keepalive && body.length < 60_000,
          headers: { "content-type": "application/json" },
          body,
        });
        const j = (await res.json().catch(() => null)) as { saved?: boolean; error?: string } | null;
        /* A refusal is not a save, whatever the body says (23 Sep 2026). */
        if (res.ok && j?.saved) {
          setStatus("saved");
          settle({ ok: true });
        } else {
          setStatus(res.ok ? "offline" : "error");
          settle({
            ok: false,
            problem: res.ok ? "No database on this environment." : j?.error ?? "That didn't save.",
            retry: () => void send(id, payload),
          });
        }
      } catch {
        setStatus("error");
        settle({ ok: false, problem: "That didn't save - the connection dropped.", retry: () => void send(id, payload) });
      }
    },
    [kind, reporter]
  );

  /* Send what is waiting now. True when there was something to send. */
  const flush = useCallback(
    (keepalive = false): boolean => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const w = waitingSave.current;
      waitingSave.current = null;
      if (!w) return false;
      void send(w.id, w.payload, keepalive);
      return true;
    },
    [send]
  );

  const update = useCallback(
    (next: T) => {
      setValue(next);
      const id = recordId;
      // Nothing has been loaded for this id yet — a save now would be writing
      // the fallback over whatever is still on its way back.
      if (!id || loadedFor.current !== id) {
        const failed = loadFailed.current;
        if (id && failed?.id === id && !failed.told) {
          failed.told = true;
          reporter.begin(SAID[kind])({
            ok: false,
            problem: "This did not load, so changes here are not being saved. Close it and open it again.",
          });
        }
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      /* A different record's save still waiting goes first, under its own id. */
      if (waitingSave.current && waitingSave.current.id !== id) flush();
      waitingSave.current = { id, payload: next };
      setStatus("saving");
      timer.current = setTimeout(() => void flush(), 600);
    },
    [kind, recordId, flush, reporter]
  );

  /* Save on the Auto save chip sends it now. */
  useEffect(() => reporter.waiting(() => flush()), [reporter, flush]);
  /* Leaving the file sends it, rather than dropping it. */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(true), []);

  return [value, update, status];
}

/** One line for the screen. Silent when there's nothing worth saying. */
export function saveLabel(status: CaseStatus): string | null {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "offline":
      return "Not saved - no database on this environment";
    case "error":
      return "Couldn't save";
    default:
      return null;
  }
}
