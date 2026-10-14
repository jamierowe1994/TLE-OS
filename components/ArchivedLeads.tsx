"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import ListSearch from "@/components/ListSearch";
import { searchMatches } from "@/lib/search-match";
import type { ArchivedLead } from "@/lib/hidden-leads";

/**
 * Leads > Archived (James Crumpton, 14 Oct 2026): every applicant archived
 * off the board, newest first, each with Reactivate. Reactivating puts them
 * straight back on the board ("lead-restored" tells the page), and REX was
 * never touched either way.
 */

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ArchivedLeads({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [leads, setLeads] = useState<ArchivedLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; text: string } | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    let gone = false;
    setLeads(null);
    setError(null);
    setRowMsg(null);
    fetch("/api/leads/archived", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; leads?: ArchivedLead[]; error?: string }) => {
        if (gone) return;
        if (j?.ok && Array.isArray(j.leads)) setLeads(j.leads);
        else setError(j?.error ?? "The archive didn't load. Try again in a minute.");
      })
      .catch(() => { if (!gone) setError("The archive didn't load. Try again in a minute."); });
    return () => { gone = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const shown = useMemo(
    () => (leads ?? []).filter((l) => !q.trim() || searchMatches(q, l.name, l.about, l.agent)),
    [leads, q]
  );

  async function reactivate(l: ArchivedLead) {
    if (busy) return;
    setBusy(l.id);
    setRowMsg(null);
    try {
      const j = await fetch(`/api/leads/${encodeURIComponent(l.id)}/hide`, { method: "DELETE" }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "That did not save.");
      setLeads((cur) => (cur ?? []).filter((x) => x.id !== l.id));
      window.dispatchEvent(new CustomEvent("lead-restored", { detail: l.id }));
    } catch (e) {
      setRowMsg({ id: l.id, text: e instanceof Error ? e.message : "That did not save." });
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px]">Archived Leads</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Off the board, kept here. Reactivate puts them straight back on your leads.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {leads && leads.length > 6 && <ListSearch value={q} onChange={setQ} placeholder="Name, address or agent…" />}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {error ? (
            <p className="rounded-2xl border border-line/50 bg-white px-4 py-3 text-[12.5px] font-semibold text-accent-dark" role="alert">{error}</p>
          ) : leads === null ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-line/50 bg-white px-4 py-4 text-[12.5px] text-muted" role="status">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
              Fetching the archive…
            </div>
          ) : leads.length === 0 ? (
            <p className="rounded-2xl border border-line/50 bg-white px-4 py-6 text-center text-[12.5px] text-muted">
              Nothing archived. Archive sits at the top of any lead.
            </p>
          ) : shown.length === 0 ? (
            <p className="rounded-2xl border border-line/50 bg-white px-4 py-6 text-center text-[12.5px] text-muted">Nobody archived matches that.</p>
          ) : (
            <ul className="divide-y divide-line/60 rounded-2xl border border-line/50 bg-white">
              {shown.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink">
                      <span className="truncate">{l.name}</span>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">
                        {l.side === "landlord" ? "Landlord" : "Tenant"}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted">
                      {[l.about, l.agent].filter(Boolean).join(" - ") || "No address on the lead"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Enquired {day(l.receivedAt)} · Archived {day(l.archivedAt)}{l.archivedBy ? ` by ${l.archivedBy}` : ""}
                    </p>
                    {rowMsg?.id === l.id && <p className="mt-1 text-[11.5px] font-semibold text-accent-dark">{rowMsg.text}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void reactivate(l)}
                    disabled={busy !== null}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent-dark/60 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-accent-dark transition-colors hover:bg-accent-dark hover:text-white disabled:opacity-50"
                  >
                    {busy === l.id ? "Reactivating…" : "Reactivate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
