"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import {
  KIND_LABEL,
  STATE_WORDS,
  type ComplianceItem,
  type Requirement,
  type RequirementKind,
} from "@/lib/agent-compliance-types";

/**
 * Agent compliance - Michael's screen (item 11).
 *
 * Two things, one page. THE LIST: what a partner agent has to hold, which is
 * his to define - every row is editable, the starter rows say so, and a row
 * he retires stops being asked of anyone without losing what was recorded.
 * THE GRID: every person against every requirement, where they stand, and
 * his "seen it" against each. Only his tick reads as checked.
 *
 * The reminders that go from this are behind the Agent compliance reminders
 * switch on Admin, and the dry run at the bottom says who they would go to.
 */

interface AgentRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  items: ComplianceItem[];
  short: number;
}

const CELL: Record<ComplianceItem["state"], { mark: string; cls: string }> = {
  missing: { mark: "–", cls: "text-muted" },
  expired: { mark: "✕", cls: "font-bold text-red-700" },
  due: { mark: "!", cls: "font-bold text-amber-600" },
  held: { mark: "•", cls: "text-ink" },
  verified: { mark: "✓", cls: "font-bold text-emerald-700" },
};

const FIELD = "w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink";

type Draft = Partial<Requirement> & { title: string };

export default function AgentCompliancePage() {
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [dry, setDry] = useState<{ armed: boolean; planned: { name: string; email: string; lines: string[] }[] } | null>(null);
  const [onlyAgents, setOnlyAgents] = useState(true);
  const [showRetired, setShowRetired] = useState(false);

  const load = useCallback(() => {
    fetch("/api/agent-compliance/overview", { cache: "no-store" })
      .then((r) => (r.status === 403 ? Promise.reject(new Error("denied")) : r.json()))
      .then((j: { agents?: AgentRow[] }) => setAgents(j.agents ?? []))
      .catch((e: Error) => e.message === "denied" && setDenied(true));
    fetch("/api/agent-compliance/requirements", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { requirements?: Requirement[] } | null) => setRequirements(j?.requirements ?? []))
      .catch(() => setRequirements([]));
    fetch("/api/agent-compliance/remind", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setDry({ armed: Boolean(j.armed), planned: j.planned ?? [] }))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const active = useMemo(() => (requirements ?? []).filter((r) => r.active), [requirements]);
  const retired = useMemo(() => (requirements ?? []).filter((r) => !r.active), [requirements]);
  const starter = active.filter((r) => r.updatedBy === "starter").length;
  const people = agents.filter((a) => !onlyAgents || a.role === "agent");

  async function saveRequirement() {
    if (!editing?.title.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/agent-compliance/requirements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing),
      });
      const j = (await r.json()) as { ok?: boolean; requirements?: Requirement[] };
      if (j.ok) {
        setRequirements(j.requirements ?? []);
        setEditing(null);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function retire(r: Requirement) {
    if (!window.confirm(`Stop asking agents for "${r.title}"? What they recorded stays.`)) return;
    const res = await fetch(`/api/agent-compliance/requirements?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    const j = (await res.json()) as { requirements?: Requirement[] };
    setRequirements(j.requirements ?? []);
    load();
  }

  async function seen(a: AgentRow, i: ComplianceItem, yes: boolean) {
    const r = await fetch("/api/agent-compliance/overview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: a.userId, requirementId: i.requirement.id, seen: yes }),
    });
    const j = (await r.json()) as { agents?: AgentRow[] };
    if (j.agents) setAgents(j.agents);
  }

  if (denied) {
    return (
      <>
        <PageHeader title="Agent compliance" blurb="This screen belongs to whoever holds compliance." search={false} />
        <p className="mt-8 text-[13px] text-muted">Ask James if you should have it.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Agent compliance"
        blurb="What every partner agent has to hold personally, and where each of them stands. The list is yours to write; only your tick counts as checked."
        search={false}
        actions={
          <PressButton
            onClick={() => setEditing({ title: "", what: "", kind: "document", howLink: "", renewsMonths: null, required: true, position: (active.length + 1) })}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page"
          >
            <span className="text-[15px] leading-none">+</span> Add a requirement
          </PressButton>
        }
      />

      {starter > 0 && (
        <p className="fade-up mt-6 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px] leading-relaxed">
          <span className="font-semibold">A starter list, not your list.</span> {starter} of these were written by the OS
          as a best guess so there is something to edit. Change, retire or replace each one; a row stops saying
          &ldquo;starter&rdquo; the moment you touch it.
        </p>
      )}

      {/* ── the list ── */}
      <section className="fade-up mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">What an agent has to hold</p>
          {retired.length > 0 && (
            <button type="button" onClick={() => setShowRetired((v) => !v)} className="text-[11px] text-muted hover:text-ink">
              {showRetired ? "Hide" : "Show"} {retired.length} retired
            </button>
          )}
        </div>
        <ul className="mt-2.5 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {[...active, ...(showRetired ? retired : [])].map((r) => (
            <li key={r.id} className={`rounded-2xl border border-line/80 bg-panel p-4 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">
                    {r.title}
                    {!r.required && <span className="ml-1.5 text-[10px] font-normal text-muted">optional</span>}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{r.what}</p>
                </div>
                {r.updatedBy === "starter" ? <Pill tone="accent">Starter</Pill> : !r.active ? <Pill tone="neutral">Retired</Pill> : null}
              </div>
              <p className="mt-2 text-[10.5px] text-muted">
                {KIND_LABEL[r.kind]} · {r.renewsMonths ? `every ${r.renewsMonths} months` : "once"}
                {r.howLink ? " · has a link" : ""}
                {r.updatedBy !== "starter" ? ` · ${r.updatedBy}` : ""}
              </p>
              <div className="mt-2 flex gap-3 text-[11px]">
                <button type="button" onClick={() => setEditing({ ...r })} className="font-semibold text-muted hover:text-ink">
                  Edit
                </button>
                {r.active && (
                  <button type="button" onClick={() => void retire(r)} className="text-muted hover:text-ink">
                    Retire
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── the grid ── */}
      <section className="fade-up mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Where everyone stands</p>
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={onlyAgents} onChange={(e) => setOnlyAgents(e.target.checked)} />
            agents only
          </label>
        </div>
        <div className="mt-2.5 overflow-x-auto rounded-2xl border border-line/70 bg-panel">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-line/70 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Person</th>
                {active.map((r) => (
                  <th key={r.id} className="px-2 py-3 text-center" title={r.what}>
                    <span className="block max-w-[96px] truncate">{r.title}</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Short</th>
              </tr>
            </thead>
            <tbody>
              {!people.length && (
                <tr>
                  <td colSpan={active.length + 2} className="px-4 py-6 text-center text-[12px] text-muted">
                    Nobody to show{onlyAgents ? " with the agent role yet" : ""}.
                  </td>
                </tr>
              )}
              {people.map((a) => (
                <tr key={a.userId} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3">
                    <span className="block text-[12.5px] font-semibold">{a.name || a.email}</span>
                    <span className="block text-[10px] text-muted">{a.role}</span>
                  </td>
                  {a.items.map((i) => (
                    <td key={i.requirement.id} className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (i.state === "held" || i.state === "due") void seen(a, i, true);
                          else if (i.state === "verified") void seen(a, i, false);
                        }}
                        disabled={i.state === "missing" || i.state === "expired"}
                        title={`${STATE_WORDS[i.state]}${i.doneAt ? ` - from ${i.doneAt}` : ""}${i.expiresAt ? `, runs out ${i.expiresAt}` : ""}${i.note ? `\n${i.note}` : ""}${
                          i.state === "held" || i.state === "due" ? "\nPress to mark seen" : i.state === "verified" ? "\nPress to unmark" : ""
                        }`}
                        className={`figures inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] ${CELL[i.state].cls} ${
                          i.state === "missing" || i.state === "expired" ? "cursor-default" : "hover:bg-accent-soft/60"
                        }`}
                      >
                        {CELL[i.state].mark}
                      </button>
                      {i.link && i.state !== "missing" && (
                        <a href={i.link} target="_blank" rel="noreferrer" className="block text-[9px] text-muted underline">
                          file
                        </a>
                      )}
                    </td>
                  ))}
                  <td className="figures px-4 py-3 text-right">
                    {a.short ? <span className="font-semibold text-accent-dark">{a.short}</span> : <span className="text-emerald-700">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10.5px] text-muted">
          ✓ checked by you · • the agent says they hold it, not yet seen · ! runs out within 30 days · ✕ expired · – not on file. Press a • or ! to mark it seen.
        </p>
      </section>

      {/* ── reminders ── */}
      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Reminders due</p>
          <span className="text-[11px] text-muted">
            {dry ? (dry.armed ? "Sending is on" : "Sending is off - Admin, Switches, Agent compliance reminders") : ""}
          </span>
        </div>
        {!dry ? (
          <p className="mt-2 text-[12px] text-muted">Reading…</p>
        ) : !dry.planned.length ? (
          <p className="mt-2 text-[12px] text-muted">Nobody needs writing to today.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {dry.planned.map((p) => (
              <li key={p.email} className="text-[12px]">
                <span className="font-semibold">{p.name || p.email}</span>
                <span className="text-muted"> - {p.lines.join("; ")}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10.5px] text-muted">
          Runs with the daily jobs at 07:00. Each agent gets one email listing what is short, once per band; you get the roll-up.
        </p>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative w-full max-w-lg rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <h2 className="hand text-[20px]">{editing.id ? "Edit the requirement" : "A new requirement"}</h2>
            <div className="mt-4 grid gap-3">
              <input className={FIELD} autoFocus placeholder="What it is - e.g. Right to Rent training" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <textarea className={`${FIELD} resize-none`} rows={2} placeholder="What it means, in a sentence the agent reads" value={editing.what ?? ""} onChange={(e) => setEditing({ ...editing, what: e.target.value })} />
              <input className={FIELD} placeholder="Where to get or renew it (a link, optional)" value={editing.howLink ?? ""} onChange={(e) => setEditing({ ...editing, howLink: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Kind
                  <select className={`${FIELD} mt-1 font-normal normal-case tracking-normal`} value={editing.kind ?? "document"} onChange={(e) => setEditing({ ...editing, kind: e.target.value as RequirementKind })}>
                    {(Object.keys(KIND_LABEL) as RequirementKind[]).map((k) => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Renews every (months)
                  <input type="number" min={0} max={120} className={`${FIELD} mt-1 font-normal normal-case tracking-normal`} placeholder="blank = once" value={editing.renewsMonths ?? ""} onChange={(e) => setEditing({ ...editing, renewsMonths: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Order
                  <input type="number" min={0} className={`${FIELD} mt-1 font-normal normal-case tracking-normal`} value={editing.position ?? 99} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={editing.required !== false} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} />
                Required - an agent without it is short
              </label>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium hover:border-ink/40">Cancel</button>
              <PressButton onClick={() => void saveRequirement()} disabled={busy || !editing.title.trim()} className="flex items-center gap-2 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
                <DoodleIcon name="checklist" size={14} />
                {busy ? "Saving…" : "Save"}
              </PressButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
