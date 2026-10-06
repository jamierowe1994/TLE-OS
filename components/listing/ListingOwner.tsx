"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Whose listing this is, and a way to move it - for James and Susan only
 * (6 Oct 2026). Moving it changes the agent and the owner in REX as well, so
 * the new agent sees it on their board and the old one stops seeing it.
 * Everyone else gets nothing here: the route says who may change it.
 */
type Person = { id: string; name: string | null };

export default function ListingOwner({ listingId }: { listingId: string | number }) {
  const [agent, setAgent] = useState<Person | null>(null);
  const [agents, setAgents] = useState<Person[]>([]);
  const [canChange, setCanChange] = useState(false);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    setCanChange(false);
    setPicking(false);
    setNote(null);
    if (Number(listingId) < 0) return;
    fetch(`/api/listings/owner?id=${encodeURIComponent(String(listingId))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j?.ok) return;
        setAgent(j.agent ?? null);
        setAgents(j.agents ?? []);
        setCanChange(Boolean(j.canChange));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [listingId]);

  if (!canChange) return null;

  async function save() {
    if (!choice || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/listings/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listingId, rexUserId: choice }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setNote({ tone: "bad", text: j.error ?? "That did not save. Try again in a minute." });
      } else {
        setAgent(j.agent ?? null);
        setPicking(false);
        const first = (j.agent?.name ?? "").split(/\s+/)[0] || "They";
        setNote({ tone: "good", text: `Moved. ${first} will see it on their board within a minute.` });
      }
    } catch {
      setNote({ tone: "bad", text: "That did not save. Try again in a minute." });
    } finally {
      setBusy(false);
    }
  }

  if (picking) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line/60 bg-white py-1 pl-3 pr-1 text-[11px]" data-steve-never>
        <span className="text-muted">Move to</span>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={busy}
          className="rounded-full border border-line/60 bg-white px-2 py-0.5 text-[11px] font-semibold"
          aria-label="Choose the agent"
        >
          <option value="">Choose an agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => setPicking(false)} className="rounded-full px-2 py-0.5 text-muted hover:text-ink disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !choice || choice === agent?.id}
          onClick={save}
          className="rounded-full bg-[var(--brown)] px-3 py-0.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Moving…" : "Move it"}
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setChoice(agent?.id ?? "");
          setPicking(true);
          setNote(null);
        }}
        title="Change whose listing this is"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          agent ? "bg-white text-ink hover:text-accent-dark" : "border border-accent-dark/50 bg-white text-accent-dark hover:border-accent-dark"
        }`}
      >
        <DoodleIcon name="user" size={11} />
        {agent ? `Agent: ${agent.name}` : "No agent - pick one"}
        <span className="text-muted">· Change</span>
      </button>
      {note && <span className={`text-[11.5px] ${note.tone === "good" ? "text-[#56634a]" : "text-accent-dark"}`}>{note.text}</span>}
    </>
  );
}
