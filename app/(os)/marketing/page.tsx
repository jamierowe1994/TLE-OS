"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { FlowTag } from "@/components/Wire";
import { CAMPAIGNS, lastDay, type Campaign } from "@/lib/campaigns";
// The ported TMKE renderer — pure JS, the same file that will do the sending.
import { defaultBrand, renderTemplate } from "@/lib/email/render.js";
import { STARTER_TEMPLATES } from "@/lib/email/starters.js";

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

  const brand = useMemo(() => defaultBrand(), []);
  const html = useMemo(() => {
    const starter = STARTER_TEMPLATES[0];
    const out = renderTemplate(starter, { brand, mergeCtx: { firstName: "Susan", address: "3 Buttermere Close" } });
    return typeof out === "string" ? out : (out?.html ?? "");
  }, [brand]);

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
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* The renderer, doing the real thing. */}
          <div className="rounded-2xl border border-line/80 bg-panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px]">How it goes out</h2>
              <span className="text-[10.5px] text-muted">
                Rendered by the sending module — this is the email, not a mock-up
              </span>
            </div>
            <iframe
              title="Email preview"
              srcDoc={html}
              className="h-[420px] w-full rounded-xl border border-line/60 bg-white"
            />
          </div>
        </div>
      </div>
    </>
  );
}
