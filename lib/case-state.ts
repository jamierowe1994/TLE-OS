"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CaseKind = "appraisal" | "tenancy-link";

export type CaseStatus = "loading" | "ready" | "saving" | "saved" | "offline" | "error";

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

  useEffect(() => {
    if (!recordId) return;
    let gone = false;
    loadedFor.current = null;
    setStatus("loading");
    setValue(fallback);
    fetch(`/api/case-state?kind=${kind}&id=${encodeURIComponent(recordId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (j.payload != null) setValue(j.payload as T);
        loadedFor.current = recordId;
        setStatus(j.stored === false ? "offline" : "ready");
      })
      .catch(() => {
        if (gone) return;
        loadedFor.current = recordId;
        setStatus("offline");
      });
    return () => {
      gone = true;
    };
    // `fallback` is deliberately not a dependency: callers pass a literal, and
    // depending on it would reload the record on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, recordId]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      const id = recordId;
      // Nothing has been loaded for this id yet — a save now would be writing
      // the fallback over whatever is still on its way back.
      if (!id || loadedFor.current !== id) return;
      if (timer.current) clearTimeout(timer.current);
      setStatus("saving");
      timer.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/case-state", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind, id, payload: next }),
          });
          const j = await res.json();
          setStatus(j.saved ? "saved" : "offline");
        } catch {
          setStatus("error");
        }
      }, 600);
    },
    [kind, recordId]
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

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
      return "Not saved — no database on this environment";
    case "error":
      return "Couldn't save";
    default:
      return null;
  }
}
