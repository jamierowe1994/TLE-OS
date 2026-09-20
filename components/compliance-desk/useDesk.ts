"use client";

import { useCallback, useEffect, useState } from "react";
import type { CheckKind, VerifyItem, WorksCheckItem } from "@/lib/compliance-desk";

/**
 * Michael's desk, read once and shared by its three screens.
 *
 * One fetch, because the dashboard, To verify and Works orders all draw from
 * the same two lists and must never disagree about how long they are. `check`
 * saves his answer and takes the fresh lists back from the same response.
 */
export interface Desk {
  ok: boolean;
  stored: boolean;
  reason?: string;
  firstName?: string;
  verify: VerifyItem[];
  works: WorksCheckItem[];
  agents: { total: number; short: number; requirements: number; names: { userId: string; name: string; short: number }[] } | null;
}

export function useDesk() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/compliance-desk", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Desk & { error?: string }) => {
        if (j.ok === false) setError(j.error ?? "Could not read the desk.");
        else { setDesk(j); setError(null); }
      })
      .catch(() => setError("Could not read the desk."));
  }, []);
  useEffect(load, [load]);

  const check = useCallback(async (kind: CheckKind, id: string, state: "verified" | "queried", note?: string) => {
    setBusy(id);
    try {
      const r = await fetch("/api/compliance-desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, state, note }) });
      const j = (await r.json()) as { ok: boolean; error?: string; verify?: VerifyItem[]; works?: WorksCheckItem[] };
      if (!j.ok) setError(j.error ?? "That did not save.");
      else { setError(null); setDesk((d) => (d ? { ...d, verify: j.verify ?? d.verify, works: j.works ?? d.works } : d)); }
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(null);
    }
  }, []);

  return { desk, error, busy, check, reload: load };
}
