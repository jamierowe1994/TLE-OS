"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import ConfirmSheet from "@/components/ConfirmSheet";
import type { CustomerUpdate } from "@/lib/customer-updates";

/**
 * Customer updates: who should hear what, and the agent's three choices
 * (James, 2 Oct 2026). Nothing reaches a landlord or tenant from the system;
 * each person on an update is emailed by the agent (read and changed first,
 * in the review sheet), rung and noted, or marked not needed.
 *
 * Used on an application (its own updates) and on /updates (the agent's list,
 * or everyone's for the office).
 */

type Props = {
  applicationId?: string | null;
  dealId?: string | null;
  /** The list page: "mine" for an agent, "all" for the office. */
  scope?: "mine" | "all";
  openOnly?: boolean;
  /** Scrolled to and ringed, from an email's button. */
  highlight?: number | null;
  /** Show the address on each card (the list page). */
  showProperty?: boolean;
  /** Draw nothing at all when there is nothing to tell. */
  hideWhenEmpty?: boolean;
  onCount?: (open: number) => void;
};

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

const DONE_WORDS = { emailed: "Emailed", called: "Rang", skipped: "Not needed" } as const;

export default function CustomerUpdates({ applicationId, dealId, scope, openOnly, highlight, showProperty, hideWhenEmpty, onCount }: Props) {
  const [list, setList] = useState<CustomerUpdate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ id: number; index: number; name: string } | null>(null);
  const [form, setForm] = useState<{ id: number; index: number; action: "call" | "skip"; note: string; busy: boolean; msg: string | null } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const ringed = useRef<HTMLLIElement | null>(null);

  const query = (() => {
    const p = new URLSearchParams();
    if (applicationId) p.set("application", applicationId);
    if (dealId) p.set("deal", dealId);
    if (scope === "mine") p.set("mine", "1");
    if (scope === "all") p.set("all", "1");
    if (openOnly) p.set("open", "1");
    return p.toString();
  })();

  const load = useCallback(() => {
    if (!query) return;
    fetch(`/api/customer-updates?${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; updates?: CustomerUpdate[]; error?: string }) => {
        if (!j.ok) throw new Error(j.error || "Couldn't load the updates.");
        setList(j.updates ?? []);
        onCount?.((j.updates ?? []).filter((u) => u.state === "open").length);
      })
      .catch((e: Error) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(load, [load]);

  useEffect(() => {
    if (highlight && list && ringed.current) ringed.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, list]);

  async function settle() {
    if (!form) return;
    setForm({ ...form, busy: true, msg: null });
    try {
      const r = await fetch("/api/customer-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: form.id, index: form.index, action: form.action, note: form.note }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string; rex?: string | null };
      if (!j.ok) throw new Error(j.error || "That didn't save.");
      setFlash(form.action === "call" ? `Call noted.${j.rex ? ` ${j.rex}` : ""}` : "Marked not needed.");
      setForm(null);
      load();
    } catch (e) {
      setForm((f) => (f ? { ...f, busy: false, msg: (e as Error).message } : f));
    }
  }

  if (!query) return null;
  if (list === null && !err) {
    if (hideWhenEmpty) return null;
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-muted">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" /> Loading the updates…
      </p>
    );
  }
  if (err) return hideWhenEmpty ? null : <p className="text-[12.5px] text-accent-dark">{err}</p>;
  if (!list?.length) {
    if (hideWhenEmpty) return null;
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-center">
        <p className="text-[13.5px] font-semibold">Nobody waiting to hear from you</p>
        <p className="mt-1 text-[12px] text-muted">When something happens on a let that a landlord or tenant should know, it lands here.</p>
      </div>
    );
  }

  return (
    <>
      {flash && <p className="mb-3 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[12px]">{flash}</p>}
      <ul className="space-y-3">
        {list.map((u) => {
          const open = u.state === "open";
          return (
            <li
              key={u.id}
              ref={u.id === highlight ? ringed : undefined}
              className={`rounded-2xl border bg-white p-4 ${u.id === highlight ? "border-accent-dark ring-2 ring-accent-dark/25" : "border-line/50"} ${open ? "" : "opacity-75"}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[14px] font-semibold">{u.headline}</p>
                <span className="text-[11.5px] text-muted">{when(u.createdAt)}{u.agentName ? ` · ${u.agentName}` : ""}</span>
                {!open && <span className="ml-auto rounded-full bg-panel px-2.5 py-0.5 text-[11px] font-semibold text-muted">Done</span>}
                {open && u.escalatedAt && <span className="ml-auto rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark">With Kirstie</span>}
              </div>
              {showProperty && <p className="mt-0.5 text-[12.5px] text-muted">{u.property}</p>}
              {u.why && <p className="mt-1.5 text-[12px] leading-relaxed text-amber-800">{u.why}</p>}

              <ul className="mt-3 divide-y divide-line/60 border-t border-line/60">
                {u.recipients.map((r, i) => {
                  const editing = form && form.id === u.id && form.index === i ? form : null;
                  return (
                    <li key={i} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="min-w-0 flex-1 basis-full sm:basis-0">
                          <span className="block text-[13px] font-semibold">
                            {r.name} <span className="font-normal text-muted">· {r.role === "tenant" ? "Tenant" : "Landlord"}</span>
                          </span>
                          <span className="block truncate text-[11.5px] text-muted">{r.email ?? "No email on file"}</span>
                        </span>
                        {r.state === "open" ? (
                          !editing && (
                            <span className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSheet({ id: u.id, index: i, name: r.name })}
                                disabled={!r.email}
                                title={r.email ? undefined : "No email on file: ring them instead"}
                                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brown)] px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                              >
                                <DoodleIcon name="mail" size={12} /> Email them
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm({ id: u.id, index: i, action: "call", note: "", busy: false, msg: null })}
                                className="inline-flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40"
                              >
                                <DoodleIcon name="call" size={12} /> I&apos;ll call
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm({ id: u.id, index: i, action: "skip", note: "", busy: false, msg: null })}
                                className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
                              >
                                Not needed
                              </button>
                            </span>
                          )
                        ) : (
                          <span className="text-right text-[11.5px] text-muted">
                            <span className="font-semibold text-ink">{DONE_WORDS[r.state as keyof typeof DONE_WORDS]}</span>
                            {r.doneBy ? ` by ${r.doneBy.split(" ")[0]}` : ""}
                            {r.doneAt ? ` · ${when(r.doneAt)}` : ""}
                            {r.note && r.state !== "emailed" ? <span className="block max-w-[340px] truncate">{r.note}</span> : null}
                          </span>
                        )}
                      </div>
                      {editing && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <input
                            autoFocus
                            value={editing.note}
                            onChange={(e) => setForm({ ...editing, note: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && void settle()}
                            placeholder={editing.action === "call" ? `What was said? e.g. "Spoke to ${r.name.split(" ")[0]}, guarantor coming Monday"` : "Why not? e.g. Told them at the viewing"}
                            className="min-w-0 flex-1 basis-full rounded-xl border border-line/80 bg-card px-3 py-2 text-[12.5px] outline-none focus:border-ink sm:basis-0"
                          />
                          <button type="button" onClick={() => void settle()} disabled={editing.busy || !editing.note.trim()} className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-40">
                            {editing.busy ? "Saving…" : editing.action === "call" ? "Save the call" : "Save"}
                          </button>
                          <button type="button" onClick={() => setForm(null)} disabled={editing.busy} className="px-2 text-[12px] font-semibold text-muted hover:text-ink">
                            Cancel
                          </button>
                          {editing.msg && <p className="basis-full text-[11.5px] text-accent-dark">{editing.msg}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {sheet && (
        <ConfirmSheet
          target={{ kind: "update", id: sheet.id, index: sheet.index }}
          title={`Email ${sheet.name}`}
          onClose={() => setSheet(null)}
          onSent={(detail) => {
            setFlash(detail);
            load();
          }}
        />
      )}
    </>
  );
}
