"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { searchMatches } from "@/lib/search-match";

/**
 * "Not my lead" (Dan Richards, 15 Oct 2026): pass a lead to the agent who
 * should have it, or back to the office to share out, instead of marking it
 * lost and costing the right agent the enquiry.
 *
 * Every agent with the towns their work is in (lib/lead-agents), a search
 * over both, Back to the office at the top, and an optional line saying why.
 * Owners and the office use the same sheet to reassign any lead, and to give
 * out the ones sent back to them.
 */

interface Agent {
  key: string;
  name: string;
  towns: string[];
  rexUserId: string | null;
}

export default function LeadReassign({
  leadId,
  leadName,
  currentAgent,
  onClose,
  onMoved,
}: {
  leadId: string;
  leadName: string;
  /** The name the board shows for it now, "Unassigned" when nobody has it. */
  currentAgent: string;
  onClose: () => void;
  /** After it saved. `gone`: the person who moved it can no longer see it. */
  onMoved: (r: { agent: string; gone: boolean; sentence: string }) => void;
}) {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [pool, setPool] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/leads/agents", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; agents?: Agent[]; pool?: boolean; error?: string };
        if (!live) return;
        if (!r.ok || !j.ok) { setLoadErr(j.error ?? "We couldn't read the list of agents just now."); return; }
        setAgents(j.agents ?? []);
        setPool(Boolean(j.pool));
      })
      .catch(() => live && setLoadErr("We couldn't read the list of agents just now."));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const first = (n: string) => n.trim().split(/\s+/)[0] || n;
  const nobody = !currentAgent || currentAgent === "Unassigned";
  const shown = useMemo(() => {
    const list = (agents ?? []).filter((a) => a.name !== currentAgent);
    const needle = find.trim();
    return needle ? list.filter((a) => searchMatches(needle, a.name, ...a.towns)) : list;
  }, [agents, find, currentAgent]);
  const picked = pick === "office" ? null : (agents ?? []).find((a) => a.key === pick) ?? null;

  async function save() {
    if (!pick || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/owner`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: pick, reason: reason.trim() }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; agent?: string; gone?: boolean };
      if (!r.ok || !j.ok) { setMsg(j.error ?? "That didn't save. Try again."); setBusy(false); return; }
      onMoved({
        agent: j.agent ?? "Unassigned",
        gone: Boolean(j.gone),
        sentence: picked ? `Passed to ${picked.name}` : "Back to the office",
      });
    } catch {
      setMsg("That didn't save. Check your connection and try again.");
      setBusy(false);
    }
  }

  const row = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
      active ? "border-accent-dark bg-accent-soft/60" : "border-line/70 bg-white hover:border-ink/30"
    }`;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div
        role="dialog"
        aria-label={`Pass ${leadName} on`}
        className="fade-up relative flex max-h-[calc(100dvh-10rem)] sm:max-h-[88vh] w-full max-w-lg flex-col rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]"
      >
        <div className="px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-[20px] font-normal tracking-normal">{pool ? "Reassign" : "Not My Lead"}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {nobody
              ? `${first(leadName)} is with the office. Pick the agent who should have them.`
              : `${first(leadName)} is with ${currentAgent}. Pass them to the agent who should have them, or back to the office to share out.`}
          </p>
          <label className="mt-4 flex items-center gap-2 rounded-full border border-line/80 bg-white px-3.5 py-2">
            <DoodleIcon name="search" size={13} className="text-muted" />
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find an agent or a town"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
              autoFocus
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-3 sm:px-6">
          {!nobody && !find.trim() && (
            <button type="button" onClick={() => setPick("office")} aria-pressed={pick === "office"} className={row(pick === "office")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <DoodleIcon name="pack/building" size={15} className="text-accent-dark" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Back to the office</span>
                <span className="block text-[11.5px] leading-snug text-muted">
                  Nobody&apos;s until the office gives it to the right agent. They see it under Not assigned.
                </span>
              </span>
            </button>
          )}
          {loadErr ? (
            <p className="rounded-2xl border border-line/70 bg-white px-4 py-3 text-[12.5px] text-accent-dark">{loadErr}</p>
          ) : agents === null ? (
            <p className="flex items-center gap-2 px-1 py-3 text-[12.5px] text-muted">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden />
              Reading the list of agents…
            </p>
          ) : shown.length === 0 ? (
            <p className="px-1 py-3 text-[12.5px] text-muted">Nobody matches &quot;{find.trim()}&quot;.</p>
          ) : (
            shown.map((a) => (
              <button key={a.key} type="button" onClick={() => setPick(a.key)} aria-pressed={pick === a.key} className={row(pick === a.key)}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage/40 text-[12px] font-semibold">
                  {a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                  <span className="flex items-center gap-1 truncate text-[11.5px] text-muted">
                    <DoodleIcon name="pack/house" size={10} />
                    {a.towns.length ? a.towns.join(", ") : "No homes on the market in the last six months"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-line/60 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
          <label className="block text-[11px] font-semibold text-muted" htmlFor="reassign-why">
            Why <span className="font-normal">(optional, goes on their activity)</span>
          </label>
          <input
            id="reassign-why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Wrong area - this home is in Birmingham"
            className="mt-1 w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40"
          />
          {msg && <p className="mt-2 text-[12.5px] font-semibold text-accent-dark">{msg}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-50">
              Keep it
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!pick || busy}
              className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50"
            >
              {busy ? "Passing on…" : pick === "office" ? "Send to the office" : picked ? `Pass to ${first(picked.name)}` : "Pick somebody"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
