"use client";

import type { ShadowStats } from "@/lib/plc-shadow";
import { Badge } from "@/components/new-look/Parts";
import { Loading, Problem } from "@/components/new-look/admin/bits";

/**
 * PLC checks in the new look (lib/new-look "admin", 24 Oct 2026). The same
 * log, the same figures and the same Final Approval list as the old page
 * (app/(os)/admin/plc-checks), drawn on hairlines. No header: the Admin frame
 * draws Pre-let and its tabs.
 */

export const pct = (v: number | null) => (v === null ? "-" : `${v.toFixed(0)}%`);

export const hrs = (v: number | null) => {
  if (v === null) return "-";
  if (v < 1) return `${Math.round(v * 60)} min`;
  if (v < 48) return `${v.toFixed(1)} hrs`;
  return `${(v / 24).toFixed(1)} days`;
};

export const prettyMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

/** The Final Approval list, loaded and saved by the page (manage:roles only). */
export type Approvers = {
  emails: string[] | null;
  draft: string;
  setDraft: (v: string) => void;
  msg: string | null;
  busy: boolean;
  save: () => void;
};

function Fig({ value, of, label, blurb, tone }: { value: string; of?: string; label: string; blurb: string; tone?: "bad" | "good" }) {
  return (
    <div className="nl-adm-fig">
      <b className={tone ? `is-${tone}` : undefined}>
        {value}
        {of && <small>{of}</small>}
      </b>
      <span className="nl-strong">{label}</span>
      <span className="nl-meta">{blurb}</span>
    </div>
  );
}

export default function PlcChecksNew({ s, error, approvers }: { s: ShadowStats | null; error: string | null; approvers: Approvers }) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
      <p className="nl-meta nl-adm-lede">
        What the scan recommended on every pack, recorded before anybody saw it, against what the compliance team decided. Nothing here changes a decision.
      </p>

      {error && <Problem>{error}</Problem>}
      {!s && !error && <Loading label="Reading the log…" />}

      {s && (
        <div className="nl-adm-stack">
          <section className="nl-adm-card">
            <p className="nl-adm-verdict">{s.verdict}</p>
            <p className="nl-meta mt-3">
              {s.compared === 0
                ? "No pack has been both scanned and decided yet, so there is nothing to compare."
                : `${s.compared} pack${s.compared === 1 ? "" : "s"} scanned and decided.`}
            </p>
          </section>

          <section className="nl-adm-card">
            <h2 className="nl-adm-h">Agreement</h2>
            <p className="nl-meta nl-adm-sub">
              Of the packs the rules called this, how often a person said the same. That direction matters: the other way round flatters the figure whenever most packs are fine, which they are.
            </p>
            <div className="nl-adm-figs" style={{ ["--n" as string]: 2 }}>
              <Fig
                value={pct(s.saidPass.pct)}
                of={s.saidPass.n ? `of ${s.saidPass.n}` : "no data"}
                label="Said it looked fine, and it was approved"
                blurb={`${s.missed} of these were stopped by a person instead. Those are the ones that matter.`}
                tone={s.missed ? "bad" : s.saidPass.n ? "good" : undefined}
              />
              <Fig
                value={pct(s.saidStop.pct)}
                of={s.saidStop.n ? `of ${s.saidStop.n}` : "no data"}
                label="Flagged a problem, and it was stopped"
                blurb={`${s.overFlagged} were approved anyway. Cheap on its own, but too many and people stop reading the flags.`}
              />
            </div>
            <p className="nl-meta mt-3">
              {s.deferredToHuman} pack{s.deferredToHuman === 1 ? "" : "s"} the rules explicitly sent to a person. Counted in neither figure: the rules never claimed to answer those, so including them would flatter both.
            </p>
          </section>

          <section className="nl-adm-card">
            <h2 className="nl-adm-h">Turnaround</h2>
            <p className="nl-meta nl-adm-sub">
              Handover to decision. The median is the one to quote: a single pack that sat over a bank holiday drags the average and tells an agent nothing about their own.
            </p>
            <div className="nl-adm-figs" style={{ ["--n" as string]: 3 }}>
              <Fig value={hrs(s.turnaround.medianHours)} label="Median" blurb="What a typical pack takes." />
              <Fig value={hrs(s.turnaround.meanHours)} label="Average" blurb="Pulled about by the slow ones." />
              <Fig value={String(s.turnaround.n)} label="Packs timed" blurb="Submitted and decided through the OS." />
            </div>
          </section>

          {s.byMonth.length > 0 && (
            <section className="nl-adm-card">
              <h2 className="nl-adm-h">Month by Month</h2>
              <p className="nl-meta nl-adm-sub">So a trend can be seen rather than asserted.</p>
              <div className="nl-adm-tablewrap">
                <table className="nl-adm-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Decided</th>
                      <th>Median turnaround</th>
                      <th>Called fine, stopped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byMonth.map((m) => (
                      <tr key={m.month}>
                        <td>{prettyMonth(m.month)}</td>
                        <td className="is-num">{m.decided}</td>
                        <td className="is-num">{hrs(m.medianHours)}</td>
                        <td>{m.missed ? <Badge tone="accent" bare>{m.missed}</Badge> : <span className="is-num">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {s.misses.length > 0 && (
            <section className="nl-adm-card is-hot">
              <h2 className="nl-adm-h">
                Where It Was Wrong <span className="nl-count">{s.misses.length}</span>
              </h2>
              <p className="nl-meta nl-adm-sub">
                The rules called these fine and a person stopped them. Their note is the reason, and next to it is what the scan thought at the time. Each pair is a rule that does not exist yet.
              </p>
              <ul className="nl-adm-rows mt-3">
                {s.misses.map((m) => (
                  <li key={m.caseId} className="is-block">
                    <div className="nl-adm-row-line">
                      <span className="nl-strong">{m.address}</span>
                      <span className="nl-meta">
                        {m.decidedBy} · {hrs(m.hoursToDecide)} to decide
                      </span>
                    </div>
                    <div className="nl-adm-pair">
                      <div className="nl-adm-pane">
                        <p className="nl-eyebrow">What the scan said</p>
                        <p className="mt-1 text-[14px] leading-[21px]">{m.headline}</p>
                        {m.perCheck.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {m.perCheck.map((c) => (
                              <li key={c.checkId} className="nl-meta">
                                {c.line}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="nl-adm-pane is-hot">
                        <p className="nl-eyebrow">Why it was {m.decision}</p>
                        <p className="mt-1 text-[14px] leading-[21px]">{m.decisionNote || "No note was left."}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Who gives the final approval. Only drawn for somebody who can change it. */}
      {approvers.emails && (
        <section className="nl-adm-card mt-4">
          <h2 className="nl-adm-h">Final Approval</h2>
          <p className="nl-meta nl-adm-sub">
            Every pack gets a first check from the compliance team, then one of these people approves it. Never the same person who did the first check. One email per line.
          </p>
          <label className="nl-field mt-4">
            <span>Approvers</span>
            <textarea rows={3} value={approvers.draft} onChange={(e) => approvers.setDraft(e.target.value)} className="nl-adm-plain" />
          </label>
          <div className="nl-adm-card-acts items-center">
            <button type="button" onClick={approvers.save} disabled={approvers.busy} className="nl-btn nl-btn--primary nl-btn--sm">
              {approvers.busy ? "Saving…" : "Save"}
            </button>
            {approvers.msg && <span className="nl-meta">{approvers.msg}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
