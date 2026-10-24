"use client";

import { Badge } from "@/components/new-look/Parts";
import { NlFailed, NlFig, NlLoading } from "@/components/new-look/admin/ScreenBits";

/**
 * Usage > AI costs in the new look (lib/new-look "admin", 24 Oct 2026): what
 * each AI feature spent this London month so far and last month, and the
 * model it is on right now. The adding up is the page's own
 * (app/(os)/admin/ai-costs); this is how it is drawn.
 */

type Total = { calls: number; refused: number; in: number; out: number; cost: number; unpriced: boolean };
export type CostRow = { f: { id: string; label: string; model: string; effort: string; chosen: string }; now: Total; last: Total };

export default function AiCostsNew({
  error,
  ready,
  rows,
  all,
  allLast,
  lastMeasured,
  since,
  thisMonth,
  lastMonth,
  dollars,
  tokens,
  modelName,
}: {
  error: string | null;
  ready: boolean;
  rows: CostRow[];
  all: Total | null;
  allLast: Total | null;
  lastMeasured: boolean;
  since: string | null;
  thisMonth: string;
  lastMonth: string;
  dollars: (n: number | null) => string;
  tokens: (n: number) => string;
  modelName: (id: string) => string;
}) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <p className="nl-adm-lead">
        Every call the OS makes to Claude, added up by feature for {thisMonth} so far and for {lastMonth}. The model column is what each feature uses right now. Costs are in US dollars, as Anthropic bills them.
      </p>

      {error ? (
        <NlFailed error={error} first />
      ) : !ready || !all || !allLast ? (
        <NlLoading what="Adding up this month" />
      ) : (
        <>
          <ul className="nl-adm-p-figs">
            <NlFig label={`${thisMonth} so far`} value={dollars(all.cost)} />
            <NlFig label={`All of ${lastMonth}`} value={lastMeasured ? dollars(allLast.cost) : "Not recorded"} word={!lastMeasured} />
            <NlFig label={`Calls in ${thisMonth}`} value={all.calls.toLocaleString("en-GB")} />
            <NlFig label="Declined by the model" value={all.refused.toLocaleString("en-GB")} />
          </ul>
          <p className="nl-meta nl-adm-p-after">
            {since
              ? `Recording since ${new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}. Anything earlier was not measured.`
              : "Nothing recorded yet. The first call to Claude will appear here."}
          </p>

          <section className="nl-adm-block">
            <div className="nl-adm-block-head">
              <h2 className="nl-section-title">By Feature</h2>
            </div>
            <div className="nl-adm-tablewrap">
              <table className="nl-adm-table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Model now</th>
                    <th className="is-num">Calls</th>
                    <th className="is-num">Tokens in / out</th>
                    <th className="is-num">{thisMonth}</th>
                    <th className="is-num">{lastMonth}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ f, now, last }) => (
                    <tr key={f.id} className={now.calls ? undefined : "is-quiet"}>
                      <td>{f.label}</td>
                      <td>
                        {modelName(f.model)}
                        <span className="nl-adm-muted">, {f.effort} effort</span>
                        {f.model !== f.chosen && (
                          <>
                            {" "}
                            <Badge tone="warning" bare>Switched on Railway</Badge>
                          </>
                        )}
                      </td>
                      <td className="is-num">{now.calls ? now.calls.toLocaleString("en-GB") : "-"}</td>
                      <td className="is-num">{now.calls ? `${tokens(now.in)} / ${tokens(now.out)}` : "-"}</td>
                      <td className="is-num">{now.calls ? dollars(now.cost) : "-"}</td>
                      <td className="is-num">{last.calls ? dollars(last.cost) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nl-meta nl-adm-foot">
              To move a feature to another model without a deploy, set AI_MODEL_ and its name on the TLE-OS service in Railway, for example AI_MODEL_PLC_SCAN=claude-opus-5-5. docs/AI-MODELS.md has which model each feature is on and why.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
