"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";

/**
 * Contacts added in the OS, and whether REX has them.
 *
 * ── Why this strip exists at all ──────────────────────────────────────────
 *
 * The Leads table below is REX's book. A contact saved here while the REX
 * write lock is on is in neither that table nor REX, and without somewhere to
 * show it, it would be invisible from the moment the panel closed — which is
 * only marginally better than the Save button that saved nothing.
 *
 * So anything not yet in REX is listed here with the reason, and a button to
 * push it when the lock comes off. "Held" is a queue, not an error, and this
 * is the queue.
 *
 * It hides itself entirely when there is nothing held, because a permanent
 * empty box on the busiest screen in the product is just noise.
 */

type Contact = {
  id: string;
  name: string;
  kind: string;
  email: string;
  mobile: string;
  createdAt: string;
  rexId: string | null;
  rexState: "held" | "sent" | "failed" | "linked";
  rexDetail: string;
};

export default function AddedHere({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [blocked, setBlocked] = useState<{ detail: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/contacts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j: { contacts: Contact[]; rexBlocked: { detail: string } | null }) => {
        /* Only the ones REX does NOT have. A contact that made it through is
           in the book below and does not need saying twice. */
        setRows(j.contacts.filter((c) => c.rexState !== "sent" && c.rexState !== "linked"));
        setBlocked(j.rexBlocked);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load, refreshKey]);

  async function push(id: string) {
    setBusyId(id);
    setFlash(null);
    try {
      const r = await fetch(`/api/contacts/${id}/push`, { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; detail?: string };
      setFlash(j.detail ?? (j.ok ? "Pushed." : "That didn't go."));
      load();
    } catch {
      setFlash("That didn't go — the connection dropped.");
    } finally {
      setBusyId(null);
    }
  }

  if (!rows || rows.length === 0) return null;

  return (
    <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name="user" size={16} className="text-accent-dark" />
          Added here, not yet in REX
        </h3>
        <span className="text-[11.5px] text-muted">
          {rows.length} waiting
        </span>
      </div>

      {blocked && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{blocked.detail}</p>
      )}
      {flash && (
        <p className="mt-2.5 rounded-xl border border-line/80 bg-card p-2.5 text-[11.5px] leading-relaxed">
          {flash}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {rows.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line/70 bg-card px-3.5 py-2.5"
          >
            <span className="text-[12.5px] font-medium">{c.name}</span>
            <span className="text-[11.5px] text-muted">
              {[c.kind, c.email || c.mobile].filter(Boolean).join(" · ")}
            </span>
            <Pill tone={c.rexState === "failed" ? "accent" : "neutral"}>
              {c.rexState === "failed" ? "refused" : "held"}
            </Pill>
            <button
              type="button"
              disabled={busyId === c.id || Boolean(blocked)}
              onClick={() => push(c.id)}
              title={blocked?.detail ?? "Create this contact in REX"}
              className="ml-auto rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink disabled:opacity-40"
            >
              {busyId === c.id ? "Pushing…" : "Push to REX"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
