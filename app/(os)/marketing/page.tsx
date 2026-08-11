"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { FlowTag } from "@/components/Wire";
import { CAMPAIGNS, lastDay, type Campaign } from "@/lib/campaigns";
// The ported TMKE renderer, wrapped in our own brand — the same module that
// will do the sending.
import { renderStep } from "@/lib/campaign-mail";

/** What GET /api/campaigns/run reports. */
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

/** Plain English for each outcome, because "held" alone tells nobody why. */
const OUTCOME: Record<string, { label: string; tone: string }> = {
  sent: { label: "Would send", tone: "text-accent-dark" },
  held: { label: "Held — sending is off", tone: "text-muted" },
  unwritten: { label: "Held — not written yet", tone: "text-muted" },
  for_human: { label: "For someone to do", tone: "text-ink" },
  no_email: { label: "No email address", tone: "text-muted" },
};

/**
 * Marketing — where campaigns are built.
 *
 * Separate from the agent screens on purpose. Agents pick a campaign off a
 * list; nobody but marketing authors one, because fifteen people improvising
 * their own follow-up produces fifteen versions of the brand.
 *
 * The preview is rendered by the SAME module that will send it, so what is on
 * screen is the email — not an approximation of it that drifts.
 */
export default function Marketing() {
  const [openId, setOpenId] = useState<string>(CAMPAIGNS[0]?.id ?? "");
  const open: Campaign | undefined = CAMPAIGNS.find((c) => c.id === openId);

  /* How many landlords are actually on each — the only number that says
     whether any of this is being used. */
  const [counts, setCounts] = useState<Record<string, { live: number; total: number }>>({});
  useEffect(() => {
    fetch("/api/enrolments")
      .then((r) => r.json())
      .then((j) => setCounts(j.counts ?? {}))
      .catch(() => {});
  }, []);

  /* What the scheduler would do if it ran this second. A dry run — it writes
     nothing — so the queue can be looked at long before the machine is
     trusted to send on its own. */
  const [run, setRun] = useState<RunReport | null>(null);
  const [checking, setChecking] = useState(false);
  const check = () => {
    setChecking(true);
    fetch("/api/campaigns/run")
      .then((r) => r.json())
      .then(setRun)
      .catch(() => setRun(null))
      .finally(() => setChecking(false));
  };
  useEffect(check, []);

  /* The FIRST WRITTEN STEP of the open campaign, rendered by the module that
     sends it — so what's on screen is the email, not a drawing of one. A
     campaign with nothing written shows nothing: the ported TMKE starters
     would fill the space, but they say TMKE in the footer, and another
     company's name has no business on this screen. */
  const preview = useMemo(() => {
    const step = open?.steps.find((s) => s.channel === "email" && s.body?.length);
    return step ? renderStep(step, { name: "Susan Barnes", address: "3 Buttermere Close" }) : null;
  }, [open]);

  return (
    <>
      <PageHeader
        title="Marketing"
        blurb="Campaigns are built here and picked out on the agent side. One set of words, one brand, and a record of which ones actually bring people back."
        lineBreak="none"
        search={false}
      />

      <div className="mt-10">
        <FlowTag from="Built here" to="Picked on a lost or nurtured appraisal" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* ── The set ── */}
        <div className="fade-up rounded-2xl border border-line/80 bg-panel p-5">
          <h2 className="mb-3 text-[15px]">Campaigns</h2>
          <ul className="space-y-2">
            {CAMPAIGNS.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    c.id === openId ? "border-accent-dark bg-accent-soft/30" : "border-line/70 hover:border-ink/30"
                  }`}
                >
                  <p className="text-[13px] font-semibold">{c.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {c.audience === "lost" ? "Lost" : "Nurture"} · {c.steps.length} steps over{" "}
                    {lastDay(c)} days
                  </p>
                  <p className="mt-1 text-[11px] text-accent-dark">
                    {counts[c.id]?.live
                      ? `${counts[c.id].live} on it now`
                      : "Nobody on it yet"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
            Agents can&apos;t author these — they pick the one that matches why an appraisal was
            lost or nurtured.
          </p>
        </div>

        {/* ── The one you're looking at ── */}
        <div className="fade-up min-w-0 space-y-4">
          {open && (
            <div className="rounded-2xl border border-line/80 bg-panel p-5">
              <h2 className="text-[15px]">{open.name}</h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">{open.aim}</p>
              <p className="mt-2 text-[11px] text-muted">
                Offered when an appraisal is marked{" "}
                <span className="text-ink">{open.audience}</span>
                {open.reasons.length ? ` — ${open.reasons.join(", ")}` : ""}
              </p>
              <ol className="mt-4 space-y-2.5">
                {open.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 border-b border-line/40 pb-2.5 last:border-0">
                    <span className="w-16 shrink-0 text-[11.5px] text-muted">
                      {s.day === 0 ? "Same day" : `Day ${s.day}`}
                    </span>
                    <span className="w-12 shrink-0 text-[11px] uppercase tracking-wide text-muted">
                      {s.channel}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold">{s.subject}</span>
                      <span className="block text-[11.5px] leading-snug text-muted">{s.gist}</span>
                      {s.channel === "email" && !s.body?.length && (
                        <span className="mt-0.5 block text-[11px] text-accent-dark">
                          Not written yet — the scheduler holds here rather than improvising
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ── What the scheduler would do right now ── */}
          <div className="rounded-2xl border border-line/80 bg-panel p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-[15px]">Due right now</h2>
              <button
                type="button"
                onClick={check}
                className="rounded-lg border border-line/70 px-2.5 py-1 text-[11px] hover:border-ink/30"
              >
                {checking ? "Checking…" : "Check again"}
              </button>
            </div>
            <p className="mb-3 text-[11px] text-muted">
              A dry run — it writes nothing and sends nothing. One step per person per day,
              and the latest due step wins: an overdue day-one note is worse than none.
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
                      {d.overtaken ? ` · ${d.overtaken} skipped as stale` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {run && run.sending === false && (
              <p className="mt-3 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
                Sending is off on this environment. Nothing has ever gone out on its own —
                set CAMPAIGN_SENDING=on, and REX_ALLOW_WRITES for the mailer, once the first
                one has been watched going to a colleague.
              </p>
            )}
          </div>

          {/* The renderer, doing the real thing. */}
          <div className="rounded-2xl border border-line/80 bg-panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px]">How it goes out</h2>
              <span className="text-[10.5px] text-muted">
                {preview
                  ? "The first written step, rendered by the module that sends it"
                  : "Nothing written for this one yet"}
              </span>
            </div>
            {preview ? (
              <iframe
                title="Email preview"
                srcDoc={preview.html}
                className="h-[420px] w-full rounded-xl border border-line/60 bg-white"
              />
            ) : (
              <p className="rounded-xl border border-dashed border-line/70 px-4 py-10 text-center text-[12px] text-muted">
                No copy has been written for this campaign yet, so there is nothing to show and
                nothing to send. The scheduler will hold anyone on it at the first step until
                there is.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
