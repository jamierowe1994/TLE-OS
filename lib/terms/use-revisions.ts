"use client";

import { useEffect, useState } from "react";
import { registerRevisions } from "@/lib/terms/catalogue";
import type { TermsDoc } from "@/lib/terms/types";

/**
 * The send screen's half of the saved versions (lib/terms/revisions): asks
 * which wording goes out now, registers it with lib/terms/catalogue, and
 * returns a number that changes when it has, so the screen draws the paper
 * again. `version`: a contract in hand that was sent on a saved version.
 *
 * `ready` is false until the answer is in: the paper an agent reads must be
 * the wording that will be sent, so the screen waits rather than showing the
 * older words for a moment.
 */
export function useRevisedEditions(version?: string | null): { ready: boolean; tick: number } {
  const [state, setState] = useState({ ready: false, tick: 0 });
  useEffect(() => {
    let gone = false;
    const u = version && version.includes("~r") ? `?version=${encodeURIComponent(version)}` : "";
    fetch(`/api/terms/editions${u}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { docs?: TermsDoc[]; latest?: Record<string, string> } | null) => {
        if (gone) return;
        if (j?.docs) registerRevisions(j.docs, j.latest ?? {});
        setState((s) => ({ ready: true, tick: s.tick + 1 }));
      })
      .catch(() => !gone && setState((s) => ({ ready: true, tick: s.tick + 1 })));
    return () => {
      gone = true;
    };
  }, [version]);
  return state;
}
