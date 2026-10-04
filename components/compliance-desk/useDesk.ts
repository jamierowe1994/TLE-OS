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
  registerAccuracy?: { checked: number; matched: number } | null;
  agents: { total: number; short: number; requirements: number; names: { userId: string; name: string; short: number }[] } | null;
}

export function useDesk() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* What happened after his last answer, in one sentence: "Emailed Sam Lewis",
     "Gas safety sent to landlord, tenant". Kept until the next one. */
  const [said, setSaid] = useState<string | null>(null);

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

  const check = useCallback(async (
    kind: CheckKind,
    id: string,
    state: "verified" | "queried",
    note?: string,
    registerNumber?: string,
    fileAs?: { type: string; expiry: string; issue?: string } | null
  ): Promise<boolean> => {
    setBusy(id);
    try {
      const r = await fetch("/api/compliance-desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, state, note, registerNumber, fileAs }) });
      const j = (await r.json()) as { ok: boolean; error?: string; said?: string; verify?: VerifyItem[]; works?: WorksCheckItem[] };
      if (!j.ok) { setError(j.error ?? "That did not save."); return false; }
      setError(null);
      setSaid(j.said || null);
      setDesk((d) => (d ? { ...d, verify: j.verify ?? d.verify, works: j.works ?? d.works } : d));
      return true;
    } catch {
      setError("That did not save.");
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  /** Read the engineer off a certificate (lib/cert-register) and lay it on the row. */
  const readRegister = useCallback(async (kind: "certificate" | "landlord_document", id: string, again = false) => {
    const j = await fetch("/api/compliance-desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read", kind, id, again }) })
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.ok) return;
    setDesk((d) =>
      d
        ? {
            ...d,
            verify: d.verify.map((v) =>
              v.kind === kind && v.id === id
                ? { ...v, register: { read: j.read, registerName: j.registerName ?? v.register?.registerName ?? null, registerUrl: j.registerUrl ?? v.register?.registerUrl ?? null } }
                : v
            ),
          }
        : d
    );
  }, []);

  return { desk, error, busy, said, check, readRegister, reload: load };
}
