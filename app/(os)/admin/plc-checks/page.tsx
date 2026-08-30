"use client";

import { useEffect, useState } from "react";
import type { ShadowStats } from "@/lib/plc-shadow";

/**
 * PLC checks: how the scan is holding up, and how long packs are taking.
 *
 * Two questions on one page because they are the two things worth watching
 * over months rather than days:
 *
 *   1. When the rules say a pack looks fine, does the compliance team agree?
 *   2. How long does a pack sit between handover and a decision?
 *
 * The second is the one to show agents. "It takes 48 hours" is currently a
 * belief; once this has run for a while it is a measurement, and a measurement
 * that comes down is worth telling people about.
 *
 * ── Read here, never while deciding ────────────────────────────────────────
 *
 * Deliberately in admin and deliberately not linked from the compliance
 * screens. Telling somebody "the rules agree with you 98% of the time" while
 * they are deciding stops them being an independent check - they start
 * agreeing with a number, and the number then measures itself.
 */

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);

const hrs = (v: number | null) => {
  if (v === null) return "—";
  if (v < 1) return `${Math.round(v * 60)} min`;
  if (v < 48) return `${v.toFixed(1)} hrs`;
  return `${(v / 24).toFixed(1)} days`;
};

const prettyMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
};

function Panel({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-base tracking-normal text-neutral-900 dark:text-neutral-100">{title}</h2>
      {blurb && <p className="mt-1 text-sm text-neutral-500">{blurb}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Big({
  value,
  of,
  label,
  blurb,
  tone = "plain",
}: {
  value: string;
  of?: string;
  label: string;
  blurb: string;
  tone?: "plain" | "bad" | "good";
}) {
  const colour =
    tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className={`text-3xl ${colour}`}>
        {value}
        {of && <span className="ml-2 text-sm text-neutral-400">{of}</span>}
      </p>
      <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{label}</p>
      <p className="mt-1 text-xs text-neutral-500">{blurb}</p>
    </div>
  );
}

export default function PlcChecksAdmin() {
  const [s, setS] = useState<ShadowStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plc/shadow")
      .then((r) => r.json())
      .then((b) => (b.ok ? setS(b) : setError(b.error ?? "Could not read the log.")))
      .catch(() => setError("Could not read the log."));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Admin</p>
      <h1 className="mt-1 text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
        PLC Checks
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        What the scan recommended on every pack, recorded before anybody saw it, against what the
        compliance team actually decided. Nothing here changes a decision.
      </p>

      {error && <p className="mt-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {!s && !error && <p className="mt-6 text-sm text-neutral-500">Reading the log…</p>}

      {s && (
        <div className="mt-6 space-y-6">
          <p className="rounded-xl border border-neutral-200 p-4 text-base dark:border-neutral-800">
            {s.verdict}
          </p>

          <Panel
            title="Agreement"
            blurb="Read as: of the packs the rules called this, how often did a person say the same. That direction matters — the other way round flatters the figure whenever most packs are fine, which they are."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Big
                value={pct(s.saidPass.pct)}
                of={s.saidPass.n ? `of ${s.saidPass.n}` : "no data"}
                label="Said it looked fine, and it was approved"
                blurb={`${s.missed} of these were stopped by a person instead. Those are the ones that matter.`}
                tone={s.missed ? "bad" : s.saidPass.n ? "good" : "plain"}
              />
              <Big
                value={pct(s.saidStop.pct)}
                of={s.saidStop.n ? `of ${s.saidStop.n}` : "no data"}
                label="Flagged a problem, and it was stopped"
                blurb={`${s.overFlagged} were approved anyway. Cheap on its own, but too many and people stop reading the flags.`}
              />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              {s.deferredToHuman} pack{s.deferredToHuman === 1 ? "" : "s"} the rules explicitly sent to
              a person. Counted in neither figure — the rules never claimed to answer those, so
              including them would flatter both.
            </p>
          </Panel>

          <Panel
            title="Turnaround"
            blurb="Handover to decision. The median is the one to quote: a single pack that sat over a bank holiday drags the average and tells an agent nothing about their own."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Big
                value={hrs(s.turnaround.medianHours)}
                label="Median"
                blurb="What a typical pack takes."
              />
              <Big value={hrs(s.turnaround.meanHours)} label="Average" blurb="Pulled about by the slow ones." />
              <Big value={String(s.turnaround.n)} label="Packs timed" blurb="Submitted and decided through the OS." />
            </div>
          </Panel>

          {s.byMonth.length > 0 && (
            <Panel title="Month by Month" blurb="So a trend can be seen rather than asserted.">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                      <th className="py-2 pr-4 font-normal">Month</th>
                      <th className="py-2 pr-4 font-normal">Decided</th>
                      <th className="py-2 pr-4 font-normal">Median turnaround</th>
                      <th className="py-2 font-normal">Called fine, stopped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byMonth.map((m) => (
                      <tr key={m.month} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                        <td className="py-2 pr-4">{prettyMonth(m.month)}</td>
                        <td className="py-2 pr-4">{m.decided}</td>
                        <td className="py-2 pr-4">{hrs(m.medianHours)}</td>
                        <td className={`py-2 ${m.missed ? "text-rose-600 dark:text-rose-400" : ""}`}>
                          {m.missed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {s.misses.length > 0 && (
            <section className="rounded-xl border border-rose-200 dark:border-rose-900">
              <div className="border-b border-rose-200 px-4 py-3 dark:border-rose-900">
                <h2 className="text-base tracking-normal">Where It Was Wrong</h2>
                <p className="mt-0.5 text-sm text-neutral-500">
                  The rules called these fine and a person stopped them. Their note is the reason,
                  and next to it is what the scan thought at the time. Each pair is a rule that does
                  not exist yet.
                </p>
              </div>
              <ul>
                {s.misses.map((m) => (
                  <li
                    key={m.caseId}
                    className="border-b border-rose-100 px-4 py-4 last:border-0 dark:border-rose-950"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">{m.address}</p>
                      <p className="text-xs text-neutral-400">
                        {m.decidedBy} · {hrs(m.hoursToDecide)} to decide
                      </p>
                    </div>

                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                          What the scan said
                        </p>
                        <p className="mt-1 text-sm">{m.headline}</p>
                        {m.perCheck.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {m.perCheck.map((c) => (
                              <li key={c.checkId} className="text-xs text-neutral-500">
                                {c.line}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-lg border border-rose-200 p-3 dark:border-rose-900">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                          Why it was {m.decision}
                        </p>
                        <p className="mt-1 text-sm">{m.decisionNote || "No note was left."}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-neutral-500">
            {s.compared === 0
              ? "No pack has been both scanned and decided yet, so there is nothing to compare."
              : `${s.compared} pack${s.compared === 1 ? "" : "s"} scanned and decided.`}
          </p>
        </div>
      )}
    </div>
  );
}
