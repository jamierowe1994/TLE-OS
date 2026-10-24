"use client";

import { Badge, type Tone } from "@/components/new-look/Parts";
import { useTestFiles } from "@/components/testing/TestFilesTab";
import { TEST_FILE_SIDES, WHO_WORDS, type TestFileSide } from "@/lib/testing-journeys";
import { ErrorLine, Loading, Section, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > Testing > Test Files in the new look (24 Oct 2026). The same files,
 * resets, deletes, relinks and launch buttons as the old tab, through the same
 * hook (components/testing/TestFilesTab useTestFiles), with the same
 * confirmations before anything is reset, deleted or closed.
 */

const SIDE_TONE: Record<TestFileSide, Tone> = { landlord: "warning", tenant: "info", plc: "accent", tenancy: "good", e2e: "neutral" };

export default function TestFilesNew() {
  const { data, everyone, setEveryone, busy, error, done, setDone, pick, setPick, act, files, closed } = useTestFiles();

  return (
    <div className="nl-pane">
      {error && <ErrorLine>{nd(error)}</ErrorLine>}

      {closed && (
        <div className="nl-adm-panel is-good nl-adm-gapb">
          <p className="nl-strong">Testing Is Closed for Launch</p>
          <p>
            Every test file was removed{data?.closed?.by ? ` by ${data.closed.by}` : ""}
            {data?.closed?.at ? `, ${when(data.closed.at)}` : ""}, and no new ones can be made.
          </p>
          {data?.owner && (
            <div className="nl-adm-row-acts">
              <button type="button" disabled={busy !== null} onClick={() => void act("reopen", { action: "reopen" })} className="nl-btn nl-btn--secondary nl-btn--sm">
                {busy === "reopen" ? "Reopening…" : "Reopen Testing"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* After launch, only the E2E pair, which is kept for showing the process. */}
      <Section title="Add a Test File">
        <p className="nl-meta">Each one uses your own email as the customer&apos;s, so every email in the flow comes to you. It is kept out of REX. Add as many as you like and walk them in different ways.</p>
        <div className="nl-adm-add">
          {(Object.keys(TEST_FILE_SIDES) as TestFileSide[])
            .filter((side) => !closed || side === "e2e")
            .map((side) => (
              <button key={side} type="button" disabled={busy !== null} onClick={() => void act(`add:${side}`, { action: "add", side })}>
                <span className="nl-strong">{busy === `add:${side}` ? "Adding…" : TEST_FILE_SIDES[side].add}</span>
                <span className="nl-meta">{nd(TEST_FILE_SIDES[side].stages[0].says)}</span>
              </button>
            ))}
        </div>
      </Section>

      <Section
        title={
          <>
            {everyone ? "Everyone's Test Files" : "Your Test Files"} {data && <span className="nl-count">{files.length}</span>}
          </>
        }
        aside={
          data?.owner && (
            <label className="nl-adm-check">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              Show every tester&apos;s
            </label>
          )
        }
      >
        {!data && !error ? (
          <Loading what="Reading the test files…" />
        ) : !data ? null : files.length === 0 ? (
          <p className="nl-empty">{closed ? "No test files." : "No test files yet. Add one above."}</p>
        ) : (
          <ul className="nl-adm-rows">
            {files.map((f) => {
              const stages = TEST_FILE_SIDES[f.side].stages;
              const chosen = pick[f.id] ?? stages[0].id;
              const target = stages.find((s) => s.id === chosen) ?? stages[0];
              const mine = f.byEmail === data?.me;
              const doors = f.canRelink && mine ? (f.side === "tenancy" || f.side === "e2e" ? (["landlord", "tenant"] as const) : [f.side === "tenant" ? ("tenant" as const) : ("landlord" as const)]) : [];
              return (
                <li key={f.id}>
                  <div className="nl-adm-row-main">
                    <div className="nl-adm-row-line">
                      <span className="nl-strong">{f.name}</span>
                      <Badge tone={SIDE_TONE[f.side]} bare>
                        {TEST_FILE_SIDES[f.side].label}
                      </Badge>
                      <Badge tone="neutral">{`At: ${f.stageLabel}`}</Badge>
                    </div>
                    <p className="nl-meta">
                      {mine ? "Yours" : f.byName}, made {when(f.createdAt)}
                    </p>
                    <p className="nl-meta">{nd(done[f.id] ?? f.said)}</p>
                    {(f.links.length > 0 || doors.length > 0) && (
                      <div className="nl-adm-row-acts">
                        <div className="nl-adm-doors">
                          {f.links.map((l) => (
                            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="nl-adm-chip">
                              <Badge tone="neutral">{WHO_WORDS[l.who]}</Badge>
                              <span>{l.label}</span>
                            </a>
                          ))}
                          {/* A live tenancy is both people, so it gets both doors. */}
                          {doors.map((as) => (
                            <button
                              key={as}
                              type="button"
                              disabled={busy !== null}
                              className="nl-adm-chip"
                              onClick={() =>
                                void act(`relink:${f.id}:${as}`, { action: "relink", id: f.id, as }, (j) => {
                                  if (typeof j.url === "string") window.open(j.url, "_blank", "noreferrer");
                                })
                              }
                            >
                              <Badge tone="warning">{as === "tenant" ? "Tenant" : "Landlord"}</Badge>
                              <span>{busy === `relink:${f.id}:${as}` ? "Making a link…" : as === "tenant" ? "Open the tenant area as them" : "Open the landlord portal as them"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {!closed && (
                    <div className="nl-adm-row-side">
                      <label className="sr-only" htmlFor={`stage-new-${f.id}`}>
                        Reset to
                      </label>
                      <span className="nl-fsel">
                        <select id={`stage-new-${f.id}`} value={chosen} onChange={(e) => setPick((x) => ({ ...x, [f.id]: e.target.value }))}>
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </span>
                      <button
                        type="button"
                        disabled={busy !== null}
                        title={target.says}
                        className="nl-btn nl-btn--secondary nl-btn--sm"
                        onClick={() => {
                          if (!window.confirm(`Reset ${f.name} to "${target.label}"?\n\n${target.says}\n\nEverything done on this file since is taken away, including queued emails and diary entries. Nothing is emailed.`)) return;
                          void act(`reset:${f.id}`, { action: "reset", id: f.id, stage: target.id }, () => setDone((d) => ({ ...d, [f.id]: `Reset to ${target.label}. ${target.says}` })));
                        }}
                      >
                        {busy === `reset:${f.id}` ? "Resetting…" : "Reset"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        className="nl-btn nl-btn--quiet nl-btn--sm"
                        onClick={() => {
                          if (!window.confirm(`Delete ${f.name}, and everything done on it?`)) return;
                          void act(`delete:${f.id}`, { action: "delete", id: f.id });
                        }}
                      >
                        {busy === `delete:${f.id}` ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {data?.owner && (
        <Section title="Launch">
          <p className="nl-meta">
            For every tester at once. Test files are deleted with everything done on them, except the Landlord E2E and Tenant E2E pairs, which stay for showing the process. What was tested, and what failed, stays on the Core for Launch list.
          </p>
          <div className="nl-adm-row-acts">
            <button
              type="button"
              disabled={busy !== null}
              className="nl-btn nl-btn--secondary nl-btn--sm"
              onClick={() => {
                if (!window.confirm("Give everyone with an account a Landlord E2E and Tenant E2E pair on their own email?\n\nAnyone who already has one is left as they are.")) return;
                void act("e2e-everyone", { action: "e2e-everyone" }, (j) => {
                  const made = Number(j.made ?? 0);
                  setDone((d) => ({ ...d, everyone: `${made} ${made === 1 ? "pair" : "pairs"} made.${j.skipped ? ` ${String(j.skipped)}` : ""}` }));
                });
              }}
            >
              {busy === "e2e-everyone" ? "Making…" : "Give Everyone an E2E Pair"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              className="nl-btn nl-btn--secondary nl-btn--sm"
              onClick={() => {
                if (!window.confirm("Remove every tester's test files, and everything done on them? Testing stays open.")) return;
                void act("remove-all", { action: "remove-all" });
              }}
            >
              {busy === "remove-all" ? "Removing…" : "Remove All Testing"}
            </button>
            {!closed && (
              <button
                type="button"
                disabled={busy !== null}
                className="nl-btn nl-btn--sage nl-btn--sm"
                onClick={() => {
                  if (!window.confirm("Ready for launch?\n\nEvery tester's test files are removed, and nobody can make new ones until an owner reopens testing.")) return;
                  void act("ready", { action: "ready" });
                }}
              >
                {busy === "ready" ? "Closing…" : "Ready for Launch"}
              </button>
            )}
          </div>
          {done.everyone && <p className="nl-meta nl-adm-after">{nd(done.everyone)}</p>}
        </Section>
      )}
    </div>
  );
}
