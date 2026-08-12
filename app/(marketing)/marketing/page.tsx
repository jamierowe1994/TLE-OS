"use client";

import { useEffect, useMemo, useState } from "react";
import { CAMPAIGNS, lastDay, type Campaign } from "@/lib/campaigns";
import CampaignForm from "@/components/CampaignForm";
// The ported TMKE renderer, wrapped in our own brand — the same module that
// does the sending.
import { renderStep, type StepCopy } from "@/lib/campaign-mail";
import EmailBuilder from "@/components/EmailBuilder";

/**
 * Marketing.
 *
 * One thing at a time, on purpose. The screen used to show every campaign,
 * the open campaign, the queue and a preview all at once, which is how a
 * marketing tool becomes something people avoid opening. So: the list, until
 * you pick one — then the list steps aside and you are looking at one
 * campaign; then the builder fills the screen and you are writing one email.
 */

type RunReport = {
  sending?: boolean;
  error?: string;
  checked?: number;
  reason?: string;
  due?: {
    enrolmentId: string;
    campaignId: string;
    who: string;
    step: number;
    day: number;
    channel: string;
    subject: string;
    outcome: string;
    overdue?: number;
    overtaken?: number;
  }[];
};

const OUTCOME: Record<string, { label: string; tone: string }> = {
  sent: { label: "Would send", tone: "text-accent-dark" },
  held: { label: "Held — sending is off", tone: "text-muted" },
  unwritten: { label: "Held — not written yet", tone: "text-muted" },
  for_human: { label: "For someone to do", tone: "text-ink" },
  no_email: { label: "No email address", tone: "text-muted" },
};

type Listed = Campaign & { source?: string };

export default function Marketing() {
  const [openId, setOpenId] = useState<string>("");

  /* The built-in set, plus anything marketing has written here. Seeded from
     code so the screen is never empty while the fetch is in flight — and so
     it still works on an environment with no database. */
  const [campaigns, setCampaigns] = useState<Listed[]>(() =>
    CAMPAIGNS.map((c) => ({ ...c, source: "built-in" }))
  );
  const loadCampaigns = () =>
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((j) => Array.isArray(j.campaigns) && j.campaigns.length && setCampaigns(j.campaigns))
      .catch(() => {});

  const [editing, setEditing] = useState<"new" | Campaign | null>(null);
  const open: Listed | undefined = campaigns.find((c) => c.id === openId);

  const [counts, setCounts] = useState<Record<string, { live: number; total: number }>>({});
  const [copy, setCopy] = useState<Record<string, StepCopy>>({});
  const [run, setRun] = useState<RunReport | null>(null);

  useEffect(() => {
    fetch("/api/enrolments")
      .then((r) => r.json())
      .then((j) => setCounts(j.counts ?? {}))
      .catch(() => {});
    fetch("/api/email-templates")
      .then((r) => r.json())
      .then((j) => {
        const m: Record<string, StepCopy> = {};
        for (const t of j.templates ?? []) m[`${t.campaignId}:${t.stepIndex}`] = t;
        setCopy(m);
      })
      .catch(() => {});
    fetch("/api/campaigns/run")
      .then((r) => r.json())
      .then(setRun)
      .catch(() => {});
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Which step is being looked at, and which is being written. */
  const [shown, setShown] = useState(0);
  const [writing, setWriting] = useState<number | null>(null);
  useEffect(() => {
    setShown(0);
    setWriting(null);
  }, [openId]);

  const written = (c: Campaign, i: number) =>
    Boolean(copy[`${c.id}:${i}`]?.blocks?.length || c.steps[i].body?.length);

  const unwritten = (c: Campaign) =>
    c.steps.filter((s, i) => s.channel === "email" && !written(c, i)).length;

  const preview = useMemo(() => {
    if (!open) return null;
    const s = open.steps[shown];
    if (!s || s.channel !== "email") return null;
    return renderStep(
      s,
      { name: "Susan Barnes", address: "3 Buttermere Close" },
      copy[`${open.id}:${shown}`] ?? null
    );
  }, [open, shown, copy]);

  /* ─────────────────────────── the list ─────────────────────────── */

  if (!open) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px]">Campaigns</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              Written here, picked on the agent side when an appraisal is lost or nurtured.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-xl border border-line/70 bg-panel px-3.5 py-2 text-[12px] hover:border-ink/30"
          >
            + New campaign
          </button>
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="fade-up h-full w-full rounded-2xl border border-line/80 bg-panel p-4 text-left transition-colors hover:border-ink/30"
              >
                <p className="text-[13.5px] font-semibold">{c.name}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{c.aim}</p>
                <p className="mt-3 text-[11px] text-muted">
                  {c.audience === "lost" ? "Lost" : "Nurture"} · {c.steps.length} steps over{" "}
                  {lastDay(c)} days
                  {c.status === "draft" && <span className="text-accent-dark"> · draft</span>}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-2 text-[11px]">
                  <span className="text-accent-dark">
                    {counts[c.id]?.live ? `${counts[c.id].live} on it now` : "Nobody on it yet"}
                  </span>
                  {unwritten(c) > 0 && (
                    <span className="text-muted">· {unwritten(c)} still to write</span>
                  )}
                </p>
              </button>
            </li>
          ))}
        </ul>

        {/* The queue lives on the index, where it reads as the state of the
            whole operation rather than as clutter beside one campaign. */}
        <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
          <h2 className="text-[15px]">Due right now</h2>
          <p className="mb-3 mt-0.5 text-[11px] text-muted">
            A dry run — it writes nothing and sends nothing. One step per person per day, and
            the latest due step wins.
          </p>
          {!run?.due?.length ? (
            <p className="text-[12px] text-muted">
              {run?.error
                ? `${run.error} The queue only reads for someone signed in.`
                : run?.reason
                  ? run.reason
                  : `Nothing due${run?.checked ? ` across ${run.checked} on a campaign` : ""}.`}
            </p>
          ) : (
            <ul className="space-y-2">
              {run.due.map((d) => (
                <li
                  key={d.enrolmentId}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/40 pb-2 last:border-0"
                >
                  <span className="text-[12.5px] font-semibold">{d.who}</span>
                  <span className="text-[11.5px] text-muted">
                    step {d.step}, day {d.day} · {d.subject}
                  </span>
                  <span className={`ml-auto text-[11px] ${OUTCOME[d.outcome]?.tone ?? "text-muted"}`}>
                    {OUTCOME[d.outcome]?.label ?? d.outcome}
                    {d.overdue ? ` · ${d.overdue}d late` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {editing && (
          <CampaignForm
            existing={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async (id) => {
              setEditing(null);
              await loadCampaigns();
              setOpenId(id);
            }}
          />
        )}
      </>
    );
  }

  /* ───────────────────────── one campaign ───────────────────────── */

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpenId("")}
          className="rounded-xl border border-line/70 px-3 py-1.5 text-[12px] hover:border-ink/30"
        >
          ← Change campaign
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[17px]">{open.name}</h2>
          <p className="text-[11.5px] text-muted">
            {open.audience === "lost" ? "Lost" : "Nurture"}
            {open.reasons.length ? ` — ${open.reasons.join(", ")}` : ""} ·{" "}
            {counts[open.id]?.live ? `${counts[open.id].live} on it now` : "nobody on it yet"}
          </p>
        </div>
        {open.source === "built-in" ? (
          <span className="ml-auto text-[10.5px] text-muted">
            Built in — its plan lives in the code, its words don&apos;t
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(open)}
            className="ml-auto rounded-xl border border-line/70 px-3 py-1.5 text-[12px] hover:border-ink/30"
          >
            Edit the plan
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* ── the plan ── */}
        <div className="fade-up rounded-2xl border border-line/80 bg-panel p-4">
          <p className="mb-1 max-w-prose text-[12px] leading-relaxed text-muted">{open.aim}</p>
          <ol className="mt-3 space-y-1.5">
            {open.steps.map((s, i) => {
              const on = i === shown;
              return (
                <li key={i}>
                  <div
                    className={`rounded-xl border px-3 py-2.5 transition-colors ${
                      on ? "border-accent-dark bg-accent-soft/25" : "border-line/70"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setShown(i)}
                      className="block w-full text-left"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="text-[11px] text-muted">
                          {s.day === 0 ? "Same day" : `Day ${s.day}`}
                        </span>
                        <span className="text-[10.5px] uppercase tracking-wide text-muted">
                          {s.channel}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12.5px] font-semibold">{s.subject}</span>
                      <span className="block text-[11.5px] leading-snug text-muted">{s.gist}</span>
                    </button>
                    {s.channel === "email" && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShown(i);
                            setWriting(i);
                          }}
                          className="rounded-lg border border-line/70 bg-card px-2.5 py-1 text-[11px] hover:border-ink/30"
                        >
                          {written(open, i) ? "Edit" : "Write it"}
                        </button>
                        {!written(open, i) && (
                          <span className="text-[10.5px] text-accent-dark">
                            Not written — the scheduler holds here
                          </span>
                        )}
                        {copy[`${open.id}:${i}`] && (
                          <span className="text-[10.5px] text-muted">Written here</span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── what it looks like ── */}
        <div className="fade-up min-w-0">
          {preview ? (
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              className="h-[640px] w-full rounded-2xl border border-line/70 bg-white"
            />
          ) : (
            <div className="flex h-[640px] items-center justify-center rounded-2xl border border-dashed border-line/70 px-8 text-center">
              <p className="max-w-sm text-[12px] leading-relaxed text-muted">
                {open.steps[shown]?.channel === "email"
                  ? "Nothing written for this step yet. Write it and it appears here — and the scheduler stops holding anyone at it."
                  : "This step is a call, not an email. There's nothing to look at — it's a job for a person, and it shows up in the queue on the day."}
              </p>
            </div>
          )}
        </div>
      </div>

      {writing !== null && (
        <EmailBuilder
          key={`${open.id}:${writing}`}
          campaignId={open.id}
          stepIndex={writing}
          step={open.steps[writing]}
          initial={copy[`${open.id}:${writing}`] ?? null}
          onClose={() => setWriting(null)}
          onSaved={(saved) =>
            setCopy((prev) => {
              const next = { ...prev };
              const k = `${open.id}:${writing}`;
              if (saved) next[k] = saved;
              else delete next[k];
              return next;
            })
          }
        />
      )}

      {editing && (
        <CampaignForm
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null);
            await loadCampaigns();
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}
