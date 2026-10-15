"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The Agent line on a home's page, and - for the owners and the office - a
 * Change that moves the home to another agent's Portfolio (Sean McMahon,
 * 15 Oct 2026). Held in the OS (/api/portfolio/agent, lib/agent-moves);
 * nothing is changed anywhere else.
 */

type Agent = { id: string; name: string };
type Move = { key: string; toName: string; setBy: string } | null;

export default function HomeAgent({
  propertyId,
  agent,
  movedFrom,
  everything,
}: {
  propertyId: string | null;
  agent: Agent | null;
  movedFrom?: string | null;
  everything: boolean;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [move, setMove] = useState<Move>(null);
  const [canChange, setCanChange] = useState(false);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [shown, setShown] = useState<Agent | null>(agent);

  useEffect(() => setShown(agent), [agent]);
  useEffect(() => {
    if (!everything || !propertyId) return;
    let live = true;
    fetch(`/api/portfolio/agent?property=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j?.ok) return;
        setCanChange(Boolean(j.canChange));
        setAgents(Array.isArray(j.agents) ? j.agents : []);
        setMove(j.move ?? null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [everything, propertyId]);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/portfolio/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId, ...body }) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) { setNote({ tone: "bad", text: j?.error ?? "That didn't save. Try again in a minute." }); return; }
      setPicking(false);
      if (j.agent) { setShown(j.agent); setMove({ key: String(propertyId), toName: j.agent.name, setBy: "you" }); }
      else { window.location.reload(); return; }
      setNote({ tone: "good", text: done });
    } catch {
      setNote({ tone: "bad", text: "That didn't save. Try again in a minute." });
    } finally {
      setBusy(false);
    }
  }

  const sub = movedFrom && shown?.name !== movedFrom ? `Moved from ${movedFrom}` : null;

  return (
    /* Picking takes the whole row, so the list of names has room. */
    <div className={`flex min-w-0 items-start gap-2.5 ${picking || note ? "col-span-2 sm:col-span-4" : ""}`}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name="user" size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Agent</span>
        <span className="block truncate text-[13px]">{shown?.name ?? "No agent"}</span>
        {sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}
        {canChange && !picking && (
          <button
            type="button"
            onClick={() => { setChoice(shown?.id ?? ""); setPicking(true); setNote(null); }}
            className="mt-0.5 text-[11.5px] font-semibold text-accent-dark underline-offset-2 hover:underline"
            data-steve-never
          >
            Change agent
          </button>
        )}
        {picking && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]" data-steve-never>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={busy}
              className="max-w-full rounded-full border border-line/60 bg-white px-2 py-1 text-[11.5px] font-semibold"
              aria-label="Choose the agent"
            >
              <option value="">Choose an agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={() => setPicking(false)} className="rounded-full px-2 py-1 text-muted hover:text-ink disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !choice || choice === shown?.id}
              onClick={() => {
                const first = (agents.find((a) => a.id === choice)?.name ?? "").split(/\s+/)[0] || "They";
                void send({ rexUserId: choice }, `Moved. ${first} will see it in their Portfolio and Maintenance now.`);
              }}
              className="rounded-full bg-[var(--brown)] px-3 py-1 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Moving…" : "Move it"}
            </button>
            {move && (
              <button type="button" disabled={busy} onClick={() => void send({ clear: true }, "")} className="rounded-full px-2 py-1 text-muted hover:text-ink disabled:opacity-50">
                Put back
              </button>
            )}
          </span>
        )}
        {note && <span className={`mt-0.5 block text-[11.5px] ${note.tone === "good" ? "text-[#56634a]" : "text-accent-dark"}`}>{note.text}</span>}
      </span>
    </div>
  );
}
