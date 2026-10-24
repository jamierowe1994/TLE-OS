"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMe } from "@/lib/me";

/**
 * Steve's console (app/(os)/admin/assistant): everything it reads and does,
 * shared by the old screen and the new look (components/new-look/admin/
 * SteveNew). Same APIs, same guards: the brief answers see:business, the log
 * and what he reads answer see:people, and marking built or hidden answers
 * owners only.
 */

/* A starting shape rather than an empty box. Nobody writes a good brief from a
   blank field, and the headings are the four things James asked for. */
export const BRIEF_PLACEHOLDER = `What he's here to do
e.g. Help TLE partner agents get unstuck without having to ring anyone. Most
questions will be about listings, viewings, applications, compliance and getting
paid.

How he should talk
e.g. Like a helpful colleague who has been here a while. Warm but not chatty.
Never corporate.

How he should respond
e.g. Answer the question first, then the detail. If it isn't covered, say so
plainly rather than guessing. Never invent a figure or a policy.

Language
e.g. Plain English, UK spelling. No jargon unless the agent used it first.

The process, roughly
e.g. Appraisal, then listing, then viewings, then application, then referencing,
then move-in. Propoly is where a deal lives; REX is the CRM.`;

export type Line = {
  id: string;
  userEmail: string;
  thread: string;
  role: "agent" | "assistant";
  text: string;
  path: string;
  kind: string;
  /** Files somebody sent with the question. See lib/assistant-log. */
  attachments?: { key: string; name: string; type: string; size: number }[];
  createdAt: string;
};

export type Trend = { question: string; wordings: string[]; times: number; people: number; lastAsked: string; notCovered: boolean };

export function when(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso).getTime();
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export type Gap = { at: string; who: string; asked: string; why: string; state?: "built" | "hidden"; stateBy?: string };

export function useSteveConsole() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [gaps, setGaps] = useState<{ at: string; who: string; asked: string; why: string; state?: "built" | "hidden"; stateBy?: string }[]>([]);
  const [brain, setBrain] = useState<{
    live: boolean;
    spent: number;
    cap: number;
    map?: string;
    prompt?: string;
    promptBlocks?: number;
    knowledgeCount?: number;
    knowledgeReadable?: boolean;
  } | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefBy, setBriefBy] = useState<string>("");
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefFlash, setBriefFlash] = useState<string | null>(null);
  const [who, setWho] = useState<string>("");
  const [denied, setDenied] = useState(false);
  const [gapBusy, setGapBusy] = useState<string | null>(null);
  const [gapErr, setGapErr] = useState<string | null>(null);
  const [showPut, setShowPut] = useState(false);
  /* What failed, kept apart (24 Oct 2026). The old screen folds every
     failure of the log into "Nothing here" and treats an unread brief as an
     empty one; the new look says which read failed, and will not offer to
     save a brief it never managed to read. */
  const [logFailed, setLogFailed] = useState<"denied" | "error" | null>(null);
  const [briefFailed, setBriefFailed] = useState(false);
  const [brainFailed, setBrainFailed] = useState(false);
  /* Marking built or hidden answers owners only (the API's own check), so
     the new look offers those buttons to owners only. */
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => !gone && setRole(j?.role ?? null))
      .catch(() => !gone && setRole(null));
    return () => {
      gone = true;
    };
  }, []);

  const load = useCallback(() => {
    setLogFailed(null);
    setBriefFailed(false);
    setBrainFailed(false);
    fetch("/api/admin/assistant-brief")
      .then((r) => {
        if (!r.ok) setBriefFailed(true);
        return r.ok ? r.json() : null;
      })
      .then((d: { brief?: { body: string; updatedBy: string } } | null) => {
        setBrief(d?.brief?.body ?? "");
        setBriefBy(d?.brief?.updatedBy ?? "");
      })
      .catch(() => {
        setBriefFailed(true);
        setBrief("");
      });
    fetch("/api/admin/assistant-brain")
      .then((r) => {
        if (!r.ok) setBrainFailed(true);
        return r.ok ? r.json() : null;
      })
      .then((d: {
    live: boolean;
    spent: number;
    cap: number;
    map?: string;
    prompt?: string;
    promptBlocks?: number;
    knowledgeCount?: number;
    knowledgeReadable?: boolean;
  } | null) => setBrain(d))
      .catch(() => {
        setBrainFailed(true);
        setBrain(null);
      });
    fetch("/api/admin/assistant-log")
      .then((r) => {
        if (!r.ok) setLogFailed(r.status === 403 || r.status === 404 ? "denied" : "error");
        return r.ok ? r.json() : Promise.reject(new Error("no"));
      })
      .then((d: { lines?: Line[]; trends?: Trend[]; gaps?: { at: string; who: string; asked: string; why: string; state?: "built" | "hidden"; stateBy?: string }[] }) => {
        setLines(d.lines ?? []);
        setTrends(d.trends ?? []);
        setGaps(d.gaps ?? []);
      })
      .catch(() => {
        setLogFailed((f) => f ?? "error");
        setDenied(true);
      });
  }, []);
  useEffect(load, [load]);

  /* Built / Hide / Back on the list (23 Oct 2026): the list stays the
     next-to-build list, and nothing is thrown away. */
  const markGap = async (at: string, state: "built" | "hidden" | null) => {
    setGapBusy(at);
    setGapErr(null);
    const r = await fetch("/api/admin/assistant-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at, state }),
    }).catch(() => null);
    setGapBusy(null);
    if (!r?.ok) {
      const d = (await r?.json().catch(() => null)) as { error?: string } | null;
      setGapErr(d?.error || "That didn't save. Try again.");
      return;
    }
    setGaps((gs) => gs.map((g) => (g.at === at ? { ...g, state: state ?? undefined } : g)));
  };

  /* The worklist: what agents actually asked, newest first. Read off the same
     log as the transcript below rather than a second store — one source, so
     the two can never disagree about what was said. */
  async function saveBrief() {
    setSavingBrief(true);
    setBriefFlash(null);
    try {
      const r = await fetch("/api/admin/assistant-brief", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: brief ?? "" }),
      });
      setBriefFlash(r.ok ? "Saved. He'll use this on the next question." : "Couldn't save that.");
    } catch {
      setBriefFlash("Couldn't save that.");
    } finally {
      setSavingBrief(false);
    }
  }

  /* Agents only — the assistant's own lines would swamp the picker. */
  const people = [...new Set((lines ?? []).filter((l) => l.role === "agent").map((l) => l.userEmail))].sort();
  const shown = who ? (lines ?? []).filter((l) => l.userEmail === who) : (lines ?? []);

  return { lines, trends, gaps, brain, brief, setBrief, briefBy, savingBrief, briefFlash, who, setWho, denied, gapBusy, gapErr, showPut, setShowPut, load, markGap, saveBrief, people, shown, logFailed, briefFailed, brainFailed, role };
}

export type SteveConsole = ReturnType<typeof useSteveConsole>;
