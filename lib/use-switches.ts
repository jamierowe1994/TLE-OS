"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The send and write switches (lib/switches), read and moved through
 * /api/admin/switches. One hook for Admin > Switches in both looks and for the
 * Phone alerts tab, which owns the Phone alerts master switch in the new look
 * (24 Oct 2026) - so every place that arms a switch arms it the same way, with
 * the typed phrase checked on the server.
 */

export type SwitchRow = {
  key: string;
  label: string;
  what: string;
  who: string;
  confirm: string;
  legacyEnv: string;
  on: boolean;
  fromEnv: boolean;
  changedBy: string | null;
  changedAt: string | null;
};

export function useSwitches() {
  const [rows, setRows] = useState<SwitchRow[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [denied, setDenied] = useState(false);
  const [arming, setArming] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/switches")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: { switches: SwitchRow[]; locked: boolean }) => {
        setRows(d.switches);
        setLocked(d.locked);
      })
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  const change = useCallback(
    async (key: string, on: boolean, phrase: string) => {
      setBusy(true);
      setFlash(null);
      try {
        const r = await fetch("/api/admin/switches", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, on, typed: phrase }),
        });
        const j = (await r.json()) as { ok?: boolean; error?: string };
        if (j.ok) {
          setFlash(on ? "Armed." : "Turned off.");
          setArming(null);
          setTyped("");
          load();
        } else {
          setFlash(j.error ?? "That didn't work.");
        }
      } catch {
        setFlash("That didn't work.");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return { rows, locked, denied, arming, setArming, typed, setTyped, busy, flash, setFlash, change, load };
}
