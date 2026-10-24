"use client";

import { useCallback, useEffect, useState } from "react";
import type { PropolyMail } from "@/components/MoveInPack";

/**
 * Propoly, from the OS's side (app/(os)/admin/propoly): what the page reads
 * and every action it takes, shared by the old screen and the new look
 * (components/new-look/admin/PropolyNew) so the two can never act
 * differently. Same API, same guards: /api/admin/propoly-mail answers owners
 * and the office, and only owners may change anything but a match.
 */

export type Box = { email: string; readTo: string | null; lastRunAt: string | null; found: number; note: string | null; kept: number };
export type Settings = { senders: string[]; moveInWords: string; alwaysWatch: string[]; fileOnHomes: boolean; updatedBy?: string; updatedAt?: string };
export type Gap = { name: string; email: string; role: string; why: string; alwaysWatch: boolean };
export type DocPlan = { kind: string; label: string; slot: string; found: { where: string; name: string; expiry: string; expired: boolean } | null; note: string; outcome?: string };
export type Plan = { dealId: string; address: string; status: string; moveIn: string | null; propertyIds: string[]; rexNote: string | null; docs: DocPlan[] };
export type Push = { id: string; dealId: string; address: string; by: string; at: string; results: DocPlan[] };
export type Sender = { address: string; name: string; count: number; mailboxes: number; subjects: string[] };
export type Answer = {
  ok: boolean; error?: string; owner: boolean; goLive: string; backfillFrom: string; settings: Settings; recent: PropolyMail[]; unfiled: PropolyMail[]; boxes: Box[];
  gaps: Gap[]; total: number; onlyOneBox: number; pushes: Push[];
};

export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
export const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
export const OUTCOME: Record<string, string> = { uploaded: "Uploaded", already: "Already there", failed: "Failed", skipped: "Not sent" };

async function post(body: Record<string, unknown>) {
  return fetch("/api/admin/propoly-mail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "That didn't work just now. Try again in a minute." }));
}

export function usePropolyAdmin() {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [senders, setSenders] = useState("");
  const [words, setWords] = useState("");
  const [watch, setWatch] = useState<string | null>(null);
  const [found, setFound] = useState<Sender[] | null>(null);
  const [open, setOpen] = useState<PropolyMail | null>(null);
  const [fileDeal, setFileDeal] = useState<Record<string, string>>({});
  const [deal, setDeal] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [kinds, setKinds] = useState<string[]>(["gas", "eicr", "epc"]);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    const j = (await fetch("/api/admin/propoly-mail", { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as Answer | null;
    if (!j?.ok) { setError(j?.error ?? "Couldn't read this just now."); return; }
    setData(j);
    setSenders((s) => s || j.settings.senders.join(", "));
    setWords((w) => w || j.settings.moveInWords);
    setWatch((w) => w ?? j.settings.alwaysWatch.join(", "));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, body: Record<string, unknown>, done: (j: Record<string, unknown>) => string | void) => {
    setBusy(key); setSaid(null); setError(null);
    const j = await post(body);
    setBusy(null);
    if (!j?.ok) { setError(j?.error ?? "That didn't work."); return; }
    const msg = done(j);
    if (msg) setSaid(msg);
  };

  return {
    data, error, busy, said, senders, setSenders, words, setWords, watch, setWatch, found, setFound, open, setOpen,
    fileDeal, setFileDeal, deal, setDeal, plan, setPlan, kinds, setKinds, confirming, setConfirming, load, act,
  };
}

export type PropolyAdmin = ReturnType<typeof usePropolyAdmin>;
