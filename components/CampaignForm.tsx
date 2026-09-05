"use client";

import { useState } from "react";
import { LOST_REASONS, NURTURE_REASONS } from "@/lib/appraisal";
import { NURTURE_REASONS as LEAD_REASONS } from "@/lib/lead-spine";
import type { Campaign, CampaignStep } from "@/lib/campaigns";

/**
 * Building a campaign: who it's for, why it exists, and what happens when.
 *
 * The words are NOT written here — that's the builder, one step at a time.
 * This is the plan: the shape you can read at a glance and argue about before
 * anyone writes a paragraph. Keeping the two apart is what stops a campaign
 * becoming four emails nobody can see the sequence of.
 *
 * A campaign starts as a DRAFT and has to be turned on deliberately. Nothing
 * is offered to an agent, and nobody is ever enrolled, until someone says so.
 */

type Draft = {
  id?: string;
  name: string;
  aim: string;
  audience: "lost" | "nurture";
  reasons: string[];
  status: "draft" | "live";
  steps: CampaignStep[];
};

const BLANK: Draft = {
  name: "",
  aim: "",
  audience: "nurture",
  reasons: [],
  status: "draft",
  steps: [{ day: 1, channel: "email", subject: "", gist: "" }],
};

export default function CampaignForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Campaign | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [d, setD] = useState<Draft>(() =>
    existing
      ? {
          id: existing.id,
          name: existing.name,
          aim: existing.aim,
          audience: existing.audience,
          reasons: existing.reasons,
          status: existing.status,
          steps: existing.steps.map((s) => ({ ...s })),
        }
      : BLANK
  );
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  /* The reasons an appraisal can end on, and the ones a lead can go to
     nurture for - the lead spine's Nurture branch enrols by reason too, so a
     campaign locked onto "Not answering" is what a never-answered lead gets. */
  const reasons: readonly string[] =
    d.audience === "lost"
      ? LOST_REASONS
      : [...new Set<string>([...NURTURE_REASONS, ...LEAD_REASONS])];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setStep = (i: number, patch: Partial<CampaignStep>) =>
    setD((p) => ({ ...p, steps: p.steps.map((s, n) => (n === i ? { ...s, ...patch } : s)) }));

  async function save() {
    if (!d.name.trim()) {
      setNote("It needs a name.");
      return;
    }
    if (!d.steps.some((s) => s.subject.trim())) {
      setNote("A campaign with no steps never does anything — give it at least one.");
      return;
    }
    setSaving(true);
    setNote("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(d),
      });
      const j = await res.json();
      if (j.saved) onSaved(j.id);
      else setNote(j.error ?? j.reason ?? "It didn't save.");
    } catch {
      setNote("It didn't save.");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-lg border border-line/70 bg-card px-3 py-2 text-[12.5px] outline-none focus:border-ink/40";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-sm">
      <div className="my-auto w-full max-w-2xl rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-3 border-b border-line/60 pb-3">
          <div>
            <h2 className="text-[16px]">{existing ? "Edit campaign" : "New campaign"}</h2>
            <p className="text-[11.5px] text-muted">
              {note || "The plan, not the words — those come after, one step at a time. Two live campaigns on the same reason run as a test: leads alternate between them."}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line/70 px-2.5 py-1.5 text-[11.5px] hover:border-ink/30"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-ink px-3.5 py-1.5 text-[11.5px] text-page disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save campaign"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-muted">Name</span>
            <input
              className={field}
              autoFocus
              value={d.name}
              placeholder="Win-back — went quiet after the visit"
              onChange={(e) => set("name", e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-muted">
              What it&apos;s for, in one line
            </span>
            <input
              className={field}
              value={d.aim}
              placeholder="Be the agent they were already talking to when the date arrives."
              onChange={(e) => set("aim", e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-muted">
              Offered when an appraisal is
            </span>
            <select
              className={field}
              value={d.audience}
              onChange={(e) =>
                setD((p) => ({ ...p, audience: e.target.value as "lost" | "nurture", reasons: [] }))
              }
            >
              <option value="nurture">Nurtured</option>
              <option value="lost">Lost</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-muted">Status</span>
            <select
              className={field}
              value={d.status}
              onChange={(e) => set("status", e.target.value as "draft" | "live")}
            >
              <option value="draft">Draft — not offered to anyone</option>
              <option value="live">Live — agents can pick it</option>
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[10.5px] uppercase tracking-wide text-muted">
              For which reasons
            </span>
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => {
                const on = d.reasons.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      set("reasons", on ? d.reasons.filter((x) => x !== r) : [...d.reasons, r])
                    }
                    className={`rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors ${
                      on ? "border-accent-dark bg-accent-soft/40" : "border-line/70 hover:border-ink/30"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted">
              Locked onto these: a lead or an appraisal with one of these reasons lands on this campaign.
              Pick none and it stands in for any {d.audience === "lost" ? "lost" : "nurtured"} one with no
              campaign of its own.
            </p>
          </div>
        </div>

        {/* ── the sequence ── */}
        <div className="mt-5 border-t border-line/60 pt-4">
          <p className="mb-2 text-[10.5px] uppercase tracking-wide text-muted">
            The sequence — days after they&apos;re put on it
          </p>
          <ul className="space-y-2">
            {d.steps.map((s, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[72px_96px_1fr_28px]">
                <input
                  type="number"
                  min={0}
                  max={730}
                  className={field}
                  value={s.day}
                  onChange={(e) => setStep(i, { day: Number(e.target.value) })}
                />
                <select
                  className={field}
                  value={s.channel}
                  onChange={(e) => setStep(i, { channel: e.target.value as CampaignStep["channel"] })}
                >
                  <option value="email">Email</option>
                  <option value="call">Call</option>
                  <option value="post">Post</option>
                </select>
                <input
                  className={field}
                  placeholder="Subject, or what the call is about"
                  value={s.subject}
                  onChange={(e) => setStep(i, { subject: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Remove step"
                  onClick={() => set("steps", d.steps.filter((_, n) => n !== i))}
                  className="h-[34px] rounded-lg border border-line/70 text-[12px] hover:border-ink/30"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              set("steps", [
                ...d.steps,
                {
                  day: (d.steps[d.steps.length - 1]?.day ?? 0) + 30,
                  channel: "email",
                  subject: "",
                  gist: "",
                },
              ])
            }
            className="mt-2 rounded-lg border border-line/70 px-2.5 py-1.5 text-[11.5px] hover:border-ink/30"
          >
            + Add a step
          </button>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
            Order doesn&apos;t matter here — the scheduler reads them by day. Emails still need
            writing after this; a step with no words holds the sequence rather than sending
            something nobody wrote.
          </p>
        </div>
      </div>
    </div>
  );
}
